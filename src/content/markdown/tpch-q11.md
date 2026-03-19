## Statistics (Histograms and MCV)

To pick the optimal bushy join order in Query 11, the optimizer needs accurate statistics like histograms and Most
Common Values (MCV). These allow it to know that a filter on `n_name = 'JAPAN'` will result in a very small number of
matching rows in the `supplier` table.

## Bushy Join

Query 11 benefits from a bushy join tree: `partsupp` ⨝ (`supplier` ⨝ `nation`). Since the filtered result of
`supplier ⨝ nation` is tiny, the hash table built for this join is very small, making this more memory-efficient and
faster than a traditional left-deep tree.

## Canonical Forms vs. Init Plans

How a database handles non-correlated subqueries (like the one in the `HAVING` clause) affects the simplicity of its
execution engine. Some databases use "init plans" to execute the subquery first, while others canonicalize the subquery
into a simple cross-join to a single row.
