## `EXIST` decorrelation into `SEMI JOIN`

This expression shoudl be decorrelated:

```sql
EXISTS (SELECT *
          FROM tpch.lineitem
         WHERE l_orderkey = o_orderkey
           AND l_commitdate < l_receiptdate)
```

Optimizers will generally convert this into a `SEMI JOIN`.

Flipping the inner and outer side of the join (for optimisers that know how to do this) will greatly reduce
the amount of memory consumed and it opens up additional opportunities for bloom filtering.
