## Histograms and Estimation

Correct estimation of the filter on `o_orderdate` is crucial for picking the optimal join order. Without histograms in
the statistics, optimizers may mis-estimate the selectivity, which can lead to picking a "bad bushy" join that actually
increases the total number of operations and memory usage.

## Functional Dependency

By identifying functional dependencies between columns, an optimizer can realize that grouping by `c_custkey` is
sufficient to satisfy the `GROUP BY` clause. This allows for aggregating the data earlier in the plan, before joining
with the `customer` and `nation` tables.

## Bloom Filters

Query 10 is an ideal candidate for Bloom filters. By building a Bloom filter on the filtered `orders` table, the engine
can significantly reduce the number of rows scanned from the large `lineitem` table (often by 6x or more), effectively
transferring the filter from one table to another during the scan.
