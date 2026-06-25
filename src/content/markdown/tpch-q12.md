## Selectivity of Filters

| Filter                                                           | Selectivity | Cardinality |
| ---------------------------------------------------------------- | ----------: | ----------: |
| `l_receiptdate >= '1994-01-01' AND l_receiptdate < '1995-01-01'` |         15% |        909K |
| `l_shipmode IN ('AIR', 'TRUCK')`                                 |         28% |        1.7M |
| `l_commitdate < l_receiptdate`                                   |         63% |        3.8M |
| `l_shipdate < l_commitdate`                                      |         49% |        2.9M |

The actual selectivity of all the filters taken together is about 0.5%, leaving roughly 31K rows.

## Optimal Join Order

If the optimizer can estimate the filters on `lineitem` correctly, the best join order is `orders` ⨝ `lineitem`.

Databricks, SQL Server, and PostgreSQL get this right. DuckDB also ends up with the right join order, but largely by
luck: its estimates are off by roughly 440x.

## Estimating Disjunctions

The filter `l_shipmode IN ('AIR', 'TRUCK')` can be treated as:

- `l_shipmode = 'AIR' OR l_shipmode = 'TRUCK'`

If the engine can estimate equality predicates, it can often estimate this by adding the selectivity of the two
individual values together.

Strictly speaking, this does not require histograms. If the engine knows the number of distinct values in
`l_shipmode`, it can approximate:

- Estimate(`l_shipmode = 'AIR'`) = |`lineitem`| / ndistinct(`l_shipmode`)

That breaks down when data is skewed, which is where histograms or Most Common Values become important.

## Histograms and Range Estimation

Like Query 14, Query 12 contains a range predicate that is straightforward to estimate with a histogram:

- `l_receiptdate >= '1994-01-01' AND l_receiptdate < '1995-01-01'`

Without histograms, an optimizer cannot estimate that range accurately.

## Correlation Between Columns

The hard part of Query 12 is not the date range, but the comparisons between columns:

- `l_commitdate < l_receiptdate`
- `l_shipdate < l_commitdate`

Simple histograms do not help much here. In principle, an engine could keep statistics on computed expressions such as
`l_receiptdate - l_commitdate`, then estimate the fraction of rows where the result is greater than zero. As far as the
SQL Arena engines go, none of them appears to do that.

As a result, even strong optimizers often fall back to a wild guess for predicates like these.

## Correlation Between Filters

Even with a good estimate for each individual filter, the engine still has to estimate the *combined* selectivity.

One common approach is to assume independence and simply multiply the selectivities. That gives about 1.3%, which is
close to what PostgreSQL and Databricks estimate.

Another approach is to dampen later filters using a square-root progression, effectively assuming rough correlation
between predicates. That lands closer to SQL Server's estimate.

More advanced options exist, such as correlated statistics or sampling before execution, but they are more expensive
and harder to apply robustly.
