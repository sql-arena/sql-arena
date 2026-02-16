---
Title: "Databases are Just Loops - Row and Batch execution"
Date: "2024-05-30"
Author: The Doctor
tags: 
  - "ee"
  - "performance"
  - "query-planning"
  - "database"
---

Our database journey makes a brief stop. We need to appreciate an important design decision every database must make: Should I use row or batch execution?

Depending on the database vendor - you may get one or the other - or even both. What are the trade-offs? Let's take a look.

I recommend reading my previous posts before exploring this one, if you have not done so already:

- [Part 1: Joins](databases-are-just-loops-joins.md)
- [Part 2: Aggregates](databases-are-just-loops-group-by.md)

# A sample Query

In preparation for exploring the design space, we must now consider a slightly more complicated query than those we've seen so far:

```postgresql
SELECT a.x, SUM(b.y)
FROM a
INNER JOIN b ON a.x = b.y
GROUP BY a.x
```

This query does two operations:

- Join `a.x = b.y`
- Aggregate function `SUM` on `b.y` using grouping column `a.x`

There are a few more operations in play here that you may not think about as operations yet:

- Finding rows in `a` for the join
- Finding rows in `b` for the join
- Sending rows to the client

Depending on the access method (=algorithm) chosen for the join, what exactly happens in that "finding" of rows depends on the database. For our example, I will assume a hash join is used.

As you can see at this point, writing out what a query does and _how_ it does it, gets tedious and wordy. We are only looking at a simple query so far - and using plain English to explain what it does is getting complicated.

Because database people live with databases every day, the good database vendors have come up with another way to render what happens in queries. With a bit of training, you can easily learn how to read this.

## Query Plans - Explain it to me!

Most database will, before you even run the query, allow you to ask the database: "What would you actually do if I asked you to run this query?". Asking this question to the database is called "explaining" the query.

It typically looks like this:

```postgresql
EXPLAIN -- Don't run the query, just tell me what you would do
SELECT a.x, SUM(b.y)
FROM a
INNER JOIN b ON a.x = b.y
GROUP BY a.x
```

What exactly the database returns when you use `EXPLAIN` depends on the vendor. Most databases allow you to emit various formats - XML and JSON for example.

EXPLAIN for the SQL Server crowd

For historical reasons, SQL Server does not use the `EXPLAIN` keyword. Instead, it uses the rather clumsy:

```postgresql
SET SHOWPLAN_ALL ON;
<query>
```

This is one of the those historical artefacts which tend to hang around when a vendor is too busy chasing the latest, shiny thing, instead of fixing what they have.

Details on SQL Servers way of doing things is here: [`SET SHOWPLAN\_ALL` (Transact-SQL) - SQL Server | Microsoft Learn](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-showplan-all-transact-sql?view=sql-server-ver16)  

### Explain Notation

Yellowbrick, for which I wrote the `EXPLAIN` code for years ago, allows you to emit a very compact representation of a query plan. I will use a generalised form of that notation in this blog. Because I think it's cool and very readable.

The above query will output something like this:

```
SELECT
  (a.x, SUM(b.y))
GROUP BY HASH (a.x)
  (a.x, SUM(b.y))
INNER HASH JOIN ON (a.x = b.y)
|   (a.x, b.y)
|-SCAN b
|   (b.y)
|-BUILD
  SCAN a
    (a.x)
```

This is a _much_ more compact way to represent what the query is doing. Let me play the above back to you in plain 
English, starting from the top of the tree:

- `SELECT` data sending it back to the client - the data to be selected is `a.x` and the `SUM(b.y)`
- Feed the `SELECT` with an aggregate (`GROUP BY`) using a hash access method.
- Feed that `GROUP BY` with an `INNER JOIN` using a hash access method and joining on `a.x = b.y`
- Feed the `JOIN` from two sides (that ASCII art tree above):
    - The first child is a `SCAN` of `b` (`SCAN` will read all rows). This side is typically called the "probe" of the join
    - The second child is first a `BUILD` - which creates a hash table (that the join needs). This side is called the "build" side of the join.
    - Under that child, we have another `SCAN`, this time of table `a`

At this point, the astute reader might ask: Doctor, why didn't you read out that plan from bottom to top instead? 
And I would reply: Great question - both ways of reading that query plan is valid! Interestingly, executing from bottom 
to top - pushing the rows upwards in the plan from the leaf is one way to write a database engine. Another is to pull the rows from the top until you get to the leaf. The call stack you can see from the database engine will show you which method has been used.

Enough of this detour - back to the main road.

## Translating it all to Python

Recall the query from the start of our journey today:

```postgresql
SELECT a.x, SUM(b.y)
FROM a
INNER JOIN b ON a.x = b.y
GROUP BY a.x
```

If we conveniently skip over what the `SCAN` in this query does, we can express it as these python loops:

```python
# BUILD (from SCAN a)
hash_a: dict[tuple, Row]
for a_row in a:
   build_hash[a_row.x] = Row(y=a_row.x)

# INNER JOIN (probe side: SCAN b)
join_output: list[Row] = []
for b_row in b:
  y = b_row.y
  if y not in hash_a:
    continue
  x = hash_a[y].x
  join_output.append(Row(x=x, y=y))

# GROUP BY 
group_by_output: dict[tuple, Row] = {}
for input in join_output:
  x = join_output.x
  y = join_output.y
  if x not in group_by_output:
     group_by_output[x] = Row(x=x, agg_y=0)
  group_by_output[x].agg_y += y

# SELECT
for input in group_by_output.values():
   send_to_client(input)
```

I am afraid the smooth ride is now over and the roads are becoming harder to drive.

What have we done above? We have created four loops, each outputting the result of their execution into a data structure that is consumed by the next loop.

What would happen if `b` was really large - billions of rows? Think about it for a moment...

Well, we would run out of memory wouldn't we? There would be no way to store `join_output` in memory and `GROUP BY` would never happen.

Before we outright reject this way of executing queries and move on to optimisation - I want to pause and consider the strange wisdom of the strategy above - when modified very slightly.

What if those lists were stored on disk instead of memory? Our query would now have an interesting property: We would be able to execute the `INNER JOIN`, write the rows to disk, remember that we did so and then _pause_ the query and evict it from memory. We could then pick up execution at any point later, starting from where we left off.

This "pausing" of queries is of value to systems that expect mixed user activity. Some users are particularly ... unskilled... in the way of writing queries. When such a user executes a query that takes a very long time to run - we may want to pause their execution for some time. This will prevent that user from monopolising compute resources - which will let people who write faster queries get their work done. Eventually, that user will get his query result. We can provide that result at our leisure - at the cost of some disk writes.

Some databases refer to this writing of intermediate results as "spooling" - but that term is greatly overloaded in databases - so I prefer to avoid it.

What is that BUILD operator loop?

```
INNER HASH JOIN ON (a.x = b.y)
| (a.x, b.y)
|-SCAN a
|   (a.x)
|-BUILD
  SCAN b
    (b.y)
```

What is that `BUILD` node for? It is used to construct a hash table, so we don't have to do stupid O(n2) execution in a loop like this:

```python
# INNER JOIN
join_output: list[Row] = []
for b_row in b:
  for a_row in a:
    if a_row.x == b_row.y:
      join_output.append(Row(x=a_row,x, y=b_row.y)
```

(Strictly speaking, the time complexity here is: O(|a|\*|b|))

And instead execute two loops like this:

```python
# INNER JOIN
join_output: list[Row] = []
for b_row in b:
  y = b_row.y
  if y not in hash_a:   
    continue
  x = hash_b[y]
  join_output.append(Row(x=x, y=y))
```

This is O(|a|+|b|) instead of O(|a|\*|b|) which is a lot better

Recall that our EXPLAIN of the query has this subtree:

# Row based Execution

One way to avoid the problem of huge, intermediate results is to realise that some of these loops can be thought of as streams - and streams can be combined.

I could express this with `yield` operators in Python, but I would like to keep it as "just loops" for now, please trust me a bit. We could rewrite our Python program to be this (removing the `BUILD` and `SELECT` to focus our attention):

```python
group_by_output: dict[tuple, Row] = []
for b_row in b:
  # INNER JOIN
  y = b_row.y  
  if y not in hash_a
    continue
  x = hash_a[y].x

  # GROUP BY
  if x not in group_by_output:
    group_by_output[x] = Row(x=x, sum_y=0)
  group_by_output[x].sum_y += y
```

This gets rid of the large, intermediate list of `join_output`. Such a rewrite will consume significantly less memory than our naive implementation.

Note that we could _not_ get rid of the `group_by_output`. Why? Because we don't actually know what the right result is until we have observed all rows from the sub tree (the join). Operators in a query plan that have this property are sometimes called : "non streaming operators", or "blocking operators".

What we have seen above is an example of a row based execution model. This model is widely used by old school databases - because it minimises the amount of memory needed to run a query. This in turn allows for higher concurrency and it makes running on smaller hardware more viable. When I say "smaller hardware", I mean the kind of HW we put in mobile phones today, which we used to call "server hardware" in the old days.

Row based execution is also torture for a modern CPU!

<aside>
Why use Merge operators?

Merge operators (merge join, merge aggregate) have gone out of fashion in the database industry. For good reasons. Typically, doing a hash access method is superior because hash tables don't have the branch prediction issues that occur when sorting data in a way suitable for merge.

However, rare cases do exist where merge is better than hash. Once data has been sorted, all operators that are ancestors to the sorted stream and capable of using the sorted property can now become streaming operators. This allows us to move data to the client faster, which can allow the query to finish faster than if we had used hash.

Typically, for the merge to make sense one of these must be true:

- The data can be emitted from the SCAN without needing to sort it first (ex: indexes)
- If a sort is required, several ancestors of the sort operation can benefit from the sorted stream
</aside>

## What's wrong with Row Based Execution?

Consider again this row based execution loop, with the import bit highlighted in bold

```python
group_by_output: dict[tuple, Row] = []
for b_row in b:
  # INNER JOIN
  y = b_row.y
  if y not in hash_a
    continue
  x = hash_a[y].x
  
  # GROUP BY
  if x not in group_by_output:
     group_by_output[x] = Row(x=x, sum_y=0)
  group_by_output[x].sum_y += y
```

Can you see it? We are accessing two dictionaries here.

What is a dictionary in Python? It's a hash table. Databases love hash tables. When are hash tables fastest?

...when they fit in CPU caches!

We have two hash tables in play in this loop at the same time - as we bring in values from one hash table (`group_by_output`) into L2/L3 - we are potentially evicting entries from the the other one (`hash_`a). This will increase the likelihood that we will miss the CPU cache. Which, depending on the CPU architecture, gives you an immediate, 100x performance slap in the face. Even Python programmers can feel that.

Another problem exists in loops like this: branch misprediction. As we start adding more operators to the same loop - we increase the likelihood that the CPU will mispredict branches. Branch mispredictions will take an operation that would normally spend 1 CPU cycle (or even less) and turn it into a pipeline flush - immediately burning 100-200 CPU cycles we could have used to compute.

Because of these issues, a lot of modern database uses batch execution - trading off some memory for increased CPU efficiency.

Other factors that make large loops bad for the CPU

I am going to leave a few notes here for myself to blog about later if I find the time. Other factors can make row based execution slow.

- **Function calls:** Typically, a database will need to do function calls to implement the content of each loop. There is a cost to function calls in tight loops
- **Instruction caches:** Very large loops can fill up the CPU instruction cache if the cache cannot stream and decode instructions fast enough
- **Register usage:** As loops grow large, the registers that need to be in play increase - sometimes non linearly with the number of operations in generated loops. The complexity both for the compiler to optimise registry placement and for the CPU to allow parallel access to the various ALU is significant.

Another reason declaring PK/FK is a good idea

Because database are just loops, we want those loops to be very fast. Making code fast means removing things that don't need to happen.

Have another look at the loop above, particularly this bit:

```python
for b_row in b:
    if a_row.x not in hash_b:
      # no match, move on
      continue
```

If there was a PK/FK relation between `a.x` and `b.y` we would _know_ that this check will always succeed (because there is no such thing as a non match). Most databases are smart enough to realise this - and they can completely remove that check from the loop they run.

(There is an even smarter optimisation that completely removes the join for this case, see [Join Elimination in Query Planners](https://database-doctor.com/?p=16).

Exercise for the curious reader: Can you guess which one of `a.x` and `b.y` is the primary key and which is the foreign key?

# Batch Execution

To understand batch execution, let us bring the Python code back to "running out of memory" form

```python
# INNER JOIN
join_output: list[Row] = []
for b_row in b:
  y = b_row.y
  if y not in hash_a:
    # no match, move on
    continue
  x = hash_a[y].x
  join_output.append(Row(x=x, y=y))

# GROUP BY
group_by_output: dict[tuple, Row] = {}
for input in join_output:
  x = join_output.x
  y = join_output.y 
  if x not in group_by_output:
    group_by_output[x] = Row(x=x, sum_y = 0)
  group_by_output[x].sum_y += y
```

What if `GROUP BY` only only consumed a "batch" of rows from the join at a time?

For example, we could do this

```python
join_output_buffer: list[Row] = [None] * BUFFER_SIZE
b_row_iter = iter(a)

def fill_join_buffer(buffer: list[Row]) -> bool
  buffer_idx = 0 
  try:
     while buffer_idx < len(buffer):
       y = next(b_row_iter)   
       if y not in hash_a:
         # no match, move on
         continue
       x = hash_a[y].x   
       buffer[buffer_idx] = Row(x=x, y=y)
     return True
  except StopIteration:
     return False  # Grab a vomit bag!

group_by_output: dict[tuple, Row] = {}
while fill_join_buffer(join_output_buffer):
  # GROUP BY
  for input in join_output_buffer:
    x = join_output_buffer.x
    y = join_output_buffer.y
    if x not in group_by_output:
      group_by_output[x] = Row(x=x, sum_y=0)
    group_by_output[x].sum_y += y
  
```

This creates two "tight" loops, each operating on their own hash table with a minimum number of CPU instruction in the loop. If we knew the inside of the loop was very fast, we could even unroll those loops.

Operating on multiple rows at the same time also introduces the opportunity to do addition SIMD optimisations in the loops.

Note that I left the sizing of the output buffer an open ended question:

```python
join_output_buffer: list[Row] = [None] * BUFFER_SIZE
```

You can have this buffer sized by the number of rows. But it turns out that you typically want to size it by the _size_ of the rows that it. You also want the sizing of that buffer to be relatively small - something around the size of the target architecture CPU cache (or some compromise that is good enough). This type of discussion needs a blog entry of its own.

Why do so many programmers hate Python?

In the above code, you saw an example of using exception handling for control flow in an iterator - in accordance with the Python interface for them. This is a very unexpected way to do something most programmers routinely do. Python is full of such violations of expectations that appear to have no good reason to exist. Completely breaking compatibility between version 2 and version 3 is another example. The global instruction lock another such, amateur decision. It isn't just the indentation that programmers hate - everything about this language screams: "Whoever is designing this thing has never written code at scale before!"

Nevertheless, I think we are stuck with Python - because it is still marginally better than the scripting languages of old (this should scare you).

# Summary

I think I have have to stop here for today. There is only so much Python code I can write per day before I feel the need to take a shower.

What did we learn on our journey together today?

- We learned how to read basic query plans coming out of `EXPLAIN`
- You learned what a "blocking operation" is
- We learned that databases make design choices in their implementation of query execution
    - Top down or bottom up execution in the tree (push the rows up, vs pull the rows from the top)
    - Row based or batch mode execution
- While driving down the rougher side roads together - we introduced ideas of CPU caches and branch misprediction.
