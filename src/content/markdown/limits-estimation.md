---
title: The limits of Estimation
publish_date: 2026-06-02
---

Today, we are going to talk about estimating filter selectivity and how to fail at it.
Two queries are similar (and simple) enough that we will analyse them together: Q12 and Q14.
These will teach us an important point about what can
and cannot be done with estimation.

## Query 14

We have two queries that both join `lineitem` with another table.
I want to start with Q14, because it is the simpler one:

Here is the query
```sql
SELECT 100.00 * SUM(CASE
                        WHEN p_type LIKE 'PROMO%'
                            THEN l_extendedprice * (1 - l_discount)
                        ELSE 0
    END) / SUM(l_extendedprice * (1 - l_discount)) AS promo_revenue
FROM tpch.lineitem
INNER JOIN tpch.part
    ON l_partkey = p_partkey
WHERE l_shipdate >= '1996-02-01'
  AND l_shipdate < '1996-03-01'
```

### Query 14 - Filter Selectivity
The filter selectivity is:

| Filter                                                     | Selectivity | Cardinality |
| ---------------------------------------------------------- | ----------: | ----------: |
| `l_shipdate >= '1996-02-01' AND l_shipdate < '1996-03-01'` |          1% |       71636 |

The size of the `part` table is 200K rows.


### Query 14 - Optimal Join Order
Using what you have learned so far, what is the right join order?
The heuristic is: Pick the largest table after filters - then join tables that reduce the stream in the order of reduction.

Since the result of filtering `lineitem` makes it smaller than the total size of `part` (which has no filter), the best join order is: `part` ⨝ `lineitem` - which in our notation meqns: build a hash table on `lineitem` and probe into it with `part`.

But, to see that this is the best join order - the database must be able to estimate the range `['1996-02-01':'1996-03-01')`.

In [SQL Arena](https://www.sql-arena.com/components/plan/theorems/tpch-q14.html) we see that only SQL Server and Databricks get this right:

```explain
Estimate    Actual  Operator
       1         1  PROJECT 100.00 * Expr1006 / Expr1007 AS Expr1008
       1         1  PROJECT CASE WHEN Expr1021 = 0 THEN NULL ELSE Expr1022 END AS Expr1006, CASE WHEN Expr1023 = 0 THEN NULL ELSE Expr1024 END AS Expr1007
       1         1  AGGREGATE COUNT(*) AS Expr1021, SUM(Expr1020) AS Expr1022, COUNT(Expr1009) AS Expr1023, SUM(Expr1009) AS Expr1024
   71586     71636  PROJECT CASE WHEN p_type LIKE 'PROMO%' THEN l_extendedprice * (1. - l_discount) ELSE 0.0000 END AS Expr1020
   71586     71636  INNER JOIN HASH ON p_partkey = l_partkey
   71586     71636  │└PROJECT l_extendedprice * (1. - l_discount) AS Expr1009
   71586     71636  │ TABLE SCAN lineitem WHERE l_shipdate >= '1996-02-01' AND l_shipdate < '1996-03-01'
   20000     60210  TABLE SCAN part WHERE BLOOM(p_partkey)
```


Interestingly, DataFusion, Trino, ClickHouse (no surprise there!) and DuckDB all get the estimate wrong and get the join order
the wrong way around.
DuckDB thinks the number of rows coming out of `lineitem` is 1200243, 15x off the real value.

Postgres gets the estimate right, but it still decides to hash build `part` and not `lineitem`. 
Not only does `part` have more rows (and PostgreSQL knows this from the estimate) - it is also *wider* than `lineitem` as we need the big `p_type` string column.
Why does Postgres do this?

I speculate that Postgres decides to join this way because believes it is
better join *from*  a foreign key (`lineitem.l_partkey`) *to* a primary key (`part.p_partkey`) than the other way around.
Having to make this  tradeoff is likely due to a bad hash table implementation in the PostgreSQL executor (while working with Yellowbrick - I replaced exactly that).


### Histogram Statistics

Why are some engines able to get the estimate of `lineitem` right and others not?
The secret is histograms, a data structure that allows you to reason about ranges like these:

- `l_shipdate >= '1996-02-01' AND l_shipdate < '1996-03-01'`  

Histograms are data structures that contain one or more "buckets" with a start and end value. 
The number of items in each bucket approximates the actual distribution in the data.

DuckDB as of the current writing only has HyperLogLog, which only gives us distinct values in the table. Distinct values don't allow DuckDB to estimate range predicates.

In summary: To estimate a range predicate correctly, you need some kind of histogram data structure.
Not all databases implement those. 
In case you are wondering: Yes, [FloeDB](https://www.floedb.ai) has histograms.

With histograms, we can accurately estimate range predicates.
But what happens if we have predicates on more than one column?


## Query 12 - Multiple filters

Here, we have Query 12, again featuring `lineitem`.

But this time, we have some really interesting filters.

```sql
SELECT l_shipmode,
       SUM(CASE
               WHEN o_orderpriority = '1-URGENT'
                   OR o_orderpriority = '2-HIGH'
                   THEN 1
               ELSE 0
           END) AS high_line_count,
       SUM(CASE
               WHEN o_orderpriority <> '1-URGENT'
                   AND o_orderpriority <> '2-HIGH'
                   THEN 1
               ELSE 0
           END) AS low_line_count
FROM tpch.lineitem
INNER JOIN tpch.orders
    ON o_orderkey = l_orderkey
WHERE l_shipmode IN ('AIR', 'TRUCK')
  AND l_commitdate < l_receiptdate
  AND l_shipdate < l_commitdate
  AND l_receiptdate >= '1994-01-01'
  AND l_receiptdate < '1995-01-01'
GROUP BY l_shipmode
ORDER BY l_shipmode
```

### Query 12 - Selectivity of Filters

The usual analysis:

| Filter                                                           | Selectivity | Cardinality |
| ---------------------------------------------------------------- | ----------: | ----------: |
| `l_receiptdate >= '1994-01-01' AND l_receiptdate < '1995-01-01'` |         15% |        909K |
| `l_shipmode IN ('AIR', 'TRUCK')`                                 |         28% |        1.7M |
| `l_commitdate < l_receiptdate`                                   |         63% |        3.8M |
| `l_shipdate < l_commitdate`                                      |         49% |        2.9M |

The actual selectivity of all the filters taken together is 0.5% with around 31K rows.

### Query 12 - Optimal Join Order

If we can estimate the filter on `lineitem` correctly, we can also say with certainty that the right join order
is: `orders` ⨝ `lineitem`.

Databricks, SQL Server and Postgres get this right - though as we shall see - it not quite clear how.
DuckDB, lacking range estimation, relies on pure luck to get the join order right even though its estimates are off by 440x.


### Estimating Disjunctions

Consider this filter: `l_shipmode IN ('AIR', 'TRUCK')`.
You estimate it by realising that:

- `l_shipmode IN ('AIR', 'TRUCK')` => `l_shipmode = 'AIR' OR l_shipmode = 'TRUCK'`

As long as you can estimate equality, you can also estimate a disjunction of equalities (i.e. "or'ing equals together") - you just
add the estimate of `'AIR'` to the estimate of `'TRUCK'`.

Strictly speaking, we don't need a histogram to estimate an equality predicate.
If we know how many distinct values are in the column (for example, via HyperLogLog or a Theta Sketch) and
if we assume uniformity, we can estimate:

- Estimate(`l_shipmode = 'AIR'`) = |`lineitem`| / ndistinct(`l_shipmode`)

Note that in the case of filtering on a key in the table, this estimate becomes 1 row (as we should expect).
Of course, none of this works if the values in the table are skewed - and we are back to histograms.

### Histogram Feature Check

Like query 14, there is a "feature check" for histograms in query 12.

This filter is easily estimable using the same logic we applied previously:

- `l_receiptdate >= '1994-01-01' AND l_receiptdate < '1995-01-01'` 

### Correlation Between Columns

Unfortunately, Query 12 isn't done torturing us yet.
What are we to make of filters like these:

- `l_commitdate < l_receiptdate`                 
- `l_shipdate < l_commitdate` 

Here, we are asking for very specific correlations between columns.
Histograms, at least in their simple form, won't get us anywhere.

But it is, at least in theory, possible to estimate these filters. 
One way to do that is to maintain statistics on computed (or "virtual") columns in a table.

Imagine you kept a histogram over this calculation:

- `l_receiptdate - l_commitdate`

We could estimate our filter on `l_commitdate < l_receiptdate` by counting the number of histogram rows greater than zero.
As far as I am aware, none of the engines currently in SQL Arena do this.

This means that even advanced database engines end up making a wild guess for filters like `l_commitdate < l_receiptdate`.
By convention, a "wild guess" in the database industry is typically 33.3% (one third).

Before we muddy the waters further, what do we have so far:

- Estimating equalities and disjunctions of equalities can be approximated if you know the number of distinct values in the column.
- Without histograms, you cannot estimate range predicates
- Filters that involve comparing columns cannot be estimated without advanced statistics on computed expressions

But we're not done yet...

### Correlation between Filters

Even if we assume a perfect estimate of each filter in the query, we are still stuck with another question: "How do we estimate
the *combined* selectivity of filters?"

As far as I am aware, there are a few models in wide use here:

**Assumption of independence**: Here, we assume all filters are fully independent and that we can simply multiply their selectivity.
That gives us a combined selectivity of 1.3%, which is *very* close to the value that Postgres and Databricks estimate.

**Assumption of rough correlations**: Assume that every filter after the most selective (the range on `l_receiptdate` in our case) is less and less important. 
Typically, you use a square root progression to reduce the effect of future filters.
The selectivity becomes something like this:

- 15% * sqrt(28%) * sqrt(sqrt(49%)) * sqrt(sqrt(sqrt((63%))))

This is very close to the value SQL Server estimates. 
Likely this is also roughly what DuckDB does, though it does *not* have histograms so it has to make a wild (quackers?) guess
on the individual filters.

**Correlated Statistics**: Either through user intervention or clever machine learning, collect statistics about the correlation
of columns that allow you to make informed guesses about combined filters.
As far as I can tell, none of the engines under test does this.

**Sample before you run**: If you think the query will take a long time to run (and good luck estimating that), you could sample
the filters in the query from a small subset of the data. Using this sample, you can then extrapolate the selectivity.
I believe that Redshift sometimes will do this.

Unfortunately, sampling is not a panacea. 
You might end up in a situation where sampling takes longer than it would to run the query with a bad query plan.

## Summary

The premise of "relational databases" is that the user describes *what* they want and the database figures out *how* to retrieve it
quickly.

But as we have seen today, even trivial queries like those joining *two* tables in TPC-H can defeat this goal of automatically generating the optimal query plan.

Good plan generation relies on features such as:

- Distinct counting (HyperLogLog and Theta Sketches)
- Histograms
- Most Common Values
- Learned or declared correlations in data

Without these, you are needlessly burning compute and storage. 
It's your cloud bill - make of that what you wish.

### Implications for those who think databases should be proof machines

It's important to realise that even good statistics have limits. 
As a database designer, you are in an arms race with your users.
Every time you come up with a better way to gather statistics and reason about plans, the universe conjures up a user 
who writes even crazier queries than you thought possible.

Here are some real-world examples of stuff users do:

```sql
-- Search forms
WHERE (@p1 IS NULL OR col1 = @p1)
  AND (@p2 IS NULL OR col2 LIKE '%' + @p2 + '%')

-- Bad input data. Do we need a new domain for Strings that are trimmed?
WHERE TRIM(col1) = @p1 

-- My refusal to use NULL for "I don't know" does not match your idea of beauty
WHERE col1 IS NULL OR col1 = ' ' OR ASCII(LEFT(col1,1)) = 0 

-- We couldn't agree whether to use DECIMAL or FLOAT, maybe this works?
WHERE ABS(col1 - 0.6) < 0.00001

-- Who was the idiot that made the default value 0?
WHERE CASE col1 WHEN 0 THEN NULL ELSE col2 / col1 END > 0.5;

```

The mathematical "beauty" of relational algebra and the promise of separating the logical and physical models breaks down
when faced with the reality of how users *actually* want to retrieve data, and how data behaves in the real world.
Normalisation is a noble goal - but it isn't always clear if something is a functional dependency or not.

You can't a priori model what you don't yet know.
The world is not bound by some law of nature that says it must be cleanly expressible as relations and attributes.

UX designers have known this fact forever, but database designers tend to forget it: users know what their reality is when they see it (or in the case of databases: query it) - not through an act of philosopical analysis.

Often, you are simply better off learning from what users do and adapt accordingly. 
I see great promise with LLMs here, they are good at spotting the patterns we keep repeating.

The query optimiser is ultimately a heuristic machine: a bag of tricks learned from rough encounters with the real world.
Sometimes, you have no choice but to materialise complex expressions users frequently query. 
And you may not be able to transparently rewrite queries to make use of those expressions.
Is complex filtering a physical implementation detail we can glaze over during data modelling?

It isn't just user-created models that have this problem.
Like all large code bases, databases themselves accumulate years of pragmatism and scars from encountering the mess that is the
real world. 

**Example:** I don't mean to always call out PostgreSQL - but it is such a juicy target and I can't help myself.
For all PostgreSQL's noble goals of calling its tables "relations" (as in `reltuples`), it then proceeds to store those
relations in a table/relation called `pg_class` (classes being the very antithesis to relations for many designers).

It calls its columns "attributes" in `pg_attribute` - yet proceeds to implement `ALTER TABLE foo ALTER COLUMN bar`.
And when it comes to relational data modelling - it fails even at that task, when modelling its very own statistics. (as we saw above).

Battle scars - anyone who has ever made a database have them.
