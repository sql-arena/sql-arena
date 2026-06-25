## Filter Selectivity

| Filter                                                     | Selectivity | Cardinality |
| ---------------------------------------------------------- | ----------: | ----------: |
| `l_shipdate >= '1996-02-01' AND l_shipdate < '1996-03-01'` |          1% |       71636 |

The `part` table has 200K rows.

## Optimal Join Order

After filtering, `lineitem` is smaller than `part`, so the best join order is `part` ⨝ `lineitem`: build the hash
table on filtered `lineitem` and probe it from `part`.

To choose that plan, the optimizer has to estimate the range
`l_shipdate >= '1996-02-01' AND l_shipdate < '1996-03-01'` correctly.

SQL Server and Databricks get this right. DataFusion, Trino, ClickHouse, and DuckDB mis-estimate the filtered
cardinality and reverse the join order. DuckDB, for example, estimates about 1.2M rows from `lineitem`, around 15x
higher than reality.

PostgreSQL estimates the row count well, but still chooses to build on `part`. That is surprising because `part` is
both larger and wider than the filtered `lineitem` rows needed for the join.

## Histograms

The key feature behind a good estimate here is a histogram on `l_shipdate`.

Histograms let the optimizer reason about range predicates by splitting the domain into buckets and approximating how
much of each bucket overlaps the requested range. PostgreSQL also combines histogram data with Most Common Values and
null fractions when producing its estimate.

Without a histogram-like structure, an engine cannot estimate this predicate accurately.

## Range Estimation Limits

DuckDB uses distinct-counting sketches such as HyperLogLog, which are useful for cardinality estimation but do not
help with range predicates. Knowing the number of distinct values in a column is not enough to infer how those values
are distributed across a date interval.

The broader lesson from Query 14 is simple: to estimate range predicates correctly, an optimizer needs some form of
histogram statistics.
