## Selectivity of Filters

| Filter                                                     | Selectivity | Cardinality |
|------------------------------------------------------------|------------:|------------:|
| `l_shipdate >= '1994-01-01' AND l_shipdate < '1995-01-01'` |         14% |      856332 |
| `l_discount BETWEEN 0.03 AND 0.05`                         |         30% |     1799915 |
| `l_quantity < 24`                                          |         46% |     2817735 |

We notice that `l_quantity` is significantly more selective than the two other filters.

Due to the way TPC-H is generated, these filters are independent.
That means that as you use all filters, you will reduce the rowcount coming out of `lineitem` to: 14% * 30% * 46% ~ 2%.

## Predicate Evaluation order

We aren't allowed indexes on any of these columns in TPC-H.
We're however allowed to partition data in `l_shipdate` if we so desire.
In our test, there is no ordering in the insertion of record.
All data is completely randomized.

We should evaluate the best filters first - taking `l_quantity < 24` before anything else.

Short-circuit evaluation speeds up the query if we bail out of evaluating the other filters early.

Given decent statistics - particularly a histogram - a query optimiser should be able to determine that this ordering
is the best one.

### Short-Circuit Evaluation vs. Branch Elimination

When you use SIMD vectorisation for execution, you have to ask an important question:  
Is it worth short-circuiting filter evaluation or is it better to just evaluate all filters and combine them?

A CPU will try to "guess" what the next instruction to run is — and it will get this instruction from memory
(this is called "prefetching").
If the CPU guesses right, the next instruction can immediately be executed.
But if the CPU makes the wrong guess - then it will need to wait for that instruction to be ready to execute.
A wait like this can take a very long time (in CPU terms) - hundreds of CPU cycles.
It might have been better to make the guessing simpler - and then pay the CPU cost of doing too many integers compares.

Depending on the execution engine, SIMD evaluation may be faster than bailing out early

## Narrow Scans and Column Stores

Here is the DDL for `lineitem`, with rough comments on how large each column is on disk

```sql
CREATE TABLE tpch.lineitem
(
    l_orderkey      INT,            -- 4B
    l_partkey       INT,            -- 4B
    l_suppkey       INT,            -- 4B
    l_linenumber    INT,            -- 4B
    l_quantity      DECIMAL(15, 2), -- 8B (more of Postgres) 
    l_extendedprice DECIMAL(15, 2), -- 8B
    l_discount      DECIMAL(15, 2), -- 8B
    l_tax           DECIMAL(15, 2), -- 8B
    l_returnflag    VARCHAR(1),     -- 3B
    l_linestatus    VARCHAR(1),     -- 3B
    l_shipdate      DATE,           -- 3-4B
    l_commitdate    DATE,           -- 3-4B
    l_receiptdate   DATE,           -- 3-4B
    l_shipinstruct  VARCHAR(25),    -- 27B
    l_shipmode      VARCHAR(10),    -- 12B
    l_comment       VARCHAR(44)     -- 46B
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
