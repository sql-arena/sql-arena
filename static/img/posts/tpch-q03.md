---
title: "TPC-H series - TPC-H Query 3 - Join Ordering and Heap Sorting"
date: "2025-09-10"
tags: 
  - "performance"
  - "query-planning"
  - "tpch"
  - "query-optimisation"
---

I want to teach you an important skill that will serve your well as a database specialist.
One blog entry is not going to be enough, but here is my goal:

When you look at an SQL query in the future, you should be able to answer this question:
"What query plan do I *want* this query to have?"
You will also be able to make an educated guess about what join order is best.
As you hoard optimisation tricks in your arsenal - you will also be able to make guesses about what additional tricks
the database could play (and you can force those tricks if the database does not do it for you).

Queries can be incredibly complex and still work very well, the beauty of SQL.
But, no matter the complexity - the method I'm going to teach you will allow you to reason about the query.
It starts with the selectivity of filters and Query 3 from TPC-H is a good way to illustrate it.

# The Query
First, let us look at TPC-H Query 3, the one we will analyse today.

```sql
SELECT l_orderkey,
       SUM(l_extendedprice * (1 - l_discount)) AS revenue,
       o_orderdate,
       o_shippriority
FROM tpch.lineitem
INNER JOIN tpch.orders
  ON l_orderkey = o_orderkey
INNER JOIN tpch.customer
  ON o_custkey = c_custkey
WHERE c_mktsegment = 'MACHINERY'
  AND o_orderdate < '1995-03-15'
  AND l_shipdate > '1995-03-15'
GROUP BY l_orderkey,
         o_orderdate,
         o_shippriority
ORDER BY revenue DESC,
         o_orderdate
LIMIT 10

```

# Join Ordering
We see three filters:

- `c_mktsegment = 'MACHINERY'`
- `o_orderdate < '1995-03-15'`
- `l_shipdate > '1995-03-15'`

First, let us define the term "Selectivity":

**Selectivity of F on T** :== The percentage of rows matching F in the table T

We can measure the selectivity of these filters by executing a query like this:

```sql
SELECT SUM(CASE WHEN l_shipdate > DATE '1995-03-15' THEN 1.0 END) / COUNT(*) AS selectivity
FROM tpch.lineitem
```

That gives us the following table (where **Rows** is the rows coming out of the table after the filter):

| Table      | Filter                       | Selectivity | Rows |
|------------|------------------------------|------------:|-----:| 
| `lineitem` | `l_shipdate > '1995-03-15'`  |         57% | 3.4M |
| `orders`   | `o_orderdate < '1995-03-15'` |         45% | 686K |
| `customer` | `c_mktsegment = 'MACHINERY'` |         20% |  30K |

## What are we optimising for?
When a query optimiser looks for join orders - it tries to optimise two major things:

1) Minimise the total number of rows that must be joined
2) Minimise memory usage of the query

### Minimising Rows Joined
Every row we don't have to join is less work for the query to perform.
Recall that joining to a table that has a filter will typically result in an output that is smaller than either input.

For example: `customer` is uniformly used for all `orders`.
Since we're only picking 20% of all customers, the join`orders JOIN customer ON o_custkey = c_custkey` will result in
an output of only 20% of the total orders.
We can use this information to calculate the expected number of joins:

#### Plan 1 — The naive approach

Since `orders` is the table connection the two other tables together, let us first consider this plan:

1) Build a hash table over `customer` (containing `c_custkey`)
2) Build a hash table over `lineitem`
3) Scan `orders`, look into hash table over `lineitem` from step 2 matching `o_orderkey`
4) Using this result, look into hash table over `customer` with `o_custkey`

We know that scanning `lineitem` with the filter on `l_shipdate` will result in 3.4M rows.
We can now calculate how many joins the plan must do:


| Input Rows | Operation                    | Number of Joins | Resulting Rows     |
|------------|------------------------------|----------------:|--------------------| 
| 686K       | `orders JOIN hash(lineitem)` |            686K | 57% of 686K ~ 391K |
| 391K       | `JOIN hash(customer)`        |            391K | 20% of 391K ~  78K |

Total number of joins: 686K + 391K = ~1M

#### Correlation and uniformity
Readers paying close attention will have noticed something off about this line of reasoning.

We are making an implicit assumption about independence between the `lineitems` and the `orders` we are joining.
The calculations for the filter of 45% of orders are implicitly assuming that the filter `l_shipdate > '1995-03-15'`
is independent of the filter `o_orderdate < '1995-03-15'`.
But this is not the case — not even in a synthetic dataset like TPC-H.
An order cannot have a ship date *before* its order date.
We should also assume (and this is true in TPC-H) that `o_orderdate` is close in time to `l_shipdate`.
The two columns are correlated — which means that we cannot just multiply the filters to get the combined selectivity!

Very few query optimisers understand this correlation, and most will make the assumption of filter independence.
However, some modern optimisers can learn this correlation by looking at samples of data.
Armed with this knowledge, the optimiser can then make smarter choices when ordering joins.


#### Plan 2 — Taking the `customer` filter earlier

Recall that joining `customer` to `orders` results in a 20% reduction of rows - we only keep every fifth order.
In general, we want to "take the filters early" and join to tables that have highly selective filters before
joining to other tables.

We can calculate what happens if we join `customer` before `lineitem`:


| Input Rows | Operation                    | Number of Joins | Resulting Rows     |
|------------|------------------------------|----------------:|--------------------| 
| 686K       | `orders JOIN hash(customer)` |            686K | 20% of 686K ~ 137K |
| 137K       | `JOIN hash(lineitem)`        |            137K | 57% of 137M ~  78K |

Total number of joins: 686K + 137K ~ 0.8M

This is better than Plan 1.

**Takeaway:** When picking join orders, put tables with highly selective filters deeper in the join tree.

### Minimising Memory Usage and Hashing
Minimising the total number of joins is typically the priority of the optimiser.
However, sometimes a plan exists that consumes significantly less memory — at the expense of more joins.

Building a large hash table is also expensive — so the optimiser tries to avoid that as well.

Joining from a primary key to a hash of a foreign key - we will often find more than one match in the hash table.
Emitting all the matches requires us to loop over them (this is sometimes called: "Walking the chain").
This loop has a non-trivial CPU cost, it can be almost as expensive as looking into the hash table.

Is there a better plan than Plan 1 and Plan 2?

### Plan 3: Reducing memory, hash table sizes and chain walking
Let us remind ourselves of what we know so far:

- We know that scanning `lineitem` with the filter on `l_shipdate` results in 3.4M rows.
- From `lineitem`, we need these columns in the hash table:
  - `l_discount` (numeric, ~8B)
  - `l_orderkey` (4B)
  - `l_extendedprice` (numeric, ~8B)
  - Total: 20B
  - We can do better, by precalculating `l_extendedprice * (1 - l_discount)`, which brings us to **12B**

That means we need 3.4M * 12B ~ 40MB to build the hash table over `lineitem`. We also need to construct the hash table
in the first place — which isn't free.

Consider the alternative, building the hash table over `orders` instead and probing with `lineitem`

- Scanning `orders` with the filter on `o_orderdate` results in 686K rows
- Building a hash table over `orders` requires three columns:
  - `o_orderkey` (4B)
  - `o_shippriority` (15B)
  - `o_orderdate` (~4B)
  - Total: ~23B

The total size of the hash table is now: 686K * 23B ~ 16MB.
This is a significant, 3x reduction in memory.
Of course, now we need to join the 3.4M rows coming out of `lineitem` with `orders` and then `customer` - which is
roughly 4x more joins.

The tradeoff optimisers pick generally favour smaller hash tables over lower join counts — if everything else is equal.

The reason the tradeoff is done this way is:

- Small hash tables have better cache locality
- Less memory is better for concurrency (fewer queries touching disk)
- Building a hash is more expensive (per row) than probing it.
  - When joining two tables, it is generally cheaper to build a hash on the smaller and do more probes from the bigger
- Joining from a foreign key (=bigger table) into a hash of a primary key (=smaller table) avoids "walking the hash chain"

How much we value memory over joins and how expensive it is to build large hash tables is ultimately a calibration
problem that the designers of the databases must struggle with.
Often, databases will have multiple hash table implementations to optimise for different scenarios.

See [What is Cost in a Query Planner](what-is-cost-in-a-query-planner.md) for more information.

## Left deep trees and a Heuristic
All the plans we've seen so far are what query optimisers call "left deep trees".

Plan 1 (naive, but educational approach)

```
JOIN
│└SCAN customer
JOIN
│└SCAN lineitem
SCAN orders
```

Plan 2 (taking `customer` filter earlier):
```
JOIN
│└SCAN lineitem
JOIN
│└SCAN customer
SCAN orders
```

Plan 3: (Reducing memory and build sizes)
```
JOIN
│└SCAN customer
JOIN
│└SCAN orders
SCAN lineitem
```

These trees are left deep - flat.
It is just a chain of joins, one after the other with all the hash table being
added as we go up the tree.

You will note that `N!` (with `N` being a number of tables in the query) left deep plans exist.
When the number of joins in a query goes large - this number becomes gigantic.

However, we can always pick a plan that isn't "completely horrible" by applying this heuristic:

- Put the largest table (after filters) at the bottom of the tree
  - Minimising build memory
  - This is called the "driving table."
- Construct the tree by adding tables to the build side of hash join and probing with the driving table.
  - At each step, pick the table that has the most selective filter that hasn't been joined yet

For star schemas, this heuristic works very well and is guaranteed to find a plan that isn't horrible.

Additional optimisations to this heuristic exist (particularly when databases can de bloom filters).
We will get to that in a later blog entry.

<aside>
<b>Another reason Data Vault is stupid</b>

A data modelling technique exists called "Data Vault", which produces these enormous schemas
with lots of little tables that must be joined together to construct the reporting data.
Often, the table end up with odd filters too (with `BETWEEN` filters on dates)

These schemas are extremely hard for query optimisers to deal with.
The optimisers struggle to estimate the cardinality of both scans and join.
They can't apply the usual heuristic of finding a decent, left deep tree.

The schemas are also hard for humans to reason about when you need to join all the data back together.
They can only come into existence in the first place if advised by people who don't understand query
optimisers.
Because if you fully understood query optimisers, you wouldn't engage in this madness.
Once things *do* go wrong with query optimisation of Data Vault queries - as they always do - you will
now have to bring in query optimisation experts.

...And we aren't cheap...
</aside>

## Plan 4 — Bushy
There exists a plan that is superior to everything we've seen so far.

It looks like this:

```
JOIN
│└JOIN
│ │└SCAN customer
│ SCAN orders
SCAN lineitem
```

Here, we first build a hash table over `customer`. We then JOIN into that hash table with `orders`.

Recall than 686K rows come out of `orders` and after joining with `customer` we only have 137K rows left.

We can then build a hash table on those rows, which only needs to contain

- `o_orderkey` (4B)
- `o_shippriority` (15B)
- `o_orderdate` (~4B)
- Total: ~23B

This hash table is only 137K * 23B ~ 1.2MB.
This is >10x less memory than our previous best of 16MB. And a 1.2MB hash table *easily* fits in L2/L3 cache.

This plan is no longer "left deep". 
It is what optimisers call "bushy".
We're using the result of a previous join to construct a hash table used in a later join.


# Actual Plans
My TPC-H series would not be complete if I didn't show you some real life examples.
I'm heading on holiday, so I only had time to run tests on three databases that I happened to have handy.

These are:

- ClickHouse
- DuckDB
- PostgreSQL

Let us see how they fare on TPC-H Query 3.

## ClickHouse
Unfortunately, Clickhouse has extremely poor query plan instrumentation.
I haven't found a way to get actual and estimates from each operator in the plan.

We can only get the plan it will run — not any idea why it picked it.
Fortunately, we already know which plan is best.

Here is what ClickHouse does:

```
LIMIT 10
SORT sum(multiply(l_extendedprice, minus(1_UInt8, l_discount)))...o_orderdate...
GROUP BY HASH (l_orderkey...o_orderdate..., o_shippriority...) AGGREGATE ()
INNER JOIN HASH ON (o_custkey) = (c_custkey)...
│└SCAN tpch.customer
INNER JOIN HASH ON (l_orderkey) = (o_orderkey)...
│└SCAN tpch.orders
SCAN tpch.lineitem
```

This is, to put it mildly, extremely disappointing. 
ClickHouse is not able to find the bushy plan and instead relies
on Plan 3.

## DuckDb

From previous blogs, we've come to expect a lot from DuckDB. And it doesn't disappoint:

```
Estimate    Actual  Operator
      10        10  LIMIT 10
      10        10  SORT sum((duck.tpch.lineitem.l_extendedprice * (1 - duck.tpch.lineitem.l_discount)))...
   63403     10768  GROUP BY HASH (#0...#1..., #2...) AGGREGATE (sum(#3)...)
   63404     28562  INNER JOIN HASH ON l_orderkey = o_orderkey...
   78825    136810  │└INNER JOIN HASH ON o_custkey = c_custkey...
   37500     30088  │ │└FILTER ((c_custkey >= 3))
   37500     30089  │ │ SCAN customer WHERE c_mktsegment='MACHINERY'...
  300000    686333  │ FILTER ((o_custkey <= 149999))
  300000    686333  │ SCAN orders WHERE o_orderdate<'1995-03-15'::DATE...
 1200020   3396330  SCAN lineitem WHERE l_shipdate>'1995-03-15'::DATE...
```

*Note: I removed the project nodes from the plan above to increase readability*

DuckDB not only finds the optimal plan, it also knows something interesting about the data: Namely that there are no
`order` values with customer keys under 3. It can then prefilter those (not a big win, but pretty cute).

Interestingly, DuckDB does very poorly on estimation.
It lacks proper histograms on the columns, and it really struggles to estimate selectivity of inequalities
in `o_orderdate` and `l_shipdate`.

## PostgreSQL
Like DuckDB, PostgreSQL finds the optimal plan:

```
Estimate    Actual  Operator
      10        10  LIMIT 10
  311163        10  SORT (sum((lineitem.l_extendedprice * ('1'::numeric - lineitem.....
  311163     10768  GROUP BY SORT (lineitem.l_orderkey...orders.o_orderdate..., orders.o_shippriority...) AGGREGATE (sum
((lineitem.l_extendedprice * ('1'::numeric - lineitem.l_discount))))
  388955     28560  SORT lineitem.l_orderkey...orders.o_orderdate..., orders.o_shippriority...
  388955     28560  INNER JOIN HASH ON lineitem.l_orderkey = orders.o_orderkey...
  221225    136810  │└INNER JOIN HASH ON orders.o_custkey = customer.c_custkey...
   12546     30089  │ │└SCAN customer WHERE ((customer.c_mktsegment)::text = 'MACHINERY'::text)...
 1102085    686375  │ SCAN orders WHERE (orders.o_orderdate < '1995-03-15'::date)...
 4253660   3396385  SCAN lineitem WHERE (lineitem.l_shipdate > '1995-03-15'::date)...
```

PostgreSQL does even worse than DuckDB on estimation - which is surprising given that it has histograms and MCV.

## Heap Sorting - PostgreSQL fails ... again...
Both DuckDB and PostgreSQL find the optimal join order.

But compare what happens after the joins are done running.

DuckDb:

```
Estimate    Actual  Operator
      10        10  LIMIT 10
      10        10  SORT sum((duck.tpch.lineitem.l_extendedprice * (1 - duck.tpch.lineitem.l_discount)))...
   63403     10768  GROUP BY HASH (#0...#1..., #2...) AGGREGATE (sum(#3)...)
```

PostgreSQL does this:

```
Estimate  Actual  Operator
    10        10  LIMIT 10
311163        10  SORT (sum((lineitem.l_extendedprice * ('1'::numeric - lineitem.....
311163     10768  GROUP BY SORT (lineitem.l_orderkey...orders.o_orderdate..., orders.o_shippriority...) AGGREGATE (sum
((lineitem.l_extendedprice * ('1'::numeric - lineitem.l_discount))))
388955     28560  SORT lineitem.l_orderkey...orders.o_orderdate..., orders.o_shippriority...
```

PostgreSQL does a *sort* of the join result.
A total of 10678 of rows are sorted on Scale Factor 1.
DuckDB realises that if you have 10678 rows, building a hash table is trivial and much, much faster.
Duck goes for **O(n)** instead of **O(n * log(n))**.

PostgreSQL runs the kind of algorithms a mainframe used to run — when they had 1MB of DRAM and you weren't
sure if 10000 rows could fit in memory.

To handle the `LIMIT` operator, DuckDb uses an algorithm called "heap sort" to optimise the query.
TPC-H explicitly looks for this optimisation — and PostgreSQL fails the test.

### Heap sort — the short story
Recall that the query ends like this:

```sql
ORDER BY revenue DESC,
         o_orderdate
LIMIT 10
```

We only want 10 rows, but the input to the ordering is in the thousands.

You implement this by using a [heap sort](https://en.wikipedia.org/wiki/Heapsort) but where you discard any new elements
that are smaller than the largest 10 you already have.

This is both more memory effective and much more CPU efficient than doing a full sort that PostgreSQL does.

# Summary
Today, we analysed TPC-H Query 3.
I showed you how query optimisers pick join orders and how this query looks for a bushy plan.

We also saw that when you have a query of the form `ORDER BY ... LIMIT N` you really want to use a
heap sort to optimise it.

Finally, we saw how three different databases fared on the query with DuckDB doing best.

The full series:

- [TPC-H Series](/analysis/)
