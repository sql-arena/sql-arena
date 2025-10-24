

## The correlated Subquery 

The fascinating bit about this query is the nested subquery:  `SELECT MIN(ps_supplycost) FROM tpch.partsupp...`.

That subquery is again correlated with the outer query via this filter: `ps_partkey = p_partkey`.
But this time, the correlation is more complex: we must execute several joins to find the value that the outer
`ps_supplycost` is looking for.

Consider this expression:

```
ps_supplycost = (SELECT MIN(ps_supplycost)
                       FROM tpch.partsupp AS ps_min
                       INNER JOIN tpch.supplier AS s_min
                           ON ps_suppkey = s_suppkey
                       INNER JOIN tpch.nation AS n_min
                           ON s_nationkey = n_nationkey
                       INNER JOIN region AS r_min
                           ON n_regionkey = r_regionkey
                       WHERE ps_partkey = p_partkey
                         AND r_name = 'EUROPE')
```

The key here is decorrelate this query into a join to this decorrelated construct 

```sql
SELECT ps_partkey, 
       MIN(ps_supplycost) AS min_ps_supplycost
FROM tpch.partsupp AS ps_min
INNER JOIN tpch.supplier AS s_min
    ON ps_suppkey = s_suppkey
INNER JOIN tpch.nation AS n_min
    ON s_nationkey = n_nationkey
INNER JOIN region AS r_min
   ON n_regionkey = r_regionkey
WHERE ps_partkey = p_partkey
    AND r_name = 'EUROPE'
GROUP BY ps_partkey;
```

This allows us to harvest the filter on `r_name` and apply it transitively to the join in the outer query.
