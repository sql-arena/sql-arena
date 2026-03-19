## Optimal Join Order

The most important optimization for Query 8 is taking the highly selective filter on `part` (
`p_type = 'MEDIUM PLATED BRASS'`) as early as possible. This reduces the `lineitem` stream to less than 1% before
joining with larger tables like `orders`.

## Bushy Joins

Query 8 presents an opportunity for a bushy join. Instead of joining the main stream directly to `customer` and then
through `nation` and `region`, an optimizer can pre-join `nation` and `region` (applying the `r_name = 'EUROPE'` filter)
and then join the result. This reduces the total number of join operations.

## Join Algorithms

The choice of join algorithm (Hash, Merge, or Loop) affects both performance and memory usage. While Hash joins are
typically faster for analytical workloads, some optimizers like SQL Server may choose Merge joins to minimize memory
consumption when the runtime is comparable.
