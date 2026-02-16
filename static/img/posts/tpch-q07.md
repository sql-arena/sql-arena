---
title: "TPC series - TPC-H Query 7 - Optimiser Reasoning"
date: "2025-11-26"
tags: 
  - "performance"
  - "query-planning"
  - "tpch"
---

It is time to resume the TPC-H series and look at Query 7.

We will learn about how query optimisers can decompose filters and reason about
the structure of expressions to reduce join work.

This query is also a good way to teach us about how query optimisers use statistics and
constraints.

This is the first blog where we can now use [SQL Arena](http://www.sql-arena.com) to look at
query plans.
The SQL Arena is an ongoing project where I am using the tooling I have written to generate
comparable query plans between various database engines. 
All the work is open source, details in the link above.

# Query 7
Here is the query, pay special attention to the filter on `n1` and `n2` (both aliases to
`nation`)

```sql
SELECT supp_nation,
       cust_nation,
       l_year,
       SUM(volume) AS revenue
FROM (SELECT n1.n_name                          AS supp_nation,
             n2.n_name                          AS cust_nation,
             EXTRACT(YEAR FROM l_shipdate)      AS l_year,
             l_extendedprice * (1 - l_discount) AS volume
      FROM tpch.lineitem
      INNER JOIN tpch.supplier ON l_suppkey = s_suppkey
      INNER JOIN tpch.nation n1 ON s_nationkey = n1.n_nationkey
      INNER JOIN tpch.orders ON l_orderkey = o_orderkey
      INNER JOIN tpch.customer ON o_custkey = c_custkey
      INNER JOIN tpch.nation n2 ON c_nationkey = n2.n_nationkey
      WHERE (
              (n1.n_name = 'FRANCE' AND n2.n_name = 'GERMANY')
              OR (n1.n_name = 'GERMANY' AND n2.n_name = 'FRANCE')
            )
        AND l_shipdate BETWEEN '1995-01-01' AND '1996-12-31') AS shipping
GROUP BY supp_nation,
         cust_nation,
         l_year
ORDER BY supp_nation,
         cust_nation,
         l_year;
```

## Logical Reasoning about Expressions

Before we jump to our usual selectivity analysis, we must first look at closer at the filter
in the query.

What can we infer from this expression:

```sql
  (n1.n_name = 'GERMANY' AND n2.n_name = 'FRANCE')
OR 
  (n1.n_name = 'FRANCE' AND n2.n_name = 'GERMANY')
```

We can see that irrespective of which part of the `OR` we look at, it **must** be the case that
we only want `customer` (via `n2`) that are in **GERMANY** or **FRANCE**. 
Similarly, we can know that we can only want `supplier` (via `n1` in either) **GERMANY** or **FRANCE**.

However, at first glance it appears that we must defer the combined check for the `OR` until later in the query
when we recombine rows from `supplier` and `customer`. 

In other words, we can say the following:

- Only pick `supplier` in **FRANCE** and **GERMANY** 
- Only pick `customer` in **FRANCE** and **GERMANY**
- Once we have those in the same row, combine the results to evaluate the `OR` filter.

Exercise for the reader at this point: Can we do better than this?

## Selectivity

We can now do our usual selectivity analysis.

| Filter                                             | Selectivity | Cardinality |
|----------------------------------------------------|------------:|------------:|
| `n1.n_name IN ('GERMANY', 'FRANCE)` (customer)     |          8% |           2 |
| `n2.n_name IN ('GERMANY', 'FRANCE)` (supplier)     |          8% |           2 |
| `l_shipdate BETWEEN '1995-01-01' AND '1996-12-31'` |         28% |        1.7M | 

## Join Order
With knowledge of the selectivity, we can use our heuristics from previous blogs to find the optimal join order.

We know that `lineitem` is the largest table, even after we apply the filter on `l_shipdate`.
That means `lineitem` should be used to probe into hash tables (or loop look into B-trees)
from the other tables in the query.

### Inferring Filter Selectivity on `orders`

Our filters on `nation` results in reductions in `customer` -
which in turn will result in the same reduction of `orders`.
How can we know this?

- There is a primary key from `customer` to `nation` 
- We know that `n_nationkey` is a key - so it must have the same cardinality as `nation` (25 different rows, we pick 2)
- Since there is a foreign key from `customer` to `nation` via `c_nationkey` we know that `c_nationkey` in `customer` 
  is a subset of all `n_nationkey`.
- If we have distinct values stats (sorry Iceberg people),
  then we can know there are 25 distinct values in `c_nationkey`.
  The same number of distinct values as we have in `n_nation`
- If we also have histograms (again, sorry Iceberg), we can know that the distribution of `c_nationkey` 
  is roughly uniform. 
- That means that picking two nations in `n1` will result in a 2/25 reduction to `customer` via `c_customerkey`
  because all data is uniform.
- We can use the same reasoning to infer that these two nations (via their transitive closure of primary/foreign keys) 
  must result in the same reduction into `orders`
- Hence, it must be the case that the 8% filter on `n1` (=`nation`) is *also* an 8% filter on `orders`

Read that again! 
Did you see what we were able to do? 
By using primary and foreign keys as well as statistics, the 
query optimiser was able to infer what effects filters on one table have on other tables in the same query.

With this inference, we now know that `orders`, after we apply the filter via `nation` (alias `n1`) becomes an even 
smaller stream. 
Since `orders` is large table, we should probably reduce the rows in `orders` (via the join to `customer` -> `nation`) 
before joining to `lineitem`. 
Always push filters as deep as possible in the plan.

Or should we?...

### Inferring the Filter Selectivity on `lineitem`

Using exactly the same line of reasoning as for `orders` we can infer what happens with the filter from `nation` 
(alias `n2`) via `supplier` to `lineitem`

By joining via `nation` --> `supplier` --> `lineitem` we have reduced the stream by 8%. 
But we've already reduced the stream by `28%` via the filter on `l_shipdate`.

The optimiser must now make a challenging decision. 
What is the combined selectivity of the two filters?
There are a few ways the optimiser can make an educated guess:

1) The selectivity of filters is the product of the filter (i.e. the answer is 2% = 28% * 8%)
2) The selectivity of the filters is the largest (i.e. the answer is 8%)
3) The selectivity is some progression of filters with each new filter becomes less valuable than the previous one
4) The selectivity of the combined filter can perhaps be known through composite statistic
5) I will eventually learn this selectivity by running some queries and adapting to the conditions

Of these methods, the most common are the first 3. 
But some databases allow composite stats (option 4) to get a good answer for filters that typically occur together.
PostgreSQL has supported these kinds of composite statistics since version 14, 
SQL Server has had them since around the year 1997. 
Many cloud databases don't have this feature yet.

Fortunately for most query engines - TPC-H uses very friendly filters they behave nicely when you
combine them.
All filters are completely uncorrelated, so method 1 is good enough to deliver a decent estimate.

The actual selectivity of `lineitem` once all filters have been applied is 2%.
Since `lineitem` is related to `orders` via a primary/foreign key - the optimiser knows that reducing `lineitem` to
2% of the rows will result in the same reduction to `orders`. 
It can know this using similar reasoning that we've seen before.

Since a reduction to 2% is better than the 8% reduction we get via `nation` --> `customer` --> `orders` it is *better*
to join `lineitems` with `orders` *before* joining to `customer`.

### Summarising the best Query Plan (so far)

We now know what the best join order is for Q07 if we want to minimise the amount of join operations (which we do).

- Scan or seek `lineitem` taking the filter on `l_shipdate`
- Reduce `lineitem` by joining to `supplier` and then `nation` taking the filter on `n_name` 
  (for a total reduction to 2%)
- Using this stream, join to `orders`, reducing orders to the same 2%
- Finally, join to `customer` and then `nation` to take the last 8% reduction

## Analysing some real plans

Now that SQL Arena is in alpha, you can actually explore query plans for Q07 here: 

- [TPC-H Q07 in SQL Arena](https://www.sql-arena.com/components/plan/theorems/tpch-q07.html)

Let us start with the friend I have a love/hate relationship to: PostgreSQL

### The PostgreSQL Q07 Plan — and DuckDB

The plan looks like this:

```
Estimate    Actual  Operator
    5728         4  GROUP BY SORT n_name, n_name, EXTRACT(EXTRACT(YEAR FROM  l_shipdate) AGGREGATE SUM(l_extendedprice * ('1' - l_discount))
    7160      5455  SORT n_name, n_name, EXTRACT(EXTRACT(YEAR FROM  l_shipdate)
    7160      5455  INNER JOIN HASH ON o_custkey = c_custkey AND (((n_name = 'GERMANY') AND (n_name = 'FRANCE')) OR ((n_name = 'FRANCE') AND (n_name = 'GERMANY')))
    5000     11905  │└INNER JOIN HASH ON c_nationkey = n_nationkey
       2         2  │ │└TABLE SCAN n2 WHERE (n_name = 'FRANCE') OR (n_name = 'GERMANY')
   62500    150000  │ TABLE SCAN customer
  172050    134160  INNER JOIN LOOP ON o_orderkey = l_orderkey
  172050    134160  │└INNER JOIN HASH ON l_suppkey = s_suppkey
    4000      3925  │ │└INNER JOIN HASH ON s_nationkey = n_nationkey
       2         2  │ │ │└TABLE SCAN n1 WHERE (n_name = 'GERMANY') OR (n_name = 'FRANCE')
   10000     10000  │ │ TABLE SCAN supplier
 2156855   1715150  │ TABLE SCAN lineitem WHERE (l_shipdate >= '1995-01-01') AND (l_shipdate <= '1996-12-31')
  134158    134158  TABLE SEEK orders
```

For once, PostgreSQL does really well — this is a pretty good plan!
You will notice how PostgreSQL correctly finds the join to `orders` before it joins to `customer`. 
While the statistics are a little bit off on the `lineitem` scan estimate, we're certainly in the right ballpark.

Well-done PostgreSQL! Good database!

DuckDB makes the same plan, but it decides to scan `orders` instead of seeking it - 
resulting in a higher join count (3.3M joins for DuckDB vs 2.1 for PostgreSQL).
This is a classic tradeoff where Duck decides (probably correctly because of its fast, vectorised engine) that hash 
joining is just better than looping.

### The SQL Server Q07 Plan

SQL Server has an extra trick up its sleeve. 
The plan looks like this:

```
Estimate    Actual  Operator
       2         4  SORT n_name, n_name, Expr1011
       2         4  PROJECT CASE WHEN Expr1019 = 0 THEN NULL ELSE Expr1020 END AS Expr1013
       2         4  GROUP BY HASH AGGREGATE COUNT(Expr1014) AS Expr1019, SUM(Expr1014) AS Expr1020
    9207      5457  INNER JOIN HASH ON n_nationkey as n_nationkey = c_nationkey AND c_custkey = o_custkey
   67988    134158  │└INNER JOIN MERGE ON o_orderkey = l_orderkey
 1500000   1499985  │ │└TABLE SEEK orders
   67988    134158  │ SORT l_orderkey
   67988    134158  │ INNER JOIN HASH ON s_suppkey = l_suppkey
     400       785  │ │└INNER JOIN HASH ON n_nationkey as n_nationkey = s_nationkey
       1         2  │ │ │└INNER JOIN LOOP ON n_name = 'FRANCE' OR n_name = 'GERMANY'
       2         4  │ │ │ │└TABLE SEEK nation WHERE n_name = 'FRANCE' OR n_name = 'GERMANY'
       2         2  │ │ │ TABLE SEEK nation WHERE n_name = 'FRANCE' OR n_name = 'GERMANY'
   10000     10000  │ │ TABLE SEEK supplier
 1699860   1715148  │ PROJECT datepart(EXTRACT(YEAR FROM l_shipdate) AS Expr1011, l_extendedprice * (1. - l_discount) AS Expr1014
 1699860   1715148  │ TABLE SCAN lineitem WHERE l_shipdate >= '1995-01-01' AND l_shipdate <= '1996-12-31'
  150000    150000  TABLE SEEK customer
```

First, notice how tight those scan estimates are.
SQL Server makes great use of histograms to estimate the cardinality of the `l_shipdate` filter.

But what is going on with the join to `nation`? 
I had to stare at that one for a bit before it dawned on me. 
Rarely do I get surprised by query planners - but this little trick was a real delight to see.

What SQL Server realises (from simple, algebraic reasoning) is that this join has an upper
boundary on the number of rows it can produce:

```sql
SELECT n1.n_nationkey, n1.n_name, n2.n_nationkey, n2.n_name  
FROM tpch.nation AS n1
CROSS JOIN tpch.nation AS n2
WHERE (
       (n1.n_name = 'GERMANY' AND n2.n_name = 'FRANCE')
    OR (n1.n_name = 'FRANCE' AND n2.n_name = 'GERMANY')
    );
```
Because we are looking for the *same* nation in `n1` and `n2` and because the `n_name` is unique, it must
be the case that only two rows come out of this join.

Once we know that, we can join "early" to both `n1` and `n2` - before we even join to `orders` and `customer`.
We can then use that joined result (that now includes `n_name`) to filter down `orders` later in the *same* join we 
use for `customer`, namely in this, combined join condition:

```sql
INNER JOIN HASH ON n_nationkey as n_nationkey = c_nationkey AND c_custkey = o_custkey
```

Clever indeed...

### ClickHouse

ClickHouse is a wickedly fast database with an impressive execution engine.
It is the latest member of the SQL Arena.
Unfortunately for ClickHouse - its planner is quite primitive.
Here is that query plan it makes:

```
Estimate    Actual  Operator
       -        50  PROJECT SUM(volume)
       -        50  SORT supp_nation, cust_nation, l_year
       -        50  GROUP BY HASH supp_nation, cust_nation, l_year AGGREGATE SUM(volume)
       -   1537150  PROJECT EXTRACT(YEAR FROM l_shipdate), n_name, n_name, 1 - l_discount, EXTRACT(YEAR FROM l_shipdate), l_extendedprice * (1 - l_discount), l_extendedprice * (1 - l_discount)
       -   1537150  FILTER (((n_name = 'GERMANY') AND (n_name = 'FRANCE')) OR ((n_name = 'FRANCE') AND (n_name = 'GERMANY'))) AND ((l_shipdate >= '1995-01-01') AND (l_shipdate <= '1996-12-31'))
       -   1537150  INNER JOIN HASH ON c_nationkey = n_nationkey
       -        25  │└TABLE SCAN nation
       -   1550168  INNER JOIN HASH ON s_nationkey = n_nationkey
       -        25  │└TABLE SCAN nation
       -   1550168  INNER JOIN HASH ON o_custkey = c_custkey
       -    150000  │└TABLE SCAN customer
       -   1550197  INNER JOIN HASH ON l_suppkey = s_suppkey
       -     10000  │└TABLE SCAN supplier
       -   1550346  INNER JOIN HASH ON l_orderkey = o_orderkey
       -   1500000  │└TABLE SCAN orders
       -   1715148  TABLE SCAN lineitem WHERE (l_shipdate >= '1995-01-01') AND (l_shipdate <= '1996-12-31')
```

You will notice that there are no estimated rows. 
Apparently, ClickHouse only estimates cardinality of table scans and only provides block level
estimates.

Also, remember how we discussed left deep trees in the [Q03 blog entry](tpch-q03.md)? 
ClickHouse appears to only search for left deep plans. 
The filter on `n_name` does not get evaluated until the very last minute, namely here:

```
FILTER (((n_name = 'GERMANY') AND (n_name = 'FRANCE'...
```

When a query planner cannot do the basic tricks, the result is dramatic. 
ClickHouse ends up doing 7.9M joins, as compared to only ~2M for SQL Server and PostgreSQL. 
4x more work because the query plan is missing "tricks".
Brute force gets you far — but you need 4x more brute for a query like this.

# Summary

Today we've seen how query optimisers can rewrite expressions and move filters around in the plan.
We saw how advanced statistics, such as those used by SQL Server and PostgreSQL allow the optimiser
to reason about the query and reduce the number of rows that need to be joined.

Recently, I've been involved in a lot of chatting on LinkedIn discussing query planners. 
It appears that many people believe that query planning is a "solved problem". 
But today, we saw that even very modern databases are still missing a lot of query planning
tricks which have been around in query planners for 30 years.
These tricks have a large impact on the amount of work the query needs to perform, in the case
of ClickHouse a nearly 4x increase.
