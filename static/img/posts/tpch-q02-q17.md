---
title: "TPC series - TPC-H Query 2 and 17 - De-correlation"
date: "2025-08-29"
tags: 
  - "performance"
  - "query-planning"
  - "tpch"
  - "de-correlation"
---

The great promise databases make to programmers is: "Tell me what you want and I will figure out the
fastest way to do it."

A database is a computer science engine — it *knows* things and optimisations that the average programmer has
not heard about...

Sometimes...

Some queries look "easy" to programmers — but databases often need to apply a method called de-correlation to
make them effective. 
Even back in the 90ies, the great minds of the TPC council knew how to design queries that look for this optimisation.

Today we will learn how to spot these cases and what happens when databases fail at optimising them.

# Today's Champions in the Boxing Ring
As is tradition on the Database Doctor - we explore different databases. It is important to me that you understand
that skills you acquire in one database carry over to the entire database industry. Tell your CV recruiter who only
knows how to do exact product matching to stick their checkboxes where the sun doesn't shine!

Today's competitors are: PostgreSQL vs. Yellowbrick!

I am picking PostgreSQL because its query optimiser is reasonably capable, at least by the standards of the open source 
industry. 
At the time of writing, PostgreSQL is also the [most popular open source database](https://db-engines.com/en/ranking). 
For my tests, I picked PostgreSQL Version 17.5 — because that is what I happened to have on my laptop.

On the other side of the ring: Yellowbrick Data. 
Yellowbrick forked the PostgreSQL code base many years ago and has since done extensive surgery on the entire engine. 
Their query planner is loosely based on the PostgreSQL source code, but it has evolved significantly.
Let us see what kind of upgrades they've done since they forked.

For this blog entry, we're mostly interested in the effect of query optimisation on time complexity.
Take the absolute numbers with a grain of salt, because the dataset we will operate on is so small that even network 
overheads show up in our runs.

TPC-H Q02 is next on my list of queries to analyse. 
It turns out that Q17 is very similar, so I will group it into the same blog entry. 
Of the two queries, Q17 is the easiest to understand. 
I will first explain (pun!) how Q17 is optimised. 
We can then use the same tricks on Q02. 

## A Note about reading Query Plans
I am working on a tool that can compare query plans across database engines. What you see in today's blog is a sneak
peek into this new world. I am sick and tired of looking at the atrocities that are the query plans from open source
databases, so I decided to do something about it.

The query plans you will see are rendered as ASCII art trees (it's one of the renditions my tool offer) - they should 
hopefully be relatively easy to understand.

By convention, the first child of a join node is the inner side, the one you "look into while looping the other side."
Plans are read "from the bottom and inside out."

For example, this:

```
INNER JOIN HASH ON (l_partkey = p_partkey)
│└SCAN part
SCAN lineitem
```
Says:

1) Emit rows from `lineitem` 
2) Using a hash table build on `part` - look for rows matching `l_partkey = p_partkey`

Multiple joins can be combined, for example:

```
INNER JOIN HASH ON (l_partkey = p_partkey)
│└SCAN part
INNER JOIN LOOP ON (l_suppkey = s_suppkey) 
|└supplier
SCAN lineitem
```
Says:

1) Emit rows from  `lineitem` 
2) Then: Look into `supplier` using whatever method is best (typically a seek) to find `l_suppkey = s_partkey`
3) Then: Using a hash table build on `part` - look for rows matching `l_partkey = p_partkey`

This particular way of rendering join trees makes left deep join very compact, which is why I did it this way.

And now, to the queries... 

# TPC-H Q17
Here it is: So simple, yet so menacing:

```sql
SELECT SUM(l_extendedprice) / 7.0 AS avg_yearly
FROM tpch.lineitem
INNER JOIN tpch.part
ON l_partkey = p_partkey
WHERE p_brand = 'Brand#13'
  AND p_container = 'MED CAN'
  AND l_quantity < (SELECT 0.2 * AVG(l_quantity)
                    FROM tpch.lineitem AS li
                    WHERE l_partkey = p_partkey);
```

The filter on `l_quantity` is a subquery with that itself has a filter on  `l_partkey = p_partkey`. 
This subquery refers to `part` in the containing query as well is `lineitem` (aliased `li`) in the subquery.
A query with an expression pointing at its containing query is what database people call a "correlated subquery." 

We are telling the database to run this pseudocode:

```python
for row in join(lineitem, part):
  if row.p_brand != 'Brand#13':
     continue;
  if row.p_container != 'MED CAN':
     continue
  
  count_l_quantity = 0
  sum_l_quantity = 0
  for inner_row in lineitem: # alias: li
     if inner_row.l_partkey != row.p_partkey:
        # Not the one we are looking for
        continue
      sum_l_quanity += inner_row.l_quantity
      count_l_quanity += 1
  avg_l_quantity = sum_l_quantity / count_l_quantity
  
  if row.l_quantity < avg_l_quantity:
    # Quantity not big enough
    continue
      
  emitRow(row) 
```

The word "correlation" comes from the forced relationship between the variables in the inner and outer loop 
above.

Readers paying attention will already notice a potential problem: This algorithm is of time complexity:
**O(|lineitem| * |lineitem|)**. 
That's quadratic and `lineitem` is the largest table in the dataset! ... Not good...

Of course, we could optimise this algorithm by adding an index on `l_partkey`. 
That would allow the inner query to quickly locate the `l_partkey` to match the outer `p_partkey`. 
If we do that, the query turns into a time complexity **O(|lineitem| * log(|lineitem|))**. 
But there isn't always a friendly DBA around to sprinkle indexes on your database as you need them. 
The database should do the best it can, even without index support; that is the promise databases make.

And PostgreSQL doesn't...

Before we look at the numbers - let me introduce Q02 as well.

# TPC-H Q02
The query looks like this:

```sql
SELECT s_acctbal,
       s_name,
       n_name,
       p_partkey,
       p_mfgr,
       s_address,
       s_phone,
       s_comment
FROM tpch.partsupp
INNER JOIN tpch.part
    ON ps_partkey = p_partkey
INNER JOIN tpch.supplier
    ON ps_suppkey = s_suppkey
INNER JOIN tpch.nation
    ON s_nationkey = n_nationkey
INNER JOIN tpch.region
    ON n_regionkey = r_regionkey
WHERE p_size = 25
  AND p_type LIKE '%BRASS'
  AND r_name = 'EUROPE'
  AND ps_supplycost = (SELECT MIN(ps_supplycost)
                       FROM tpch.partsupp AS ps_min
                       INNER JOIN tpch.supplier AS s_min
                           ON ps_suppkey = s_suppkey
                       INNER JOIN tpch.nation AS n_min
                           ON s_nationkey = n_nationkey
                       INNER JOIN region AS r_min
                           ON n_regionkey = r_regionkey
                       WHERE ps_partkey = p_partkey
                         AND r_name = 'EUROPE')
ORDER BY s_acctbal DESC,
         n_name,
         s_name,
         p_partkey;
```

The fascinating bit about this query is the nested subquery:  `SELECT MIN(ps_supplycost) FROM tpch.partsupp...`. 

That subquery is again correlated with the outer query via this filter: `ps_partkey = p_partkey`. 
But this time, the correlation is more complex: we must execute several joins to find the value that the outer 
`ps_supplycost` is looking for.

# Initial results: Q17 and Q02 without indexes

I am going to once again use my laptop to run PostgreSQL. For the Yellowbrick case, I have managed to locate an
old machine with only 10 CPU cores per node (roughly matching my laptop) and restricted Yellowbrick to run on a single 
node.

This is a ballpark fair compare between the two databases, perhaps with PostgreSQL having a slight edge as the 
Yellowbrick hardware is nearly 8 years old. Like [last time](./joins-are-not-expensive.md) I am going to run purely in memory.
PostgreSQL is configured to hold all data in memory by settings `shared_buffers`,  `work_mem` and `effective_cache_size`. 
I have also enabled huge pages - because why not.

Yellowbrick, on the other hand, does not have a buffer pool. It reads all the data off disk. 

<aside>
<b>Databases without buffer pools?</b>

NVMe drives are incredibly fast. 
So fast that caching large datasets in memory barely makes sense. 
There is a design philosophy (which Yellowbrick obviously believes in) where it is better to use your DRAM for query 
execution than for caching data. 
As we can see here, this brute force NVMe approach does pretty well even against a fully, memory resident dataset.
</aside>

All tables have a `PRIMARY KEY` defined. 
No other indexes have been added. 
`ANALYSE` has been run on all tables to create stats. 

For reasons that will soon become obvious - I used TPC-H scale factor 1. At this scale factor, the `lineitem` table
has 6M rows. The total size of the dataset is around 1GB; a toy database. But it's enough to make the point I want
to make today. 

The initial numbers:

| Query | PostgreSQL 17.5 | Yellowbrick 7.3.0 |
|-------|----------------:|------------------:|
| Q02   |             73s |              0.1s |
| Q17   |             ~1h |              0.1s |


What on earth is going on here? I mean, PostgreSQL is an old product at this time - but surely it
can't be *that* bad?

## Indexing PostgreSQL
Let's add some indexes to help Postgres. Maybe PostgreSQL will stand a chance if we do.

For Q17 - we need to make finding `l_partkey` faster:

```sql
/* Q17 index help! */
CREATE INDEX ix_q17 ON tpch.lineitem(l_partkey) INCLUDE (l_quantity);
```

Notice how I added an `INCLUDE` column, this index is specifically designed to optimise the inner query of Q17. 
We don't want PostgreSQL digging into the main table just to retrieve `l_quantity`.

For Q02, using the same thinking, we can help PostgreSQL with an index on `ps_partkey`:

```sql
/* Help out  Q02 */
CREATE INDEX ix_q02 ON tpch.partsupp(ps_partkey);
```

### Numbers after Indexing
Rerunning the results, we now have:

| Query | PostgreSQL 17.5 | PostgreSQL 17.5 + Index | Yellowbrick 7.3.0 |
|-------|----------------:|------------------------:|------------------:|
| Q02   |             73s |                    0.2s |              0.1s |
| Q17   |             ~1h |                    1.2s |              0.1s |

Much better.

But why can Yellowbrick run these queries so much faster, even without indexes? It's an order of magnitude faster 
for Q17. Unlike PostgreSQL, it doesn't even cache data, it reads it off disk everytime we execute.

<aside>
<b>Indexing foreign keys</b>

The TPC-H specification allows foreign keys to be defined and allows them to be indexed. 
Apart from the `INCLUDE` trick we're within the rules of the specification.

Note that PostgreSQL (like many other databases) doesn't automatically add an index to a foreign key. 
We must do so manually.
</aside>


# The power of De-correlation
What is Yellowbrick's secret trick here?

As mentioned, I happen to be sitting on a homemade tool that can render PostgreSQL plans in human-readable format 
(unlike PostgreSQL own explain functionality).
It can also parse Yellowbrick plans and render them in the same format.

To understand what is really going on, let us have a look at the query plans using our friend `EXPLAIN (ANALYSE)`
and running the output through my tool.

## Query plan for Q17

Recall that the query takes over 1 hour to run with PostgreSQL unless we index it.

The query plan PostgreSQL gives us is this:

```
 Actual  Operator
      1  GROUP BY SIMPLE () AGGREGATE ((sum(lineitem.l_extendedprice) / 7.0)...)
    570  INNER JOIN HASH ON lineitem.l_partkey = part.p_partkey AND l_quantity  < (Subplan 1)
   6871  │└GROUP BY SIMPLE () AGGREGATE ((0.2 * avg(lineitem_1.l_quantity))...)
 213001  │ Subplan 1: SCAN li WHERE (lineitem_1.l_partkey = part.p_partkey)...
    234  │ SCAN part WHERE (((p_brand)::text = 'Brand#13'::text) AND ((p_container)::text = 'MED CAN'::text))...
6000102  SCAN lineitem
```

The plan above contains one of the many WTF things about PostgreSQL: the hash side of the join has *two* scan 
children (`li` and `part`). 
One of those children is something PostgreSQL calls a sub-plan - it is how it expresses the inner loop. 
Notice that we are digging into `li` (the inner one) ~213K times without any help of indexes. 
No wonder the query is slow.

Postgres with indexes uses the same plan as above. But the `Subplan 1: SCAN li` can now be satisfied by indexes.

Yellowbrick, instead, does this:

```
Actual  Operator
     1  GROUP BY SIMPLE () AGGREGATE (SUM(l_extendedprice) / 7.0)
   545  INNER JOIN HASH ON (part.p_partkey = lineitem.l_partkey)...
   233  │└INNER JOIN HASH ON (part.p_partkey = li.l_partkey)...
   233  │ │└SCAN part WHERE p_brand = 'Brand#13' AND p_container = 'MED CAN'
   238  │ GROUP BY HASH (li.l_partkey) AGGREGATE (0.2 * AVG(l_quantity))
  7021  │ SCAN li
  6982  SCAN lineitem
```

Notice that `GROUP BY HASH (li.l_partkey)` - that isn't in the original query. Notice the greatly reduced row count
from `SCAN lineitem` - an artefact of the bloom filters Yellowbrick implements.

The Yellowbrick optimiser observes something about this query that PostgreSQL does not see. Let me explain.

Consider again this expression:

```
l_quantity < (SELECT 0.2 * AVG(l_quantity)
                    FROM tpch.lineitem
                    WHERE l_partkey = p_partkey);
```

How does this read for the Yellowbrick optimiser?

- I don't have any index to help me run this implied loop
- If I was to scan the inner `lineitem` (like PostgreSQL does) - my query would be **O(|lineitem|*|lineitem|)**
- That would make the user angry, can I do better?
- For every `l_partykey` in the inner query, I must check if the matching `p_partkey` from the outer query is
  smaller than the expression `0.2 * AVG(l_quantity)`.
- I can pre-compute *all* the `0.2 * AVG(l_quantity)` values for every `l_partkey` 
- I can then use this precomputed result and join it back to the main result to compare `p_partkey` with `l_partkey`

In other words, the Yellowbrick optimiser observes that Q17 is the *same* as this query:

```sql
SELECT SUM(l_extendedprice) / 7.0 AS avg_yearly
FROM tpch.lineitem
INNER JOIN tpch.part
    ON l_partkey = p_partkey
INNER JOIN (SELECT l_partkey
                 , 0.2 * AVG(l_quantity) AS avg_quantity
            FROM tpch.lineitem
            GROUP BY l_partkey) AS decorrelated
    ON decorrelated.l_partkey = p_partkey
WHERE p_brand = 'Brand#13'
  AND p_container = 'MED CAN'
  AND l_quantity < decorrelated.avg_quantityh;
```

This trick is called "de-correlating the query." 
The optimiser removes the correlation (between `l_partkey` and `p_partkey`) and turns it a `JOIN` + `GROUP BY` instead. 
Put differently: It removes implied loops and turns them into proper, relational algebra. 
This also has the nice side effect of reducing the amount of operators you actually need in the execution Engine, 
which simplifies the entire execution engine of the database: it is all just join, aggregates and sort, no loops.

As a programmer, you might have been able to figure something like that out on your own. But the beauty of good 
query optimisers is that you don't have to. Thinking hurts, let the database do it for you!


## Query plan for Q02

Recall that PostgreSQL was able to run this query without indexes, but that it was much slower than Yellowbrick. By
about 1000x without indexes and 10x with indexes.

The PostgreSQL plan we get, both with and without indexes is this:

```
Actual  Operator
   375  SORT supplier.s_acctbal...nation.n_name..., supplier.s_name..., part.p_partkey...
   375  INNER JOIN HASH ON (p_partkey = ps_partkey) AND ((SubPlan 1) = partsupp.ps_supplycost)
  1177  │└SubPlan 1: GROUP BY SIMPLE () AGGREGATE (min(ps_min.ps_supplycost)...) <<<-- Subplan again!
  1177  │ INNER JOIN LOOP ON r_min.r_regionkey = n_min.n_regionkey...
  1177  │ │└SCAN r_min WHERE ((r_min.r_name)::text = 'EUROPE'::text)...
  3531  │ INNER JOIN LOOP ON n_min.n_nationkey = s_min.s_nationkey...
 29425  │ │└SCAN n_min
  3531  │ INNER JOIN LOOP ON s_min.s_suppkey = ps_min.ps_suppkey...
  3531  │ │└SCAN ps_min WHERE (ps_min.ps_partkey = part.p_partkey)...
  4012  │ SCAN s_min
120874  │ INNER JOIN HASH ON partsupp.ps_suppkey = supplier.s_suppkey...
  2015  │ │└INNER JOIN HASH ON supplier.s_nationkey = nation.n_nationkey...
     5  │ │ │└INNER JOIN HASH ON nation.n_regionkey = region.r_regionkey...
     1  │ │ │ │└SCAN region WHERE ((region.r_name)::text = 'EUROPE'::text)...
    25  │ │ │ SCAN nation
 10000  │ │ SCAN supplier
599999  │ SCAN partsupp
   802  SCAN part WHERE (((part.p_type)::text ~~ '%BRASS'::text) AND (part.p_size = 25))...
```

Again, we see the two children of the build side of the join: `SubPlan 1` and 
`INNER JOIN HASH ON partsupp.ps_suppkey = supplier.s_suppkey`. 
Notice how many times we visit `n_min` (29425) - a table with only 25 rows.

Recall that Q02 has this correlated subquery:

```sql
ps_supplycost = (SELECT MIN(ps_supplycost)
                       FROM tpch.partsupp AS ps_min
                       INNER JOIN tpch.supplier AS s_min
                           ON ps_suppkey = s_suppkey
                       INNER JOIN tpch.nation AS n_min
                           ON s_nationkey = n_nationkey
                       INNER JOIN tpch.region AS r_min
                           ON n_regionkey = r_regionkey
                       WHERE ps_partkey = p_partkey
                         AND r_name = 'EUROPE')
```

There is correlation  between `p_partkey` from the outer query, and `ps_partkey` from the inner query. 

The loop over the correlation is this part of the plan:

```
Actual  Operator
  1177  │└SubQuery 1: GROUP BY SIMPLE () AGGREGATE (min(ps_min.ps_supplycost)...)
  1177  │ INNER JOIN LOOP ON r_min.r_regionkey = n_min.n_regionkey...
  1177  │ │└SCAN r_min WHERE ((r_min.r_name)::text = 'EUROPE'::text)...
  3531  │ INNER JOIN LOOP ON n_min.n_nationkey = s_min.s_nationkey...
 29425  │ │└SCAN n_min
  3531  │ INNER JOIN LOOP ON s_min.s_suppkey = ps_min.ps_suppkey...
  3531  │ │└SCAN ps_min WHERE (ps_min.ps_partkey = part.p_partkey)...
  4012  │ SCAN s_min
```

Fortunately for PostgreSQL - the table sizes we are dealing with here are much smaller than the 6M rows `lineitem`
table from Q17.
The algorithm that PostgreSQL executes is of complexity **O(|partsupp|*|partsupp|)** - give or take a few
logarithms for doing the index seeks into `nation`, `region` and `supplier`.
This is fundamentally an unscalable algorithm and hence, a bad query plan.
You would never want a query like this running in your actual production system without index support.

Adding indexes gives us much better performance. But again, Yellowbrick does not need indexes to beat PostgreSQL.

Yellowbrick again understands that the correlated subquery can be turned into a join. It does this instead:

```
Actual  Operator
   375  SORT
   375  INNER JOIN HASH ON (nation.n_nationkey = supplier.s_nationkey)...
     5  │└INNER JOIN HASH ON (region.r_regionkey = nation.n_regionkey)...
     1  │ │└SCAN region
     5  │ SCAN nation
   375  INNER JOIN HASH ON (partsupp.ps_suppkey = supplier.s_suppkey)...
   375  │└INNER JOIN HASH ON ((partsupp.ps_partkey = ps_min.ps_partkey) AND ...
  2512  │ │└INNER JOIN HASH ON (part.p_partkey = partsupp.ps_partkey)...
   802  │ │ │└SCAN part WHERE p_type = 24 AND p_type LIKE '%BRASS'
  2548  │ │ SCAN partsupp
 88947  │ GROUP BY HASH (ps_min.ps_partkey) AGGREGATE (MIN(ps_supplycost)) <<< Decorrelation here!
120393  │ INNER JOIN HASH ON (s_min.s_suppkey = ps_min.ps_suppkey)...
  2015  │ │└INNER JOIN HASH ON (n_min.n_nationkey = s_min.s_nationkey)...
     5  │ │ │└INNER JOIN HASH ON (r_min.r_regionkey = n_min.n_regionkey)...
     1  │ │ │ │└SCAN r_min
     5  │ │ │ SCAN n_min WHERE r_name = 'EUROPE'
  2015  │ │ SCAN s_min
120393  │ SCAN ps_min
   344  SCAN supplier
```
Notice the `GROUP BY HASH (ps_min.ps_partkey)` added to the query by the optimiser

### Using de-correlation to turn Loop join with Index Seeks into Hash Join
Another great thing about de-correlation is that it allows you to turn loop joins into hash joins.
In general, when you expect to operate on a lot of data - you are better off using hash joins.
Hash joins between tables of size M and N has time complexity **O(N+M)**, loop join has complexity **O(N*log(M))**.
Hash joins also tend to have better cache locality than loop joins.

To see how this works, let us revisit two plan fragments in Yellowbrick vs. PostgreSQL:

PostgreSQL uses loops top satisfy the inner query lookups, even though all rows must be visited in some tables:

```
Actual  Operator
  1177  │└SubPlan 1: GROUP BY SIMPLE () AGGREGATE (min(ps_min.ps_supplycost)...)
  1177  │ INNER JOIN LOOP ON r_min.r_regionkey = n_min.n_regionkey...  <<< Loop
  1177  │ │└SCAN r_min WHERE ((r_min.r_name)::text = 'EUROPE'::text)...
  3531  │ INNER JOIN LOOP ON n_min.n_nationkey = s_min.s_nationkey...  <<< Loop again
  3531  │ │└INNER JOIN LOOP ON s_min.s_suppkey = ps_min.ps_suppkey...  <<< Loop some more
  3531  │ │ │└SCAN ps_min
  4012  │ │ SCAN s_min
  4012  │ SCAN n_min
```

Notice how the actual rows we visit are much higher than the rows in the actual table?

Yellowbrick can use hash joins for the entire plan and only need to visit each table once.
When you hash joins, you also unlock the optimisation of bloom filters (which we will talk much more about in a later 
blog).

## Tradeoffs and Transitive Closures
We've seen how Yellowbrick can plan brute execution by rewriting correlated subqueries into joins. 
However, we can't talk about de-correlation without also mentioning that PostgreSQL plays an algorithmic trick that 
Yellowbrick isn't playing.

Consider again the `WHERE` clause of Q02:

```sql
WHERE p_size = 25
  AND p_type LIKE '%BRASS'
  AND r_name = 'EUROPE'
  AND ps_supplycost = (SELECT MIN(ps_supplycost)
                       FROM tpch.partsupp AS ps_min
                       INNER JOIN tpch.supplier AS s_min
                           ON ps_suppkey = s_suppkey
                       INNER JOIN tpch.nation AS n_min
                           ON s_nationkey = n_nationkey
                       INNER JOIN tpch.region AS r_min
                           ON n_regionkey = r_regionkey
                       WHERE ps_partkey = p_partkey
                         AND r_name = 'EUROPE')
```

Postgres was forced to run the nested query one time per row found in the outer `partsupp JOIN part` query. 
There is something good about this, because the outer query has a filter on `p_type` and `p_size` that greatly
reduces the number of `p_partkey` that we actually need to look at. 

This in turn allows PostgreSQL to reduce the number of rows it needs from  `ps_min` in the nested query:

```
Actual  Operator
  1177  │└SubPlan 1: GROUP BY SIMPLE () AGGREGATE (min(ps_min.ps_supplycost)...)
  1177  │ INNER JOIN LOOP ON r_min.r_regionkey = n_min.n_regionkey...  <<< Loop
  1177  │ │└SCAN r_min WHERE ((r_min.r_name)::text = 'EUROPE'::text)...
  3531  │ INNER JOIN LOOP ON n_min.n_nationkey = s_min.s_nationkey...  <<< Loop again
  3531  │ │└INNER JOIN LOOP ON s_min.s_suppkey = ps_min.ps_suppkey...  <<< Loop some more
  3531  │ │ │└SCAN ps_min     <<<--- Only needs 3531 rows from here
  4012  │ │ SCAN s_min7
  4012  │ SCAN n_min        
```

There are 600.000 rows in `partsupp` - but PostgreSQL only needed to look at 3531. It also reduces the total rows
coming out of the `SubPlan 1` - which benefits the parent nodes in the plan.

Yellowbrick needs to work harder for the same thing:
```
Actual  Operator
120393  │ INNER JOIN HASH ON (s_min.s_suppkey = ps_min.ps_suppkey)...
  2015  │ │└INNER JOIN HASH ON (n_min.n_nationkey = s_min.s_nationkey)...
     5  │ │ │└INNER JOIN HASH ON (r_min.r_regionkey = n_min.n_regionkey)...
     1  │ │ │ │└SCAN r_min
     5  │ │ │ SCAN n_min WHERE r_name = 'EUROPE'
  2015  │ │ SCAN s_min
120393  │ SCAN ps_min   <<<--- 120K rows!
```

Because the entire result is pre-calculated on every `ps_min` (except those that have `r_name = 'EUROPE'`) we end up
with 120K rows being emitted as a result of the sub query. But even with all that extra work - the hash join still
beats the loop join of PostgreSQL. It is costly to seek into an index (like PostgreSQL does here) when you need a 
lot of rows. 
It is often better to simply scan and hash the rows.

Optimisations exist that Yellowbrick isn't applying here: The optimiser could in principle know that the 
filter on `part` from the outer query can also be applied to the inner query. 
That in turn would reduce the row count further, giving Yellowbrick an even bigger edge.
This insight, where a filter can be "copied" to another part of a query, is called a "transitive closure optimisation."
We will see more examples of those in later TPC-H queries.

# Summary
In today's analysis of Q02 and Q17, we saw how TPC-H checks for the presence of query de-correlation. 
Even though indexes can speed up correlated queries - de-correlation and rewrite into hash and join is significantly 
faster.

Getting de-correlation right in query optimisers helps users worry less about indexing and manual query rewrites.
PostgreSQL still has some tricks to learn here.

We also saw that de-correlation can turn otherwise complex queries into simple `JOIN` and `GROUP BY` operations instead
of needing sub plan looping. 
This allows database designers to make simplifying assumptions about the execution engine.

As a teaser for future blogs, we also noticed that filters can often be moved or copied to other parts of the query
to speed up subqueries.

Until the next query, have fun analysing

The full TPC-H series:

- [TPC-H Series](/analysis/)
