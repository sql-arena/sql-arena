---
title: "TPC series - TPC-H Query 5 - Transitive Closure and Join Order Dependencies"
date: "2025-10-03"
tags:
  - "performance"
  - "query-planning"
  - "tpch"
---

Welcome back to the TPC-H analysis.
If this is your first time, I highly recommend that you visit the previous blogs in the series first.

They're here (and I look forward to seeing you back in this blog):

- [TPC-H Series](/analysis/)

For my regulars: We've now learned how to manually search for query plans that are optimal or close to optimal.

Today we will apply this knowledge and see if PostgreSQL, SQL Server, and DuckDB can work how to optimally
run Query 5.

# Query 5

The query is a classic, almost canonical, analytical query — with a small twist.

Like many TPC-H queries, it has a filter on `o_orderdate`.
This filter is a quick test for partitioning elimination.
You use metadata about min/max values inside disk blocks (or Parquet files)
to check if the block/file contains the range you're looking for.
If the metadata tells you that the data can't be in the block - you don't read the block/file.

This is such a blatantly obvious optimisation that I've forgotten to mention it in previous blogs —
because I didn't want to disrespect your intelligence.
But I recently learned that this optimisation of using min/max metadata to avoid looking at actual data is apparently
something the Iceberg crew thinks is an achievement worth mentioning.  
It isn't - database from the late 1970ies knew this trick, and we've known how to match values in intervals
since the invention of mathematics.

More interestingly, the query also contains a filter on `r_name`.

```sql
SELECT n_name
     , SUM(l_extendedprice * (1 - l_discount)) AS revenue
FROM tpch.lineitem
INNER JOIN tpch.supplier
  ON l_suppkey = s_suppkey
INNER JOIN tpch.orders
  ON l_orderkey = o_orderkey
INNER JOIN tpch.customer
  ON o_custkey = c_custkey
INNER JOIN tpch.nation
  ON s_nationkey = n_nationkey
INNER JOIN tpch.region
  ON r_regionkey = n_regionkey
WHERE c_nationkey = s_nationkey
  AND r_name = 'ASIA'
  AND o_orderdate >= '1994-01-01'
  AND o_orderdate < '1995-01-01'
GROUP BY n_name
ORDER BY revenue DESC;
```

As always, we start by looking at the selectivity of filters in the query:

## Selectivity of Filters

| Filter                                                       | Selectivity | Cardinality |
|--------------------------------------------------------------|-------------|-------------|
| `o_orderdate >= '1994-01-01' AND o_orderdate < '1995-01-01'` | 14%         | 213946      |
| `r_name = 'ASIA'`                                            | 20%         | 5           |

`o_orderdate` is a juicy filter on a column in the second-largest table.
But `r_name = 'ASIA'` also has values because it can implicitly filter other tables via the
relationship between `region` to `nation` and from there to `supplier`.

# Query Plan Analysis

Our largest table is `lineitems` so we shall pick that as the driving table.

We also see that simply joining `orders` with `lineitems` first and taking the filter on `o_orderdate` would
already lead to a healthy reduction to 14% of the rows.

It would appear the initial join should be between `lineitems` and `orders`.

But, Query 5 contains a trap.
It tests for a clever little optimisation that allows us to do even better.

# Join order dependency

As the query is written, if we want to take the filter on `r_name = 'ASIA'` we must follow this join path in the tree:

- from `lineitem`
- to `supplier (l_suppkey = s_suppkey)`
- to `nation (s_nationkey = n_nationkey)`
- to `region (n_regionkey = r_regionkey)` taking the filter ` WHERE r_name = 'ASIA`

Another way to think about this is that `r_name = 'ASIA'` is a filter on `supplier`,
which in turn filters `lineitem`.

Based on what we know so far, our best plan would be something like this:

- Join `lineitem` and `orders` taken the reduction to 14%
- Join what remains to `supplier`
- Join to `nation`
- Join to `region` taken the reduction to another 20% of the stream

But there is more to be gained here.

## Transitive Closure

If we look at the join dependency graph, we can see that it isn't a tree - it is a directed, acyclic graph.

Notice this little filter:

```sql
WHERE c_nationkey = s_nationkey
```

This creates a dependency between `customer` and `supplier`.

Diagramming, we have this graph:

```
        customer ---------- nation 
      /                             \
orders                              (c_nationkey = s_nationkey) -- region (with r_name = 'ASIA') 
      \                             /
        lineitem - supplier - nation

```

From relational algebra, we know that the equality of joins is transitive.

We can use this transitive nature to reason about the query in a different way.
The equality between `c_nationkey` and `s_nationkey` implies that the `region` filter applies to *both*
`customer` and `supplier` via the `nation` table.

This gives us another way to collect the `r_name = 'ASIA'` filter in the plan:

- from `orders`
- to `customer (o_custkey = c_custkey)`
- to `nation (c_nationkey = n_nationkey)`
- to `region (n_regionkey = r_regionkey WHERE r_name = 'ASIA'`

In other words, we don't have to join via `supplier`  to harvest the `r_name` filter. 
We can instead go via `customer`and filter that table first.
`customer` is a much larger table than `supplier` (by 15x) so it is better to apply an aggressive filter on a larger
table to reduce the rowcount as early as possible.

Since `orders` is already used to filter `lineitem`, we can improve the filter further by 
pre-joining to `customer`, `nation` and `region`  to `orders` *before* we join to `lineitem`. 
That allows us to *combine* the two filters into a single, more powerful filter on `lineitem`.

We still have to apply the filter on `c_nationkey = s_nationkey` later in the query. 
Because any rows we find in `supplier` must be reduced to the `c_nationkey` we found in `customer`.

Knowing just a little, relational algebra allows us to "move the join around"
by following the structure of the graph.

Does this actually happen in real life and how big is the impact?

# Actual Query Plans

Let us see how today's competitors fare.

I've extended my query plan tooling. 
It can now understand SQL Server query plans and render them in the compact format we use on this blog.
Adding query plan support for a new engine is an involved task taking several days.
If you feel like getting involved in this work for your favourite database engine - reach out to me on
[LinkedIn](https://www.linkedin.com/in/thomaskejser/) and I will happily coach you through the process.
Fair warning: you *will* need to be reasonably fluent in C++ to pull this off.

Supporters on Patreon of ["Joins without Borders"](https://www.patreon.com/c/databasedoctor/membership)
get priority on me doing driver implementation on my weekends.
Weekends are when I build drivers that are not related to my day job.

With that said - let us have a look at some real life query plans.

## PostgreSQL

First, here is the plan:

```
Estimate    Actual  Operator
      25         5  SORT SUM(l_extendedprice * ('1' - l_discount))
      25         5  GROUP BY SORTn_name AGGREGATE SUM(l_extendedprice * ('1' - l_discount))
     125        25  GROUP BY SORTn_name AGGREGATE PARTIALSUM(l_extendedprice * ('1' - l_discount))
    8700      6990  SORT n_name
    8700      6990  INNER JOIN HASH ON (l_suppkey = s_suppkey) AND (n_nationkey = s_nationkey)
   10000     10000  │└SCAN supplier
  217380    171090  INNER JOIN HASH ON o_custkey = c_custkey
   12500     30049  │└INNER JOIN HASH ON c_nationkey = n_nationkey
       5         5  │ │└INNER JOIN HASH ON n_regionkey = r_regionkey
       1         1  │ │ │└SCAN region WHERE r_name = 'EUROPE'
      25        25  │ │ SCAN nation
   62500    150000  │ SCAN customer
 1086900    856050  INNER JOIN HASH ON l_orderkey = o_orderkey
  350695    214015  │└SCAN orders WHERE (o_orderdate >= '1995-01-01') AND (o_orderdate < '1996-01-01')
 7498290   5998820  SCAN lineitem
```

It is not a complete failure — but it isn't good either.

PostgreSQL realizes that taking the filter on `orders` first is worth it.
It is also able to infer that it is better to use the `nation` / `region` to filter on `customer` instead of `supplier`.

But PostgreSQL isn't able to infer that we could have used the filter on `customer` to also filter `orders` before
joining to `lineitem`.

*Side note: I suspect that MySQL would in fact pick a worse plan than PostgreSQL here — but I have not tooled it yet.
Look me up if you feel passionate about MySQL / MariaDB*

## SQL Server

With our new tooling, we can now look at SQL Server's plan:

```
Estimate    Actual  Operator
       5         5  SORT Expr1013
       5         5  PROJECT CASE WHEN Expr1019 = 0 THEN NULL ELSE Expr1020 END AS Expr1013
       5         5  GROUP BY HASH AGGREGATE COUNT(Expr1014) AS Expr1019, SUM(Expr1014) AS Expr1020
    7625      6988  INNER JOIN HASH ON s_suppkey = l_suppkey AND n_nationkey = s_nationkey
   10000     10000  │└SCAN supplier
  190648    171091  INNER JOIN HASH ON o_orderkey = l_orderkey
   42305     42896  │└INNER JOIN HASH ON c_custkey = o_custkey
   30000     30049  │ │└INNER JOIN HASH ON c_nationkey = n_nationkey
       5         5  │ │ │└INNER JOIN LOOP ON n_regionkey = r_regionkey
       1         5  │ │ │ │└SCAN region WHERE r_name = 'EUROPE'
      25        25  │ │ │ SCAN nation
  150000    150000  │ │ SCAN customer
  212096    214017  │ SCAN orders WHERE o_orderdate >= '1995-01-01' AND o_orderdate < '1996-01-01'
 5998820   5998820  PROJECT l_extendedprice * (1. - l_discount) AS Expr1014
 5998820   5998820  SCAN lineitem
```

*Side Note: Interestingly, SQL Server appears to have a bug in the way it reports cluster index scan.
According to the query plan, the actual rows from `region` is 5.
But if you look at what is actually coming into the join - it is one row*

SQL Server does exactly the right thing: it infers that doing a [bushy join](./tpch-q03.md) combining the filters
on `orders` is the optimal strategy.

Also note how good the row estimation is.
The statistics quality in this database is outstanding.

## DuckDB

DuckDB, despite having estimates a bit off, finds the same, good query plan that SQL Server finds:

```
Estimate    Actual  Operator
  272721         5  SORT SUM(l_extendedprice * (1 - l_discount))
  272721         5  GROUP BY HASH #0 AGGREGATE SUM(#1)
  287133      6988  PROJECT n_name, l_extendedprice * (1.000 - l_discount)
  287133      6988  INNER JOIN HASH ON l_suppkey = s_suppkey AND n_nationkey = s_nationkey
   10000     10000  │└SCAN supplier
  246102    171079  INNER JOIN HASH ON l_orderkey = o_orderkey
   60992     42896  │└INNER JOIN HASH ON o_custkey = c_custkey
   28846     30048  │ │└INNER JOIN HASH ON c_nationkey = n_nationkey
       5         5  │ │ │└INNER JOIN HASH ON n_regionkey = r_regionkey
       1         1  │ │ │ │└SCAN region WHERE r_name = 'EUROPE'
      25         5  │ │ │ SCAN nation
  150000    108053  │ │ SCAN customer WHERE c_custkey >= 3
  300000    213997  │ SCAN orders WHERE o_orderdate >= '1995-01-01' AND o_orderdate < '1996-01-01'
 5998820   5998029  SCAN lineitem WHERE l_suppkey >= 1
```

But there is a small difference worth commenting on.

### Deferring Expression Evaluation

The query includes this calculation

```sql
l_extendedprice * (1 - l_discount)
```

SQL Server and DuckDB make two different tradeoffs here:

DuckDB says: I don't want to calculate this expression until I've reduced the row count (via the joins).
It decides to calculate the expression at the very last part of the plan where the rowcount is only 6988.

```
Estimate    Actual  Operator
  287133      6988  PROJECT n_name, l_extendedprice * (1.000 - l_discount)
  287133      6988  INNER JOIN HASH ON l_suppkey = s_suppkeyn_nationkey = s_nationkey
```

SQL Server makes a different choice.
It realizes that `l_extendedprice` and `l_discount` are only needed to
calculate this expression.
Instead of flowing that data up the query tree, it instead decides to collapse the
expression directly after the scan:

```
Estimate    Actual  Operator
 5998820   5998820  PROJECT l_extendedprice * (1. - l_discount) AS Expr1014
 5998820   5998820  SCAN lineitem
```

This does mean that SQL Server have to do the maths almost six million times (as opposed to around 7K times for DuckDB).
But the tradeoff here is that SQL Server will then consume less memory in the rest of the plan

# The impact of good planning in Q5 — and in general

I can now make numerical compares of the operators that each database engine must execute run a plan.

For example, we can compare how many times the database engine has to hash values and look up things on those
hash tables.

We get this:

| Engine                    | Total Rows Joined | Rows Hash Build |
|:--------------------------|------------------:|----------------:|
| **SQL Server and DuckDB** |           6533953 |          254041 | 
| **PostgreSQL**            |           7175985 |         1067194 |

What a staggering difference!
PostgreSQL, with its poor query plan, needs to make 4x more hash table inserts than
SQL Server and DuckDB.
It also ends up doing more actual joining.

Consider for a moment what that means...

For a query like this, the database will spend a great deal of CPU time joining.
It joins almost as much as it scans.
Making joins effective is an ongoing research area that keeps improving.
But fast joining (and scanning) is also a problem that runs into the limits of physics.
We've previously seen how DuckDB and Yellowbrick do a great job here.
But if your query planner is bad - all that work is for nothing.

Finding 4x performance improvement in join speed - to make up for bad planning - is hard.
A 4x drop in performance is a 4x multiplier on your cloud bill.
And if that is something you are paid to care about, you probably need to care about query planning.

Bad query planning, like bad programming patterns (Java coders - I'm looking at you) - can eliminate all other
technical progress the tech industry has made in CPU and architecture improvements.

Query planning really matters!

## Hand rolling a Query Plan

There is a slight improvement we can make to the query that I haven't seen any optimiser do.

We can realize that even though we already took most of the filter value by joining to `customer` - there is a little
bit to be had by *also* joining to `supplier`.
This optimisation is decent, because the tables `nation` and `region` are tiny.
Duplicating the join and scan work is not a big deal.

We could rewrite the query to this:

```sql
WITH supplier_push AS (SELECT s.*
                       FROM tpch.supplier AS s
                                INNER JOIN tpch.nation
                                           ON s_nationkey = n_nationkey
                                INNER JOIN tpch.region
                                           ON n_regionkey = r_regionkey
                       WHERE r_name = 'EUROPE')
SELECT n_name,
       SUM(l_extendedprice * (1 - l_discount)) AS revenue
FROM tpch.lineitem
INNER JOIN tpch.orders
  ON l_orderkey = o_orderkey
INNER JOIN tpch.customer
  ON o_custkey = c_custkey
INNER JOIN tpch.nation
  ON c_nationkey = n_nationkey
INNER JOIN tpch.region
  ON n_regionkey = r_regionkey
WHERE r_name = 'EUROPE'
  AND o_orderdate >= '1995-01-01'
  AND o_orderdate < '1996-01-01'
  AND l_suppkey IN (SELECT s_suppkey FROM supplier_push)
GROUP BY n_name
ORDER BY revenue DESC
```

The improvement is quite small, but here it is:

| Engine                    | Total Rows Joined | Rows Hash Build |
|---------------------------|------------------:|----------------:|
| **SQL Server and DuckDB** |           6533953 |          254041 | 
| **PostgreSQL**            |           7175985 |         1067194 |
| **Hand roll**             |           6495272 |          280732 |

We sacrifice a bit of build work to reduce the amount of joining.
It is a tiny improvement and likely not one that optimizers have pursued much.

Here is the plan (which I ran on DuckDB):

```
Estimate    Actual  Operator
   48784         5  SORT SUM(l_extendedprice * (1 - l_discount))
   48784         5  GROUP BY HASH#0 AGGREGATE SUM(#1)
   49220     34761  PROJECT n_name, l_extendedprice * (1.000 - l_discount)
   49220     34761  LEFT SEMI JOIN HASH ON l_suppkey = #0
    1923      2033  │└PROJECT s_suppkey
    1923      2033  │ INNER JOIN HASH ON s_nationkey = n_nationkey
       5         5  │ │└INNER JOIN HASH ON n_regionkey = r_regionkey
       1         1  │ │ │└SCAN region WHERE r_name = 'EUROPE'
      25         5  │ │ SCAN nation
   10000      7192  │ SCAN supplier
  246102    170984  INNER JOIN HASH ON l_orderkey = o_orderkey
   60992     42896  │└INNER JOIN HASH ON o_custkey = c_custkey
   28846     30048  │ │└INNER JOIN HASH ON c_nationkey = n_nationkey
       5         5  │ │ │└INNER JOIN HASH ON n_regionkey = r_regionkey
       1         1  │ │ │ │└SCAN region WHERE r_name = 'EUROPE'
      25         5  │ │ │ SCAN nation
  150000    108053  │ │ SCAN customer WHERE c_custkey >= 3
  300000    213997  │ SCAN orders WHERE o_orderdate >= '1995-01-01' AND o_orderdate < '1996-01-01'
 5998820   5995036  SCAN lineitem WHERE l_suppkey >= 1
```

## Bloom Filter Teaser

Now, there is *another* optimisation you can do with a query like this (and many others).
We can see it in action if we build a column store index on `lineitem` in SQL Server.

First, we do this:

```sql
CREATE
CLUSTERED COLUMNSTORE INDEX cix_lineitem ON tpch.lineitem;
```

Let us first reflect on why it is a bit odd to even consider this idea.

Why would a column store index affect the plan shape?
All the tables except one (`region`, which is looped) are being scanned anyway — 
and column stores are just really fast scan machines.
We're already doing hash joins, which is one of the things column stores are good at too.

But in the case of SQL Server - running a plan that involves a column store scan enables an entirely
new set of tricks in the query planner.
These tricks *could* be applied to row store tables as well - but they just aren't.

With the column store index in place, we get *this* plan:

```
Estimate    Actual  Operator
       5         5  SORT Expr1013
       5         5  PROJECT CASE WHEN globalagg1023 = 0 THEN NULL ELSE globalagg1025 END AS Expr1013
       5         5  GROUP BY HASH AGGREGATE SUM(partialagg1022) AS globalagg1023, SUM(partialagg1024) AS globalagg1025
       5         5  INNER JOIN HASH ON r_regionkey = n_regionkey
       1         1  │└SCAN region WHERE r_name = 'EUROPE'
       2         5  GROUP BY HASH AGGREGATE COUNT(Expr1014) AS partialagg1022, SUM(Expr1014) AS partialagg1024
    3812      6988  INNER JOIN HASH ON n_nationkey = s_nationkey AND s_suppkey = l_suppkey
   10000     10000  │└SCAN supplier
   95324    171091  FILTER BLOOM(n_nationkey,l_suppkey)
   95324    171091  INNER JOIN HASH ON o_orderkey = l_orderkey
   21152     42896  │└INNER JOIN HASH ON c_nationkey = n_nationkey
      25        25  │ │└SCAN nation
   21152     42896  │ INNER JOIN HASH ON c_custkey = o_custkey
  150000    150000  │ │└SCAN customer
   21209    214017  │ SCAN orders WHERE o_orderdate >= '1995-01-01' AND o_orderdate < '1996-01-01'
   59988    171091  PROJECT l_extendedprice * (1. - l_discount) AS Expr1014
   59988    171091  SCAN lineitem WHERE BLOOM(l_orderkey)
```

There are some new operators in here that we will get to later.
It also seems that the filter of `r_name = 'EUROPE'` is not even considered useful — at least not at first glance.
What is that filter on `lineitem` that suddenly appears?

How does this new plan perform against the plans we've seen so far?

| Engine                      | Total Rows Joined | Rows Hash Build |
|-----------------------------|------------------:|----------------:|
| **SQL Server and DuckDB**   |           6533953 |          254041 | 
| **PostgreSQL**              |           7175985 |         1067194 |
| **Hand-roll**               |           6495272 |          280732 |
| **SQL Server Column Store** |            599100 |          373992 |

The query plan we can access here is amazing!
It is not just a little bit better than the others — it does 10x less work!
That is the difference between a ruinous cloud bill with a complex scale out engine — and running your entire
business on a laptop.

This is why you pay your database specialist well — because they save you money!

# Summary

Today we've seen that optimisers can use the transitive closure properties of joins to move
filters around in the query.
Optimisers who do well can significantly reduce the amount of work needed to run the query.

We also saw that there appears to be "something else" going on when we enable certain optimisations in
SQL Server.
We've seen that "something else" before when we looked at Yellowbrick query plans.
Whatever the trick being played is - it makes a huge difference to query planning.

It is late here, and I will have to leave you with your lessons already learned from today's blog.
Soon we will talk about bloom filters — which is the name for "something else" we saw SQL Server do.

Until then, keep analysing and keep the debate going...
