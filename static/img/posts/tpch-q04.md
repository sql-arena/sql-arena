---
title: "TPC series - TPC-H Query 4 - Semi Join and Uniqueness"
date: "2025-09-29"
tags: 
  - "performance"
  - "query-planning"
  - "tpch"
  - "join"
---

Today we are looking at a Q04 — which on the surface is similar to [Q17](./tpch-q02-q17.md). 
Like Q17, Q04 has a correlated subquery that can be de-correlated using a join.

But sometimes, a regular `INNER JOIN` is not enough to de-correlate a query. 
You need special join types that don't appear as part of the standard SQL syntax.

It is time to learn about the `SEMI JOIN`.

# Query 4 

First, here what Q04 looks like:

```sql
SELECT o_orderpriority
       , COUNT(*) AS order_count
FROM tpch.orders
WHERE o_orderdate >= '1995-02-01'
  AND o_orderdate < '1995-05-01'
  AND EXISTS (SELECT *
              FROM tpch.lineitem
              WHERE l_orderkey = o_orderkey
                AND l_commitdate < l_receiptdate)
GROUP BY o_orderpriority
ORDER BY o_orderpriority;
```

## Cardinalities and Filter Selectivity
As we've learned previously - a good analysis of join order starts with cardinalities, 
filter selectivity and relationships between tables.

There are 4 `lineitem` for each value of `order`.

Our Filters:

| Filter                                                       | Selectivity | Cardinality |
|--------------------------------------------------------------|-------------|-------------|
| `o_orderdate >= '1995-02-01' AND o_orderdate < '1995-05-01'` | 4%          | 52K         |
| `l_commitdate < l_receiptdate`                               | 63%         | 3.8M        |

A note for later: Remember how the safe, left deep query plan we saw in [Q03 Analysis](./tpch-q03.md) applied the rule:

- "Always pick the largest table as the root of the tree."

We did this to minimise memory usage of the query and make hash tables more effective. 
Keep this in mind.

# `EXISTS` in Queries

Consider this correlated subquery:

```sql
EXISTS (SELECT *
        FROM tpch.lineitem
        WHERE l_orderkey = o_orderkey -- <<< This is the correlation
          AND l_commitdate < l_receiptdate)
```

At first glance, this looks similar to the correlated subquery in [Q17](./tpch-q02-q17.md). 
It appears we can de-correlate it the same way, by rewriting to a join.
But there is an interesting difference: In Query 17, we looked for a scalar values correlated with the outer query —
like this:

```sql
l_quantity < (SELECT 0.2 * AVG(l_quantity)    -- <<< This is a scalar value
              FROM tpch.lineitem AS li
              WHERE l_partkey = p_partkey);
```

A "scalar value" in database geek language is a single value of one specific type. 
In formal, relational language: A scalar value is a single, indivisible value drawn from a domain. 
You can ignore the previous sentence, nobody cares... 

Anyway, where was I? 
In Q17 - we know that the correlated subquery in Q17 will find one and only one value to match on`l_quantity`. 
The value may be **NULL** (if no rows match in `lineitem`) - but it *will* be there.

But in Q04 - we're looking for the *existence* of at least one tuple — not an exact match. 
This general construct:

```sql
EXISTS (SELECT * FROM [stuff])
```

Says: "Look into `stuff`" and if at least one row (=tuple in relational language) comes back, 
then `EXIST` is **true** - if not, it is **false**.

If we are using a hash table to find matches - this implies that we want to stop looking once we have found the first
match. It also implies that we don't really care *what* the match is

## Detour: `SELECT 1` or `SELECT *` in `EXISTS`

In the wild, you will see two different ways to write `EXISTS` queries. 

This one:
```sql
WHERE EXISTS (SELECT * FROM [stuff])
```

And this one:
```sql
WHERE EXISTS (SELECT 1 FROM [stuff])
```

From a performance perspective, it doesn't matter which one you use. 
Any optimiser that isn't completely brain-dead will optimise away the `*` and just check for existence.

However, I prefer `SELECT 1` because it explicitly says to the human reader: 
"I don't care about what comes back, just whether it is there". 
It is just clearer to me that way. 
If there is a join inside the `EXISTS` I also won't have to care about duplicate column names.

This is one of those cases where it comes down to personal preference. 
There isn't a strong enough argument for either.

# The Semi-Join

The Semi Join is a special kind of join that only returns the first value matched on the right side
of the join. 

Unlike a regular `INNER JOIN`, the `SEMI JOIN` operator is *not* commutative. 
In other words: `a SEMI JOIN b` is not the same as `b SEMI JOIN a`.

## Regular and orthodox `SEMI JOIN`

In traditional, relational algebra, there is only one type of `SEMI JOIN`.

In `a SEMI JOIN b`, we return only rows from `a` that have at least one match in `b`. 
Potentially picking the first matched `b` value.

In our usual, Python notation, here is a general, `a SEMI JOIN b`:

```python
# Build the hash of b to speed up lookups
hash_b = dict()
for b_row in b:
  hash_b.add(b_row.join_key) = b_row

# Look for matches and emit them
for a_row in a:
  if a_row.join_key in hash_b:
     output.append(Row(a_row, hash_b[a_row.join_key])
```

You will notice something interesting about this. 
The hash table we construct (`hash_b`) is non-deterministic.
Inserting the same `b_row.join_key` twice will overwrite the previous value.
What comes back from the semi-join depend on the *order* we added rows into `hash_b`.

For example, imagine we had the following rows in `b`:

| `join_key` | `v`   |
|------------|-------|
| 1          | 'abc' |
| 1          | 'xyx' |

If we happen to insert **'abc'** first, then the semi-join will emit **'xyz'** and vice versa.
In general, databases really hate being non-deterministic and they try to avoid it. 

In the case of `EXIST` queries, we don't care about **'abc'** or **'xyz'** - 
we just care if the value **1** is present or not — so we are safe in using a `SEMI JOIN` and it will be deterministic.


## Using `SEMI JOIN` to implement `EXISTS`
Now that we understand roughly how `SEMI JOIN` works - we can see how it can be used to de-correlate
the `EXISTS` in Q04.

This:
```sql
FROM tpch.orders
WHERE
EXISTS (SELECT *
        FROM tpch.lineitem
        WHERE l_orderkey = o_orderkey -- <<< This is the correlation
          AND l_commitdate < l_receiptdate)
```

Is the same as:

```sql
FROM tpch.orders
SEMI JOIN tpch.lineitem ON  l_orderkey = o_orderkey 
WHERE l_commitdate < l_receiptdate)
```

## The apocryphal, `SEMI OUTER` Join
It turns out that when you build a relational database, it is sometimes useful to think about Semi-join as
having an "outer" variant. 
This variant doesn't exist in relational algebra. 
Useful beats theory — so it exists in some databases.

The `a SEMI OUTER JOIN b` join is very similar to the `SEMI JOIN` join. 
The only difference is what we always output all rows in `a`. 
The algorithm looks like this:

```python
# Build the hash of b to speed up lookups
hash_b = dict()
for b_row in b:
  hash_b.add(b_row.join_key) = b_row

# Look for matches and emit them
for a_row in a:
  if a_row.join_key in hash_b:
     output.append(Row(a_row, hash_b[a_row.join_key])
  else:
     output.append(Row(a_row, None)
```

### Using `SEME OUTER JOIN` for correlated projections
Consider a common use case for `SEMI OUTER JOIN`: the correlated projection list. 

You've likely seen queries of this form, they look like this:

```sql
SELECT a.x
     , (SELECT y 
        FROM b 
        WHERE a.join_key = b.join_key 
        LIMIT 1) AS correlated_y
FROM a
```

Here, the database can translate this to:

```sql
SELECT a.x, b.y
FROM a 
LEFT SEMI JOIN b 
  ON a.join_key = b.join_key
```

But if there is more than one match in `b` for the rows in `a`, which one will be picked? 
It is non-deterministic - and this is why you should always put an `ORDER BY` in such correlated subqueries.

# Actual Query Plans.

Now that we understand roughly how `SEMI JOIN` works - we can have a look at what PostgreSQL does for Q04:

```
Estimate    Actual  Operator
       5         5  GROUP BY SORT (orders.o_orderpriority...) AGGREGATE (count(*)...)
      20        20  GROUP BY SORT (orders.o_orderpriority...) AGGREGATE (PARTIAL count(*)...)
   10028     48056  SORT orders.o_orderpriority...
   10028     48056  LEFT SEMI JOIN HASH ON orders.o_orderkey = lineitem.l_orderkey...
 2000032   3792688  │└SCAN lineitem WHERE (lineitem.l_commitdate < lineitem.l_receiptdate)...
   66644     52372  SCAN orders WHERE ((o_orderdate >= '1995-02-01') AND (o_orderdate < '1995-05-01'))
```

My tool generating these plans from the unreadable mess that is PostgreSQL `EXPLAIN` adds the `LEFT` to 
the `SEMI JOIN`. 
Ignore for now, more about it later.

What can we learn from the PostgreSQL plan?

1) A `SEMI JOIN` is used to de-correlate the `EXIST` query. 
2) PostgreSQL creates a hash table over `lineitem` containing 3.8M rows 
3) `GROUP BY` is done with sorting

Ad 1) This is as we would expect based on what we've learned about semi-joins so far. 
All we care about is whether a row exists in `lineitem`
(with the filter of `l_commitdate` and `l_receiptdate` that matches the `o_orderkey` we are
looking at

Ad 2) The hash table is constructed over `lineitem`. It follows the Python implementation I sketched out.
But if I've taught you anything useful already - you should be feeling a bit off about this. 
Constructing a hash table over 3.M rows to join with 52K rows seems ... wasteful?

Ad 3) Once again we observe the mainframe era algorithms run by PostgreSQL, 
preferring sorting to hashing to implement `GROUP BY`. 
Hopefully something we will see fixed in a later version (though it hasn't been fixed in version 17, so I would not
keep my hopes up).

## Detour: Three is a magic number

Notice the estimate PostgreSQL used for the scan of `lineitem`. 
Its 2M, exactly 1/3 of the full size of the table (6M).

The filter on the scan is: `lineitem.l_commitdate < lineitem.l_receiptdate`. 
We're asking about a very specific correlation between two columns — one that can't be determined with statistics.

When such cases occur - the database optimiser realises it can't make a good guess. 
It gives up and just says: "It is probably 1/3". 
The magic value appears in many different databases and is generally the fallback value for "I don't know".

# Left-handed and Right-handed `SEMI JOIN`
Recall how `SEMI JOIN` uses a hash table to eliminate duplicates on the build since before checking existence. 
This clever trick allows the database to execute almost the same code as a regular join when doing `SEMI JOIN`.

But it comes with a drawback: When the build side of the join is much larger than the probe side — 
we end up building a large hash table in memory.
This is far from optimal and at large data sizes it is unscalable.

Notice that regular `INNER JOIN` with hash tables don't have this problem. 
`INNER JOIN` is commutative — we can simply flip the build and probe side around to optimise memory.
But in the case of `SEMI JOIN`, because we have to pick only one match from ope side, this standard 
"flip join" trick can't be used.

How do we flip a `SEMI JOIN` around? 
Can we do better than always hash building the right side?

Let us have a quick look at what the same query plan in Yellowbrick looks like:

```
Estimate    Actual  Operator
       5         5  SORT
       5         5  GROUP BY HASH () AGGREGATE ()
   16667     48056  RIGHT SEMI JOIN HASH ON (o_orderkey = l_orderkey)...
   50000     52371  │└SCAN orders WHERE ((o_orderdate >= $1) AND (o_orderdate < $2))...
 2000034   3792687  SCAN lineitem WHERE (l_commitdate < l_receiptdate)...
```

Isn't that interesting? 
Notice that Yellowbrick does a `RIGHT SEMI JOIN` - allowing it to construct the hash table over `orders` instead
of `lineitem` - greatly reducing the amount of memory in use.
How does it do that?

We've already ventured into an area where the terminology is no longer consistent in the literature. 
Let me introduce two different concepts: right and left-handed joins.

- **Left-Handed Join::=** The probe looks into the build in a stateless, readonly hash table.
- **Right-Handed Join::=**: The probe looks at the build, and uses the hash table to track matched rows.

All joins can be expressed either as left- or right-handed joins. 
In the case of `INNER JOIN` - there is only ever a use case for left-handed joins.
But in the case of `SEMI`, `FULL` and `OUTER` joins - both left- and right-handed variants are useful.
 
## The Right-handed `SEMI INNER JOIN`

Recall the `SEMI JOIN` algorithm described earlier - this is the **left-handed semi-inner join**:

```python
# Build the hash of b to speed up lookups, eliminating any duplicates in the process
hash_b = dict()
for b_row in b:
  hash_b.add(b_row.join_key) = b_row

# Look for matches and emit them
for a_row in a:
  if a_row.join_key in hash_b:
     output.append(Row(a_row, hash_b[a_row.join_key])
```

The above works well when `b` is smaller than `a`. 
But when the opposite is true, a good execution engine can switch to the right-handed semi-join. 

The **right-handed semi-join** algorithm looks like this:

```python
# Build the hash of a to speed up lookups. Duplicates are now allowed in the hash

hash_a: Dict[str, tuple(bool, list[Row]] = dict()
for a_row in a:
   entry = hash_a.setdefault(a_row.join_key) = []
   entry.append((a_row, False)    # False = We ahve not yet matched this row

# Loop the rows in b (the larger side) keeping track of what we have matched
for b_row in b:
  if b_row.join_key in hash_a:
    hash_chain = hash_a[b_row.join_key]    
    if hash_chain[0]:
        # We already matched and emitted this value
        continue

    # Make sure the next match is not emitted (duplicate elimination)
    hash_chain[0] = True:  
    for a_row in hash_chain[1]
        # Walking the matches, emit each one
        output.append(Row(a_row, b_row))

```

There is a non-trivial cost to pay for randomly walking the hash table this way. 
We're also talking an extra branch.
But for the case where the hash table on the right side of the `SEMI JOIN` is large — this algorithm allows
us to flip the join around.

In the case of Q04 - the scan of `orders` is significantly smaller than the scan of `lineitem` (by >100x).
The right-handed semi-join makes a lot of sense when optimising this query. 
Yellowbrick picks the join flip algorithm ends up running Q04 in 100x less memory than PostgreSQL.

# Summary
Today we analysed Q04, which uses de-correlation similar to what we saw in Q02 and Q17.

We also learned about `SEMI JOIN` and how this special, non-commutative,
"finds the first match" join method can be used to greatly speed up `EXIST` queries. 
As part of that lesson, we saw how semi-joins can lead to non-deterministic results if they aren't used 
carefully.
We also introduce the notion of "right and left-handed joins" where flipping a join around requires you to
also change the join algorithm. 

Until we meet again for Q05 - have fun with your new knowledge!

The full series is here:
- [TPC-H Series](/analysis/)

