---
title: "TPC series - TPC-H Query 6 - Expression Optimisation"
date: "2025-10-13"
tags: 
  - "performance"
  - "query-planning"
  - "tpch"
  - "column"
  - "row"
---
And now, for something completely different. 

This week on TPC-H query analysis - we are not going to look at join ordering.
Today's query does not *have* any joins.

But as we shall see, there is still performance to be had for a clever query optimiser.

# Query 6
Here is the simple query.

```sql
SELECT SUM(l_extendedprice * l_discount) AS revenue
FROM tpch.lineitem
WHERE l_shipdate >= '1994-01-01'
  AND l_shipdate < '1995-01-01'
  AND l_discount BETWEEN 0.03 AND 0.05
  AND l_quantity < 24
;
```

No joins, just a few filters. 

As always, we start with a selectivity analysis

## Selectivity of Filters

| Filter                                                     | Selectivity | Cardinality |
|------------------------------------------------------------|------------:|------------:|
| `l_shipdate >= '1994-01-01' AND l_shipdate < '1995-01-01'` |         14% |      856332 |
| `l_discount BETWEEN 0.03 AND 0.05`                         |         30% |     1799915 |
| `l_quantity < 24`                                          |         46% |     2817735 |

You will notice that `l_quantity` is significantly more selective than the two other filters.

Due to the way TPC-H is generated, these filters are independent. 
That means that as you use all filters, you will reduce the rowcount coming out of `lineitem` to: 14% * 30% * 46% ~ 2%.

## Predicate Evaluation order

We aren't allowed indexes on any of these columns in TPC-H. 
We're however allowed to partition data in `l_shipdate` if we so desire. 
But, for this blog - which is after all educational - I'm going to assume all data is randomly tossed
into a large table. 
The arguments I will put forward here hold, even with partitioning applied to the workload — the results are just less 
pronounced as you optimise more.
In our test, there is no ordering in the insertion of record.
All data is completely randomized.


If we think about table scanning as looping over the records in the table, we will want to skip records as 
fast as we can.

That means we should evaluate the best filters first - taking `l_quantity < 24` before anything else. 
In Python code - what we want is something like this:

```python
for row in lineitem:
  if not (row.l_quantity < 24):
     continue
  if not (0.03 <= row.l_discount <= 0.05):
     continue 
  if not ('1994-01-01' <= l_shipdate >< '1995-01-01'):
     continue
  emit_row(row)
```

This idea of bailing out as early as possible is called "short-circuit evaluation".

Given decent statistics - particularly a histogram - a query optimiser should be able to determine that this ordering
is the best one.

### Short-Circuit Evaluation vs. Branch Elimination

When you use SIMD vectorisation for execution, you have to ask an important question:  
Is it worth short-circuiting filter evaluation or is it better to just evaluate all filters and combine them?

Consider the optimal filter evaluation order again — this time with some comments:

```python
for row in lineitem:
  if not (row.l_quantity < 24):                        
     continue                                          # 46% of the time
  if not (0.03 <= row.l_discount <= 0.05):             
     continue                                          #  46% * 30% of the time
  if not ('1994-01-01' <= l_shipdate < '1995-01-01'): 
     continue                                          #  46% * 30% * 14% of the time
  emit_row(row)
```

Might it be better to do this instead:

```python
for row in lineitem:
  should_emit = True
  should_emit &= (row.l_quantity < 24)
  should_emit &= (0.03 <= row.l_discount <= 0.05)
  should_emit &= ('1994-01-01' <= l_shipdate < '1995-01-01')  
  if should_emit:  
    emit_row(row)                                      #  2% of the time
```

Why would you *ever* consider this latter method — isn't it doing more work? 
Because CPU execution pipelines don't like branches. 
A CPU will try to "guess" what the next instruction to run is — and it will get this instruction from memory
(this is called "prefetching"). 
If the CPU guesses right, the next instruction can immediately be executed.
But if the CPU makes the wrong guess - then it will need to wait for that instruction to be ready to execute. 
A wait like this can take a very long time (in CPU terms) - hundreds of CPU cycles. 
It might have been better to make the guessing simpler - and then pay the CPU cost of doing too many integers compares.

Incidentally, this reordering of expressions (which the SQL standard allows) is also why *this* is an error:

```sql
SELECT 
FROM foo
WHERE denominator <> 0 
  AND numerator / denoninator = 0.5 -- This might cause division by zero error!
``` 

The database is *not* required to evaluate the `denominator <> 0` before it evaluates `numerator / denoninator`.
This is not a bug — this is just the way databases work!

The safe and correct way to do this is:

```sql
SELECT 
FROM foo
WHERE CASE WHEN denominator <> 0 THEN numerator / denoninator ELSE NULL END = 0.5
```

## Narrow Scans and Column Stores

Here is the DDL for `lineitem`, with rough comments on how large each column is on disk

```sql
CREATE TABLE tpch.lineitem
(
    l_orderkey      INT,               -- 4B
    l_partkey       INT,               -- 4B
    l_suppkey       INT,               -- 4B
    l_linenumber    INT,               -- 4B
    l_quantity      DECIMAL(15, 2),    -- 8B (more of Postgres) 
    l_extendedprice DECIMAL(15, 2),    -- 8B
    l_discount      DECIMAL(15, 2),    -- 8B
    l_tax           DECIMAL(15, 2),    -- 8B
    l_returnflag    VARCHAR(1),        -- 3B
    l_linestatus    VARCHAR(1),        -- 3B
    l_shipdate      DATE,              -- 3-4B
    l_commitdate    DATE,              -- 3-4B
    l_receiptdate   DATE,              -- 3-4B
    l_shipinstruct  VARCHAR(25),       -- 27B
    l_shipmode      VARCHAR(10),       -- 12B
    l_comment       VARCHAR(44)        -- 46B
);

```

The size of a row in this table is roughly **~150B**

But, for this query we only need:

- `l_extendedprice` (8B)
- `l_discount` (8B)
- `l_quantity` (8B)
- `l_shipdate` (3-4B)

Total **~28B** - which is only around 20% of the total row size.

Column stores are a killer optimization for this query because it allows us to visit only 20% of the data, even
if we fully scan the table.

<aside>
Beacuse I'm lazy person - I asked ChatGPT (Version 5 - paid subscription) to add up the sizes in the DDL above.

It gave me this "formula":
<pre>
4 + 4 + 4 + 4 +
8 + 8 + 8 + 8 +
3 + 3 +
4 + 4 + 4 +
27 + 12 + 46
</pre>

And then, it said: 

<pre>
"= 141 bytes per row (approximate physical size excluding alignment and row header overhead)"
</pre>

Good luck with your AI revolution fanboys!
</aside>


# Actual Database runs

I used two different versions of the query to test whether the database can re-order the expressions. 

This one, I call: **Ship first**

```sql
-- Ship First
SELECT SUM(l_extendedprice * l_discount) AS revenue
FROM tpch.lineitem
WHERE l_shipdate >= '1994-01-01'
  AND l_shipdate < '1995-01-01'
  AND l_discount BETWEEN 0.03 AND 0.05
  AND l_quantity < 24;
```

And this one is: **Quantity First**

```sql
-- Quantity First
SELECT SUM(l_extendedprice * l_discount) AS revenue
FROM tpch.lineitem
WHERE l_quantity < 24
  AND l_discount BETWEEN 0.03 AND 0.05
  AND l_shipdate >= '1994-01-01'
  AND l_shipdate < '1995-01-01'
```

If the predicates are evaluated in the order they are written, then we expect **Quantity First** to be faster.

Let me stress this: As a user, I shouldn't care. The two queries *should* have identical speed. 

In the following, I will run every query 10 times, to make sure we tease out any fluctuations in the data.

To see if databases actually do these optimizations - and if they even matter - I wanted my first test to be a really
slow database where any runtime difference would be clearly visible. 
PostgreSQL is the obvious choice given those constraints!


## PostgreSQL Results

First, the data.
Timings are measured with `EXPLAIN ANALYSE` taking the `Execution Time:` output. 
The initial run was discarded to remove any I/O cost from the equation.


| Data       |   Ship First | Quantity First |
|------------|-------------:|---------------:|
| Run 1      |       272 ms |         340 ms |
| Run 2      |       277 ms |         345 ms |
| Run 3      |       273 ms |         347 ms |
| Run 4      |       285 ms |         336 ms |
| Run 5      |       284 ms |         338 ms |
| Run 6      |       280 ms |         348 ms |
| Run 7      |       267 ms |         349 ms |
| Run 8      |       278 ms |         327 ms |
| Run 9      |       271 ms |         362 ms |
| Run 10     |       274 ms |         358 ms |
| **Median** | **275.5** ms |     **347 ms** |

There is very clearly a difference in runtime here.

Note that in the **Ship First** result we actually mentioned the least selective filter first — which indicates
that postgres may have evaluated the expression in the reverse order of the way it was written. 

We can even see the evaluation order is different in the `EXPLAIN` output. 
Let me show you the crime against computer science aesthetics that is PostgreSQL explain:

**Ship First:**

```
->  Parallel Seq Scan on lineitem_opt  (cost=0.00..58855.72 rows=6 width=64) (actual time=0.021..129.697 rows=24148 loops=5)
      Filter: ((l_shipdate >= '1994-01-01'::date) AND (l_shipdate < '1995-01-01'::date) AND (l_discount >= 0.03) AND (l_discount <= 0.05) AND (l_quantity < '24'::numeric))
      Rows Removed by Filter: 1175616
```

**Quantity First:**

```
->  Parallel Seq Scan on lineitem  (cost=0.00..134871.36 rows=29960 width=12) (actual time=0.055..272.606 rows=24148 loops=5)
      Filter: ((l_quantity < '24'::numeric) AND (l_discount >= 0.03) AND (l_discount <= 0.05) AND (l_shipdate >= '1994-01-01'::date) AND (l_shipdate < '1995-01-01'::date))
      Rows Removed by Filter: 1175616
```

Different plans, even after "optimisation".

*side note: `Row Removed by Filter` is not correct - yet another bug in PG explain*


### PostgreSQL: Is it the missing Column Store?

Because I'm such a nice person, I want to give PostgreSQL a chance to redeem itself from the general embarrassment
this blog series has caused it.

I want it to be a good database, I really do — I just can't find evidence that it is.

Let us help it out a bit. 
Remember how I told you that column stores are a killer optimization for a query like this?
How about we do this to level the playing field:

```sql
CREATE TABLE tpch.lineitem_opt
AS
SELECT l_extendedprice
     , l_discount
     , l_quantity
     , l_shipdate
FROM tpch.lineitem;
```

If we now use `tpch.lineitem_opt` for the query, we get: ~190 ms for **Ship First** (versus 275 ms).

Certainly better, but not what we would expect from reducing scan sizes by 80%.

Let us look at someone who understands performance a bit better...

## ClickHouse Results

Clickhouse uses columnar evaluation and storage. It also uses vectorized filter execution - which indicators that
it might not short-circuit filters.
My initial guess was that the two queries will have the same speed.

Timings are measured with `--time` in `clickhouse client`.


| Data       |    Ship First | Quantity First |
|------------|--------------:|---------------:|
| Run 1      |        33 ms	 |          33 ms |
| Run 2      |        29 ms	 |          29 ms |
| Run 3      |        32 ms	 |          25 ms |
| Run 4      |        30 ms	 |          25 ms |
| Run 5      |        32 ms	 |          26 ms |
| Run 6      |        29 ms	 |          26 ms |
| Run 7      |        28 ms	 |          27 ms |
| Run 8      |        30 ms	 |          27 ms |
| Run 9      |        31 ms	 |          26 ms |
| Run 10     |        29 ms	 |          26 ms |
| **Median** |    **30 ms**	 |      **26 ms** |

Query 6 is the bread and butter of analytical engines — and ClickHouse doesn't disappoint.
A massive 10x improvement over PostgreSQL on the same dataset on the same physical machine.

And since we're here anyway and for my audience, who I know love it...

...Quack Quack...

## DuckDB Results

Timings are measured with `EXPLAIN ANALYSE` and `.timing on`

| Data       | Ship First | Quantity First |
|------------|-----------:|---------------:|
| Run        |      26 ms |          31 ms |        
| Run        |      24 ms |          25 ms |        
| Run        |      24 ms |          27 ms |        
| Run        |      27 ms |          26 ms |        
| Run        |      25 ms |          26 ms |        
| Run        |      25 ms |          26 ms |        
| Run        |      25 ms |          26 ms |        
| Run        |      26 ms |          26 ms |        
| Run        |      26 ms |          26 ms |        
| Run        |      25 ms |          27 ms |        
| **Median** |  **25 ms** |      **26 ms** |

The difference between the two columns is smaller than in ClickHouse. 
I removed the first datapoint from an unpaired t-test (since **31 ms** looks like an outlier). 
Even when data is corrected in this way, we are still 95% confident that **Ship First** is faster.

Interestingly, DuckDB appears to evaluate in "reverse order" the same way PostgreSQL does.

The ballpark runtime of DuckDB and ClickHouse are very similar here — which is encouraging in terms of how far
we have some in Execution Engine technology.


## SQL Server

I have not yet instrumented SQL Server multi runs the way I have them on the other databases.

But, from manually running the two queries and relying on `sys.dm_exec_request` reporting, I can see that:

| Data        | Ship First | Quantity First |
|-------------|-----------:|---------------:|
| **Average** |      53 ms |          60 ms |

Again, we see a clear difference in runtime (note: I can't get the median in SQL Server 
stats this way)

Take these numbers with a grain of salt — because I'm on SQL Server express, and it can only use 4 of my 14 cores. 
Assuming linear scale, SQL Server would be somewhere in the 15 ms range. 
Pretty respectable for an "old" engine that isn't cool any more.


# Summary

Query 6 represents an interesting case of optimising expression evaluation order. 
This type of optimisation is typical of computer code compilers.

Despite such optimisation being a well-explored subject in the literature, none of the databases I tested showed 
the ability to optimise the expression — despite there clearly being a significant benefit to doing so. 

You can read the rest of the TPC-H series here:

- [TPC-H Series](/analysis/)
