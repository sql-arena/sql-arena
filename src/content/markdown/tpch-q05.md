
## This filter on `o_orderdate`

This is a quick test for partitioning elimination.

We don't have to join via `supplier` to harvest the filter - we can go via `customer`
and filter that first.
`customer` is a much larger table than `supplier` (by 15x) so it is better to apply an aggressive filter on a larger
table instead of a smaller one.

Since `orders` is already filtered, we can also reduce it further by pre-joining to `customer`, `nation` and `region`
of to `orders` *before* we join to `lineitem`.
If we do this, we still have the filter on `c_nationkey = s_nationkey` later in the query.
Even though we took the filter early on `customer` we must still apply the filter to `supplier` later.

By combining the filters `r_name = 'ASIA'`  and `o_orderdate >= '1994-01-01' AND o_orderdate < '1995-01-01'`
in this way, we can greatly reduce the work needed in the query.

