
## The Correlated Subquery

Consider this expression:

```
l_quantity < (SELECT 0.2 * AVG(l_quantity)
                    FROM tpch.lineitem
                    WHERE l_partkey = p_partkey);
```

The crucial optimisation is for the optimiser to rewrite inoto this:

```sql
SELECT SUM(l_extendedprice) / 7.0 AS avg_yearly
FROM tpch.lineitem
INNER JOIN tpch.part
    ON l_partkey = p_partkey
INNER JOIN (SELECT l_partkey
                 , 0.2 * AVG(l_quantity) AS avg_quantity
            FROM tpch.lineitem
            GROUP BY l_partkey) AS decorrelated
    ON decorrelated.l_partkey = p_partkey
WHERE p_brand = 'Brand#13'
  AND p_container = 'MED CAN'
  AND l_quantity < decorrelated.avg_quantityh;
```

That allows much higher speed hash joins.

## Agggressive pushdown

It is possible to push down the highly selective filters on `p_brand` and `p_container` into the subquery, 
further reducing the amount of data processed.