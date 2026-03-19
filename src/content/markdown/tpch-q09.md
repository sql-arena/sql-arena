## Composite Key Joins

Estimating join cardinality on multiple columns (like `l_partkey` and `l_suppkey`) is particularly challenging for query
optimizers. Without composite statistics (which are often not automatically collected), optimizers may get these
estimates wildly wrong, leading to sub-optimal plans.

## Aggregate before Join

A powerful optimization for Query 9 is to aggregate the data *before* joining to the `nation` table. By grouping by the
nation key early, the number of join operations to resolve the nation name can be reduced by several orders of
magnitude.

## Transitive Closure

Optimizers can use transitive closure of the keys to infer additional filters. For example, a filter on `part.p_name`
also implies a filter on `partsupp` and `lineitem`, allowing these tables to be reduced before joining.
