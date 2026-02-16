---
title: "TPC series - TPC-H Query 8 - Loops, merges and hash"
date: "2025-12-01"
tags: 
  - "performance"
  - "query-planning"
  - "ee"
  - "tpch"
---

In today's look at TPCH-H Q08, we're going to once again walk through an optimal join 
order example.

The query is quite boring, but it does allow me to talk about a few other things related
to optimiser costing: Join Algorithms (or as some would call them: "Physical operations").

# Query 8

The query visits nearly every table in the datamodel. 
It has a few, simple filters:

```sql
SELECT o_year,
       SUM(CASE
           WHEN nation = 'GERMANY'
               THEN volume
           ELSE 0
           END) / SUM(volume) AS mkt_share
FROM (SELECT EXTRACT(YEAR FROM o_orderdate)     AS o_year,
             l_extendedprice * (1 - l_discount) AS volume,
             n2.n_name                          AS nation
      FROM tpch.lineitem
      INNER JOIN tpch.part ON l_partkey = p_partkey
      INNER JOIN tpch.supplier ON l_suppkey = s_suppkey
      INNER JOIN tpch.nation n2 ON n2.n_nationkey = s_nationkey
      INNER JOIN tpch.orders ON l_orderkey = o_orderkey
      INNER JOIN tpch.customer ON o_custkey = c_custkey
      INNER JOIN tpch.nation n1 ON c_nationkey = n1.n_nationkey
      INNER JOIN tpch.region ON n1.n_regionkey = r_regionkey
      WHERE r_name = 'EUROPE'
        AND o_orderdate BETWEEN '1995-01-01' AND '1996-12-31'
        AND p_type = 'MEDIUM PLATED BRASS') AS all_nations
GROUP BY o_year
ORDER BY o_year;
```
# Selectivity of Filters:

Let us do the selectivity analysis that has become routine. 
We have:

| Filter                                              | Selectivity | Cardinality |
|-----------------------------------------------------|------------:|------------:|
| `r_name = 'EUROPE'`                                 |         20% |           1 |
| `o_orderdate BETWEEN '1995-01-01' AND '1996-12-31'` |         29% |        428K |
| `p_type = 'MEDIUM PLATED BRASS'`                    |        < 1% |        1.3K | 

Note how juicy the `p_type` filter is, we want to take that quickly!

Also, note that while the `r_name` filter is great, we can't really get to it
before we join to `customer` via `nation` (alias `n1`).

## Optimal Join Order

As is usual, `lineitem` is our largest stream. 
It drives the rest of the join ordering — we want it to be on the probe side of joins
(or drive seeks in loop joins).

The best filter is the one on `part` via `p_type = 'MEDIUM PLATED BRASS'`.
We take this filter quickly by joining from `lineitem` to `part`, reducing the stream of 
`lineitem` down to less than 1%. 
An optimiser with good statistics can be reasonably confident in this estimate of
the reduction in `lineitem`.

With large certainty, the optimiser can know that the stream of `lineitem JOIN part`  is now smaller 
than `orders` - even when we take the filter of `o_orderdate BETWEEN '1995-01-01' AND '1996-12-31'` into account.

So far, we're joining:

- `lineitem` -> `part` -> `orders`

If we choose a hash join to orders - we also know that we want `lineitem` to be on the build 
side of the join, but only *after* we join to `part`.


### ClickHouse Plan — how to fail at Estimation

Before we look at the last filter `r_name = 'EUROPE'` I think its worth checking out the ClickHouse
query plan.

Here it is:

```
Estimate    Actual  Operator
       -         2  PROJECT sumIf(volume,(nation = 'FRANCE')) / SUM(volume), sumIf(volume,(nation = 'FRANCE')) / SUM(volume)
       -         2  SORT o_year
       -         2  GROUP BY HASH o_year AGGREGATE sumIf(volume,(nation = 'FRANCE')), SUM(volume)
       -      2400  PROJECT EXTRACT(YEAR FROM o_orderdate), n_name, 1 - l_discount, EXTRACT(YEAR FROM o_orderdate), l_extendedprice * (1 - l_discount), nation = 'FRANCE', l_extendedprice * (1 - l_discount)
       -      2400  INNER JOIN HASH ON s_nationkey = n_nationkey
       -        25  │└TABLE SCAN nation
       -      2050  INNER JOIN HASH ON n_regionkey = r_regionkey  <---- Take the filter here
       -         1  │└TABLE SCAN region WHERE r_name = 'EUROPE' 
       -     10392  INNER JOIN HASH ON c_nationkey = n_nationkey
       -        25  │└TABLE SCAN nation
       -     10392  INNER JOIN HASH ON o_custkey = c_custkey
       -    150000  │└TABLE SCAN customer                         <---- Greeding looking for next filter
       -     10392  INNER JOIN HASH ON l_suppkey = s_suppkey
       -     10000  │└TABLE SCAN supplier
       -     10398  INNER JOIN HASH ON l_partkey = p_partkey
       -      1353  │└TABLE SCAN part WHERE p_type = 'SMALL POLISHED NICKEL'
       -   1549566  INNER JOIN HASH ON l_orderkey = o_orderkey
       -    428930  │└TABLE SCAN orders WHERE (o_orderdate >= '1995-01-01') AND (o_orderdate <= '1996-12-31')
       -   5998820  TABLE SCAN lineitem
```

As we have seen before with in [TPC-H Q07](tpch-q07.md) - ClickHouse will only look for left deep trees.
But that's not the worst bit, it also can't estimate even simple filters!

The Join order at the bottom of
the tree is:

- `lineitem` -> `orders` -> `part`

Instead of taking the big reduction to 1% to `part` *first*, ClickHouse picks the join
to `orders`. 
Why does it do this? 
Most likely because it has no idea what the selectivity of the filters are (=poor statistics)
and it ends up making a guess that results in a lot more work.


### Bushing out `r_name` and `customer`

Recall that the optimal join order so far is:

- `lineitem` -> `part` -> `orders`

At this point, we could directly join to `customer` and greedily look for the reduction
in rows we get from going to `nation`, to `region` taking the  `r_name = 'EUROPE'` filter.

#### Being smarter about the `r_name` filter

Instead of joining the still large stream to `customer` directly - we could instead do this
join:

`nation` -> `region` (taking `r_name` filter)

The results of this join can *then* be used to join to the previous stream of:

- `lineitem` -> `part` -> `orders` -> `customer`

This method will reduce the number of joins by not needing to join the above
steam first to`nation` and then `region` but only to the result of the already filtered `nation`.

#### Postgres and DuckDB plans

The PostgreSQL and DuckDB plans are similar, differing only join type (loop vs hash).

Here is DuckDB:

```
Estimate    Actual  Operator
       -         2  SORT o_year
    1752         2  PROJECT o_year, mkt_share
       -         2  GROUP BY HASH #0 AGGREGATE SUM(#1), SUM(#2)
    1961      2323  PROJECT o_year, CASE WHEN(nation = 'FRANCE') THEN volume ELSE 0.000000 END, volume
    1961      2323  PROJECT o_year, volume, nation
    1961      2323  INNER JOIN HASH ON s_nationkey = n_nationkey
      25        25  │└TABLE SCAN nation
    2040      2323  INNER JOIN HASH ON s_suppkey = l_suppkey
    1748      2323  │└INNER JOIN HASH ON c_nationkey = n_nationkey  <---- Bushy Join to get filter
       5         5  │ │└INNER JOIN HASH ON n_regionkey = r_regionkey
       1         1  │ │ │└TABLE SCAN region WHERE r_name = 'EUROPE'
      25         5  │ │ TABLE SCAN nation
    9093      8482  │ INNER JOIN HASH ON c_custkey = o_custkey
    8601     11654  │ │└INNER JOIN HASH ON o_orderkey = l_orderkey
   42624     40975  │ │ │└INNER JOIN HASH ON l_partkey = p_partkey
    1419      1362  │ │ │ │└TABLE SCAN part WHERE p_type = 'SMALL POLISHED NICKEL'
 5998820   5991648  │ │ │ TABLE SCAN lineitem WHERE l_suppkey >= 1
  300000    428372  │ │ TABLE SCAN orders WHERE o_orderdate >= '1995-01-01' AND o_orderdate <= '1996-12-31'
  150000    108026  │ TABLE SCAN customer WHERE c_custkey >= 3
   10000      9989  TABLE SCAN supplier
```

This is the optimal plan for this query. 
It has the lowest number of operations in each node.

DuckDB and PostgreSQL need around 6M joins to run the query, ClickHouse needs 7.6M joins
to do the same query.

### Optimising Join Count or Memory?

We've seen how PostgreSQL and DuckDB find the optimal plan for Q08.
And at this point, you may be wondering: What about SQL Server — the other competitor in our arena?

First, recall the lesson we learned in [TPC-H Q03](tpch-q03.md): 

- Sometimes, minimising the number of joins comes at a cost in memory usage

SQL Server makes this plan:

```
	
Estimate    Actual  Operator
       2         2  SORT Expr1015
       2         ∞  PROJECT Expr1017 / Expr1018 AS Expr1019
       2         2  PROJECT CASE WHEN Expr1029 = 0 THEN NULL ELSE Expr1030 END AS Expr1017, CASE WHEN Expr1031 = 0 THEN NULL ELSE Expr1032 END AS Expr1018
       2         2  GROUP BY HASH AGGREGATE COUNT(CASE WHEN n_name as n_name = 'FRANCE'THEN l_extendedprice * (1. - l_discount) ELSE 0.0000 END) AS Expr1029, SUM(CASE WHEN n_name as n_name = 'FRANCE'THEN l_extendedprice * (1. - l_discount) ELSE 0.0000 END) AS Expr1030, COUNT(Expr1020) AS Expr1031, SUM(Expr1020) AS Expr1032
    2697      2323  INNER JOIN HASH ON n_nationkey as n_nationkey = s_nationkey
      25        25  │└TABLE SEEK nation
    8047      2323  INNER JOIN MERGE ON s_suppkey = l_suppkey
   10000     10000  │└TABLE SEEK supplier
    2697      2323  SORT l_suppkey
    2697      2323  INNER JOIN HASH ON r_regionkey = n_regionkey as n_regionkey
       1         1  │└TABLE SEEK region WHERE r_name = 'EUROPE'
   13486     11656  INNER JOIN HASH ON n_nationkey as n_nationkey = c_nationkey
      25        25  │└TABLE SEEK nation
   13486     11656  INNER JOIN MERGE ON c_custkey = o_custkey
  150000    149968  │└TABLE SEEK customer
   13486     11656  SORT o_custkey
   13486     11656  INNER JOIN MERGE ON o_orderkey = l_orderkey
  427698    428381  │└PROJECT datepart(EXTRACT(YEAR FROM o_orderdate) AS Expr1015
  427698    428381  │ TABLE SEEK orders WHERE o_orderdate >= '1995-01-01' AND o_orderdate <= '1996-12-31'
   41682     40978  SORT l_orderkey
   41682     40978  INNER JOIN HASH ON p_partkey = l_partkey
    1381      1362  │└TABLE SEEK part WHERE p_type = 'SMALL POLISHED NICKEL'
 5998820   5998820  PROJECT l_extendedprice * (1. - l_discount) AS Expr1020
 5998820   5998820  TABLE SCAN lineitem
```

Unlike ClickHouse, SQL Server knows what order to take the filters.

But why does SQL Server Pick a Sort/Merge join and why doesn't it bother doing the bushy `nation` / `region`
join?

#### Merging, Hashing and Looping

The three classic join algorithms are:

- Sort and Merge Join
- Build and Hash join
- Loop and Seek Join

**Sort and Merge**: will make sure both sides of the join are sorted the same way and then
merge the streams. 
People who have programmed SAS will be quite familiar with this method. 
As a rule of thumb, Sort/Merge is almost *never* worth it when other joins are available. 
Particularly not when *both* sides need to be sorted.

**Build and Hash**: is the bread and butter join of analytical systems. 
You build a hash table on one side, the probe into that hash with the other. 
This join type is very friendly to vectorised execution and also minimises memory latency.
It is also branch prediction-friendly to the CPU.
However, it does use slight more memory. 
The hash table (unlike the sorted stream) has some overhead in terms of pointer tracking and arrays.

**Loop and Seek**: This join type is typically used for an OLTP system and also by some old,
but strong, analytical systems like Teradata.
If indexes allow it, loop joins have very low memory cost and thus allow for higher concurrency.
But their CPU consumption is significantly higher than hash joins.

Hybrid approaches exist that combine these methods — but that is the stuff for another 
blog entry.

Notice that SQL Server picks Merge join. 
We've previously seen how PostgreSQL sometimes does the same.
This preference for merge seems to be a leftover from the time when you needed to save as much
memory as possible.

SQL Server, like most advanced databases, allows us to say: "run the query as if merge join wasn't available to you".
That allows us to compare the memory use of strategy with merge and one with hash.

Force hash and loop (via `OPTION (LOOP JOIN, HASH JOIN)` the answer is:

- Query with merge, memory usage: 22MB
- Query without merge, using only hash/loop: 29MB

For the small, 1GB TPC-H dataset, the runtime is nearly identical (4.5s on my laptop).

Hence, I suspect that SQL Server picks the Merge join because it knows that it uses less memory and that
runtimes are ballpark the same.

Interestingly, even when force to use only hash and loop, SQL Server does *not* manage to find the bushy tree 
to `region` / `nation`, 

As a result, PostgreSQL and DuckDB take the winner seat for Q08 in the Arena!

# Summary

Today we further honed our skills in "human query optimising".
We found the optimal join order by taking filters in the right order and learned how to 
spot an opportunity to make a bushy join. 
The query shape we engineered is the same one that PostgreSQL and DuckDB found - and quite similar
to SQL Server's plan.

We saw that understanding the selectivity of filters is crucial to save CPU cycles when
executing complex queries and learned that sometimes, a database will pick a lower memory
option instead of the plan we want.

We also saw that even on super simple queries like this one, bad estimation can
increase the number of joins (and CPU cycles needed) significantly.
In the case of Q08 - ClickHouse ends up doing 25% more work than other query optimisers.

If you're a regular follow of my blog (and thanks for hanging around), you will soon
be able to answer the question: "is the query plan I'm getting the one I want?" — even for complex
queries.

We will practise more together in future blogs. 
I look forward to being on this journey with you.

