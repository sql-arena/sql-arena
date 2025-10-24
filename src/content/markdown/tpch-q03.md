
## Optimal Join Order

Optimisers only seeking left deep trees will consume signficant memory while executing the query.

The key optimisation in join ordering is to create a bushy join on `customer` and `orders` before joining
to `lineitem`. This allows both `l_shipdate > '1995-03-15'` and `o_orderdate < '1995-03-15'` to be 
be pre-filtered before the join to `lineitem` greatly reducing the amount of data to be processed.

Optimisers who understand bloom filters will be able to harvest further filters by combining the `customer`
and `orders` filters before accessing `lineitem`.

## Heap Sort

The `LIMIT 10` in the query is best optimised with heap sort nodes. This is typically done with a special
sort operator that can cut the stream early. Good optimisers and execution engines find this optimisation
and reduce the amount of data to be sorted before emitting the top 10.

In the `dbprove` tool, this shows up a the sort not only emitting a few rows.

