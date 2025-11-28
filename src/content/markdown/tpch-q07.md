## Turning OR/AND Expressions into filters

This expression is crucial to understanding how to optimise Q07:

```sql
  (n1.n_name = 'GERMANY' AND n2.n_name = 'FRANCE')
  OR 
  (n1.n_name = 'FRANCE' AND n2.n_name = 'GERMANY')
```

We can see that irrespective of which part of the `OR` we look at, it **must** be the case that
we only want `customer` (via `n2`) that are in **GERMANY** or **FRANCE**.
Similarly, we can know that we can only want `supplier` (via `n1` in either) **GERMANY** or **FRANCE**.

We must either defer the combined check for the `OR` until later in the query
when we recombine rows from `supplier` and `customer` or we can understand that both instances of `nation` can be
prejoined into a 2-row results setse

In other words, we can say the following:

- Only pick `supplier` in **FRANCE** and **GERMANY**
- Only pick `customer` in **FRANCE** and **GERMANY**

### Pre-joining the two `nation` tables

We can realise that this join has an upper boundary on the number of rows it can produce (=2).

```sql
SELECT n1.n_nationkey, n1.n_name, n2.n_nationkey, n2.n_name
FROM tpch.nation AS n1
         CROSS JOIN tpch.nation AS n2
WHERE (
          (n1.n_name = 'GERMANY' AND n2.n_name = 'FRANCE')
              OR (n1.n_name = 'FRANCE' AND n2.n_name = 'GERMANY')
          );
```

This allows us to join `n1` with `n2` first, producing a tiny 2-row result set than can then be used to filter
both `supplier` and `customer`.

## Selectivity

| Filter                                             | Selectivity | Cardinality |
|----------------------------------------------------|------------:|------------:|
| `n1.n_name IN ('GERMANY', 'FRANCE)` (customer)     |          8% |           2 |
| `n2.n_name IN ('GERMANY', 'FRANCE)` (supplier)     |          8% |           2 |
| `l_shipdate BETWEEN '1995-01-01' AND '1996-12-31'` |         28% |        1.7M | 

## Join Order

We know that `lineitem` is the largest table, even after we apply the filter on `l_shipdate`.
That means `lineitem` should be used to probe into hash tables (or loop look into B-trees)
from the other tables in the query.

### Inferring Filter Selectivity on `orders`

Our filters on `nation` results in reductions in `customer` -
which in turn will result in the same reduction of `orders`.
How can we know this?

- There is a primary key from `customer` to `nation`
- We know that `n_nationkey` is a key - so it must have the same cardinality as `nation` (25 different rows, we pick 2)
- Since there is a foreign key from `customer` to `nation` via `c_nationkey` we know that `c_nationkey` in `customer`
  is a subset of all `n_nationkey`.
- If we have distinct values stats (sorry Iceberg people),
  then we can know there are 25 distinct values in `c_nationkey`.
  The same number of distinct values as we have in `n_nation`
- If we also have histograms (again, sorry Iceberg), we can know that the distribution of `c_nationkey`
  is roughly uniform.
- That means that picking two nations in `n1` will result in a 2/25 reduction to `customer` via `c_customerkey`
  because all data is uniform.
- We can use the same reasoning to infer that these two nations (via their transitive closure of primary/foreign keys)
  must result in the same reduction into `orders`
- Hence, it must be the case that the 8% filter on `n1` (=`nation`) is *also* an 8% filter on `orders`

By using primary and foreign keys as well as statistics, the
query optimiser should be able to infer what effects filters on one table have on other tables in the same query.

With this inference, we now know that `orders`, after we apply the filter via `nation` (alias `n1`) becomes an even
smaller stream.

### Inferring the Filter Selectivity on `lineitem`

Using exactly the same line of reasoning as for `orders` we can infer what happens with the filter from `nation`
(alias `n2`) via `supplier` to `lineitem`

By joining via `nation` --> `supplier` --> `lineitem` we have reduced the stream by 8%.
But we've already reduced the stream by `28%` via the filter on `l_shipdate`.

The optimiser must now make a challenging decision.
What is the combined selectivity of the two filters?
There are a few ways the optimiser can make an educated guess:

1) The selectivity of filters is the product of the filter (i.e. the answer is 2% = 28% * 8%)
2) The selectivity of the filters is the largest (i.e. the answer is 8%)
3) The selectivity is some progression of filters with each new filter becomes less valuable than the previous one
4) The selectivity of the combined filter can perhaps be known through composite statistic
5) I will eventually learn this selectivity by running some queries and adapting to the conditions

Of these methods, the most common are the first 3.
But some databases allow composite stats (option 4) to get a good answer for filters that typically occur together.
PostgreSQL has supported these kinds of composite statistics since version 14,
SQL Server has had them since around the year 1997.
Many cloud databases don't have this feature yet.

Fortunately for most query engines - TPC-H uses very friendly filters they behave nicely when you
combine them.
All filters are completely uncorrelated, so method 1 is good enough to deliver a decent estimate.

The actual selectivity of `lineitem` once all filters have been applied is 2%.
Since `lineitem` is related to `orders` via a primary/foreign key - the optimiser knows that reducing `lineitem` to
2% of the rows will result in the same reduction to `orders`.
It can know this using similar reasoning that we've seen before.

Since a reduction to 2% is better than the 8% reduction we get via `nation` --> `customer` --> `orders` it is *better*
to join `lineitems` with `orders` *before* joining to `customer`.

### Best Query Plan

We now know what the best join order is for Q07 if we want to minimise the amount of join operations (which we do).

- Scan or seek `lineitem` taking the filter on `l_shipdate`
- Reduce `lineitem` by joining to `supplier` and then `nation` taking the filter on `n_name`
  (for a total reduction to 2%)
- Using this stream, join to `orders`, reducing orders to the same 2%
- Finally, join to `customer` and then `nation` to take the last 8% reduction. Optionally using a pre-join of `n1` and
  `n2`
