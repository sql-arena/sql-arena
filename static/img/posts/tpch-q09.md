---
title: "TPC series - TPC-H Query 9 - Composite Key Joins and Pre-aggregation"
date: "2025-12-08"
tags: 
  - "query-planning"
  - "tpch"
  - "aggregate"
---

Today's query will give us a new insight about about query optimisers — because one of the joins  
contains a little extra surprise: Composite key joins. 
We will also learn about a new, strong optimisation that we haven't seen before: Aggregating before joining.

This is the first time we encounter some series work on `partsupp` and its strange relationship to `lineitem`

Let us proceed in the familiar way.


# Query 9

The query involves all the usual suspects and our new friend: `partsupp`. 
Pay particular attention to the join between `lineitem` and `partsupp`.
We're looking for suppliers that can deliver the specific item in `lineitem` matching
the colour we want (via `p_name`)

```sql
SELECT nation,
       o_year,
       SUM(amount) AS sum_profit
FROM (SELECT n_name                                                          AS nation,
             EXTRACT(YEAR FROM o_orderdate)                                  AS o_year,
             l_extendedprice * (1 - l_discount) - ps_supplycost * l_quantity AS amount
      FROM tpch.lineitem
      INNER JOIN tpch.part ON l_partkey = p_partkey
      INNER JOIN tpch.supplier ON l_suppkey = s_suppkey
      INNER JOIN tpch.nation ON s_nationkey = n_nationkey
      INNER JOIN tpch.partsupp ON l_partkey = ps_partkey AND l_suppkey = ps_suppkey
      INNER JOIN tpch.orders ON l_orderkey = o_orderkey
      WHERE p_name LIKE '%grey%') AS profit
GROUP BY nation,
         o_year
ORDER BY nation,
         o_year DESC

```

## Filter Selectivity

The selectivity of the filters depends somewhere on data generation and random picks of `p_name`.

There is also an interesting trap here. The data in TPC-H is made in such a way that 
*every* combination of `l_partkey` and `l_suppkey` in `lineitem` has a corresponding match in `partsupp`.
But how can the optimiser know?

The selectivity numbers are:

| Filter                                              | Selectivity | Cardinality |
|-----------------------------------------------------|------------:|------------:|
| `p_name LIKE '%grey%'`                              |          6% |        ~10K |
| `l_partkey = ps_partkey AND l_suppkey = ps_suppkey` |        100% |         ~6M |

# Optimal Join Order

There is only one filter worth taking in this query: `p_name LIKE '%grey%'`. 
As always, `lineitem` is the largest stream of data — so we want to get to `p_name` as fast as possible.
By transitive closure of the keys in the data model, we can know that a filter on `ps_partkey` is *also* a filter 
on `l_partkey`. 
In other words: The filter on `p_name` also reduces `partsupp`.

With perfect knowledge of statistics, it would appear that the best initial join order is:

- `part` -> `partsupp` (taking the reduction) -> `lineitem`

Since `partsupp` is much smaller than `lineitem` (by about an order of magnitude) it makes sense that any hash strategy
should construct a hash table on the result of `part JOIN partsupp` and then join that to `lineitem`. 

## SQL Server — Good, but mostly by accident
That is indeed what SQL Server does in this join tree:

```
   45608    327802  │ INNER JOIN HASH ON l_suppkey = ps_suppkey AND l_partkey = p_partkey
   45542     43756  │ │└INNER JOIN HASH ON ps_partkey = p_partkey
   11385     10939  │ │ │└TABLE SEEK part WHERE p_name LIKE '%lace%'
  800000    800000  │ │ TABLE SCAN partsupp
   59988    327802  │ PROJECT l_extendedprice * (1. - l_discount) AS Expr1017
```

But notice how wrong the estimate is for the join on the composite key: 45608 estimated, 372802 actual.

SQL Server simply got lucky.

## PostgreSQL - Pragmatic Luck

PostgreSQL, like SQL Server, finds the optimal plan:

```
     192    327800  │ │└INNER JOIN LOOP ON l_partkey = ps_partkey
   62560     43756  │ │ │└INNER JOIN HASH ON ps_partkey = p_partkey
    5050     10939  │ │ │ │└TABLE SCAN part WHERE p_name LIKE '%lace%'
 1032260    800000  │ │ │ TABLE SCAN partsupp
   43756    306292  │ │ TABLE SEEK lineitem WHERE ps_suppkey = l_suppkey
```

Again, notice how wrong the estimate is for the join to `partsupp`: 192 estimate vs 372800 actual.

## Quackers — A very confused DucKDB!

DuckDB has another opinion about this join, here is what it does:

```
Estimate    Actual
 5432872    327773  INNER JOIN HASH ON l_suppkey = s_suppkeyp_partkey = ps_partkey
  894974    799921  │└INNER JOIN HASH ON ps_suppkey = s_suppkey   <--- Pay attention this this!
    9615     10000  │ │└INNER JOIN HASH ON s_nationkey = n_nationkey
      25        25  │ │ │└TABLE SCAN nation
   10000     10000  │ │ TABLE SCAN supplier
  800000    799921  │ TABLE SCAN partsupp WHERE ps_suppkey >= 1
 1212281    327773  INNER JOIN HASH ON l_orderkey = o_orderkey
 1500000   1500000  │└TABLE SCAN orders
 1201548    327773  INNER JOIN HASH ON l_partkey = p_partkey
   40000     10939  │└TABLE SCAN part WHERE contains(p_name,'lace')
 5998820   5997992  TABLE SCAN lineitem WHERE l_suppkey >= 1
```

DuckDB correctly figures out that if I filter on `p_partkey` that must mean I filter on *both*
`ps_partkey` and `l_partkey` (though transitive closure).

But then it does something really odd. 
It does *not* take the implied filter on `partsupp`. 
It instead goes after `orders` first. 
It is not a big deal, because as we know, filtering `lineitem` also filters `orders`
But, what is going on here? 
Why isn't DuckDB finding the bushy join?

Have a look at this estimate:
```
Estimate  Actual
894974    799921  │└INNER JOIN HASH ON ps_suppkey = s_suppkey
```

DuckDB thinks that joining `partsupp` with `lineitem` creates *more* rows than comes into the join!

This is likely an artefact of the HyperLogLog that DuckDB is using to estimate join cardinality.
It is also likely to be a pretty bad algorithm to create estimation boundaries.

Here is how you would typically argue:

- I'm joining on some multi column
- I'm not sure how large the estimate is
- But since the user is joining on two columns - it is probably a key
- So... The total size of the output is not bigger than either size of the join input

DuckDB doesn't take this line of reasoning.

## ClickHouse once again embarrasses itself

Here is the plan that ClickHouse makes:

```
Estimate    Actual  Operator
       -       175  PROJECT SUM(amount)
       -       175  SORT nation, o_year
       -       175  GROUP BY HASH nation, o_year AGGREGATE SUM(amount)
       -    295609  PROJECT EXTRACT(YEAR FROM o_orderdate), ps_supplycost * l_quantity, n_name, 1 - l_discount, EXTRACT(YEAR FROM o_orderdate), l_extendedprice * (1 - l_discount), (l_extendedprice * (1 - l_discount)) - (ps_supplycost * l_quantity), (l_extendedprice * (1 - l_discount)) - (ps_supplycost * l_quantity)
       -    295609  INNER JOIN HASH ON s_nationkey = n_nationkey
       -        25  │└TABLE SCAN nation
       -    295609  INNER JOIN HASH ON l_suppkey = s_suppkey
       -     10000  │└TABLE SCAN supplier
       -    295630  INNER JOIN HASH ON l_partkey = p_partkey
       -     10886  │└TABLE SCAN part WHERE p_name LIKE '%lace%'
       -   5419720  INNER JOIN HASH ON (l_suppkey,l_partkey) = (ps_suppkey,ps_partkey)
       -    800000  │└TABLE SCAN partsupp
       -   5419720  INNER JOIN HASH ON l_orderkey = o_orderkey
       -   1500000  │└TABLE SCAN orders
       -   5998820  TABLE SCAN lineitem
```

As the human query optimiser, you've become — reflect for a moment on how terrible a plan this is.

ClickHouse doesn't even bother collecting the filter on `p_name` until after it has done a series of joins.
In fact, does something stand out about this join tree for you?

If we follow the relationships between the tables in the data model, draw them as a tree and order the 
children by total table size, we get:

```
lineitem    6M
├order     1.5M
├partsupp  800K
├part      200K
└supplier   10K
 └nation     25
```

Turn the above upside down, and you got the join order that ClickHouse picked.

Coincidence? Perhaps...

Going forward in this blog series, I don't think it is worth analysing ClickHouse plans any further.
It is just too embarrassing to look at!
When ClickHouse gets itself a proper planner - I will be happy to reevaluate my position.

## Why is estimating the join between `partsupp` and `lineitem` so hard?

Previously we saw that joining `lineitem` with `partsupp` does not reduce rows.
In my TPC-H setup, there is no composite, foreign key between these tables.
But the data is made in such a way that there is always a match.
How can the optimiser know that there won't be a row reduction when joining these two tables?

The answer: It can't!

Let us summarise what the three optimisers we now care about think of this join.

If we execute this:

```sql
SELECT COUNT(*) 
FROM lineitem 
JOIN partsupp 
  ON l_partkey = ps_partkey AND l_suppkey = ps_suppkey
```

We can get the "raw estimate" and it is:

| Optimiser  | Estimate |  Actual | Estimated Selectivity | 
|------------|---------:|--------:|----------------------:|
| DuckDB     | 12564486 | 5998820 |                  209% |
| PostgreSQL |      608 | 5998820 |                 0.01% | 
| SQL Server |   801167 | 5998820 |                   13% |

The actual selectivity is 100%.

Notice how these estimates are all over the place.

- Postgres Likely thinks that both `ps_partkey` and `ps_suppkey` are filters in `lineitem` and thus reduce by what
  it believes the combined selectivity is
- SQL Server thinks along the same lines. 
  But its algorithm for combining selectivity is much less aggressive when multiple filters are in play
- DuckDB is using an entirely different estimation algorithm and gets the estimate terribly wrong


### Trying to help the Optimiser with `lineitem` and `partsupp`

I tried doing this with PostgreSQL:

```sql
CREATE STATISTICS stat_lineitem1 (ndistinct) ON l_partkey, l_suppkey FROM tpch.lineitem;
CREATE STATISTICS stat_pspartsupp1 (ndistinct) ON ps_partkey, ps_suppkey FROM tpch.partsupp;
CREATE STATISTICS stat_lineitem2 (DEPENDENCIES ) ON l_partkey, l_suppkey FROM tpch.lineitem;
CREATE STATISTICS stat_pspartsupp2 (DEPENDENCIES ) ON ps_partkey, ps_suppkey FROM tpch.partsupp;
```

But unfortunately, this doesn't seem to influence the bad estimate — I get the same estimation.
PostgreSQL people in my network, please tell me that I'm doing something wrong here!

However, if I do *this* in SQL Server:

```sql
CREATE STATISTICS stat_lineitem1 ON tpch.lineitem(l_partkey, l_suppkey) ;
CREATE STATISTICS stat_pspartsupp1 ON tpch.partsupp (ps_partkey, ps_suppkey);
```

Then, my estimate is now: 5967483 rows. Bang on the money!

Your takeaway from this should be: Estimating composite key joins is *hard*.

# Optimal Join order: Continuing the join chain

After we've taken the filters, the rest of the join order doesn't matter much.

Let us look at what tables we still need to join

- `order`
- `supplier`
- `nation` (via `supplier`)

## `orders` First
All the databases with decent optimisers go after `orders` before the two others. 
This makes sense, because we have a calculation we need to do: `EXTRACT(YEAR FROM o_orderdate)`

Since we've reduced `lineitem` via `part` we know that a similar reduction has to occur in `orders` (because
of the keys in the data model).
This means we should join `orders` next and get that calculation done, we know there won't be any more
row reductions - because from here we're joining on FK/PK relationships without further filters.

## `supplier` and `nation`

We can only reach `nation` by going after `supplier` first.
Whenever we see one of these "go via X to get to Y" it generally means there is an opportunity for a bushy join.

We could join `nation` with `supplier` and then join the result of that to `lineitem`. 
Indeed, this is what DuckDB decides to do in this fragment:

```
    9615     10000  │└INNER JOIN HASH ON s_nationkey = n_nationkey
      25        25  │ │└TABLE SCAN nation
   10000     10000  │ TABLE SCAN supplier
```

... Or we could be memory conservative at the expense of CPU time and do loop joins into `supplier` and then hash
join to `nation` (recall that `nation` is tiny - 25 rows).
This saves us the trouble of building a hash table on `supplier` - but it means we instead have to dig into indexes
with loop joins (which is a lot more expensive in CPU).

This is exactly what PostgreSQL does, which is probably not a surprise to you at this point:

```
     148    245492  INNER JOIN HASH ON s_nationkey = n_nationkey
      25        25  │└TABLE SCAN nation
     148    245492  INNER JOIN LOOP ON s_suppkey = l_suppkey
     148    245520  │└INNER JOIN LOOP ON o_orderkey = l_orderkey
     148    245520  │ │└INNER JOIN LOOP ON l_partkey = ps_partkey <---- Notice the bad estimate here
   46920     32792  │ │ │└INNER JOIN HASH ON ps_partkey = p_partkey
   10100     10940  │ │ │ │└TABLE SCAN part WHERE p_name LIKE '%lace%'
  774192    600000  │ │ │ TABLE SCAN partsupp
   32792    229544  │ │ TABLE SEEK lineitem WHERE ps_suppkey = l_suppkey
  245520    245520  │ TABLE SEEK orders
  245520    245520  TABLE SEEK supplier
```

Notice that we still end up joining 245492 times to get the `n_name` column that we need for the final aggregate.

SQL Server will have none of this nonsense... Once again, it has a trick to play.

## Aggregate before Join

Before we go into the details of SQL Server's optimisations, consider what its query plan looks like:

```
Estimate    Actual  Operator
     175       175  PROJECT CASE WHEN globalagg1019 = 0 THEN NULL ELSE globalagg1021 END AS Expr1016
     175       175  GROUP BY HASH ,  AGGREGATE SUM(partialagg1018) AS globalagg1019, SUM(partialagg1020) AS globalagg1021
     175       175  SORT n_name, Expr1014
     175       175  INNER JOIN MERGE ON n_nationkey = s_nationkey   <---- Only 175 joins here!
      25        25  │└TABLE SEEK nation
     175       175  SORT s_nationkey            v---- what is THIS?
     175       175  GROUP BY HASH AGGREGATE COUNT(Expr1017 - ps_supplycost * l_quantity) AS partialagg1018, ...
   34408    245491  INNER JOIN MERGE ON o_orderkey = l_orderkey
 1500000   1499999  │└PROJECT datepart(EXTRACT(YEAR FROM o_orderdate) AS Expr1014
 1500000   1499999  │ TABLE SEEK orders
```

SQL Server only does 175 joins to `nation` - as opposed to the 245K that both DuckDB and PostgreSQL does.

How does it pull this off? 
It reasons like this:

- I'm eventually going to group on `GROUP BY nation, o_year`
- `nation` is an alias to `n_name` and there are only 25 of those
- `o_year` is an alias to `EXTRACT(YEAR FROM o_orderdate)` and I know there are only 7 of those (statistics again!)
- That must mean that in the worst case, there are only 25 * 7 = 125 rows possible in that `GROUP BY`
- There are also 25 unique `n_nationkey`
- If I just group on `n_nationkey` first, then I can just join to `nation` later and get the `n_name`

This optimisation of aggregating before doing a join is relatively rare. 
It also seems very hard for the PostgreSQL community to wrap its head around this feature that SQL Server
has done since SQL Server 2005 (released in the year of its name).

For example, see:

- [CommitFest 2018](https://commitfest.postgresql.org/patch/1685/)
- [Partial Agg before join](https://www.postgresql.org/message-id/CAKJS1f9kw95K2pnCKAoPmNw%3D%3D7fgjSjC-82cy1RB%2B-x-Jz0QHA%40mail.gmail.com)

This aggregate before joining optimisation is often a powerful trick in analytical queries. 
TPC-H Query 9 checks if it is present and reward SQL Server with the lowest join count.

# Summary for Data Vaulters and Logical Data modellers

At this point, I hope it should be clear that data models that require multiple columns filters to
join two tables present a unique challenge to query optimisers.

This is not a challenge easily solved — even with highly advanced optimisers like SQL Server (which has
been tweaked and expanded for 40 years).

Often, a logical data model will have composite keys — because that is what the "problem domain" requires.
But surrogate keys are simply better in most cases — because they make estimation easier and joins more effective.

If you absolutely *must* use composite keys, make sure you declare primary/foreign keys on the key relation
and add statistics if your database allows it.
Did you say you care about scaling and that the cloud is how you get it? 
Oh, I'm sorry — you are out of luck. 
Because many of these scale-out cloud databases can't enforce such keys or even declare them.

If you're a Data Vaulter, you may have seen joins of this form (for PIT tables):

```sql
JOIN SAT_CUSTOMER.CUSTOMER_SK = All_Changes.CUSTOMER_SK 
 AND All_Changes.BUSINESS_EFFECTIVE_DATETIME_KEY >= SAT_CUSTOMER.BUSINESS_EFFECTIVE_DATETIME_KEY 
 AND All_Changes.BUSINESS_EFFECTIVE_DATETIME_KEY < SAT_CUSTOMER.BUSINESS_EXPIRY_DATETIME_KEY 
 AND All_Changes.LOAD_DATETIME >= SAT_CUSTOMER.LOAD_DATETIME  
```

Can you see the problem? The entire data model is infected with these types of join!

Once again, we refer back to the wisdom of Ralph Kimball and his use of surrogate keys: they're there
for other reasons than making the key smaller and faster. 
They help optimisers!

# Summary for the rest of us

Today in Query 9, we saw that estimating composite key joins can be challenging without composite statistics. 
Composite statistics typically have to be added manually by a database tuner.

We also saw that optimisers can save many join operations if they understand how to
aggregate data before joining it.
But the optimiser can only do so if it has good statistics and knowledge of the data.


