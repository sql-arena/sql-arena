---
title: "Databases are just Loops - GROUP BY"
date: "2024-05-28"
tags:
  - "aggregation"
  - "database"
  - "performance"
  - "sql"
---

In my [previous post](databases-are-just-loops-joins.md) - I introduced the idea that you can think of database queries
as a series of loops. Let me take this ideas even further - introducing more complex database concepts in terms more
familiar to computer programmers.

Databases can do this cool thing called "aggregation". You may think of it like `GROUP BY`. You will have seen queries
like this:

```postgresql
SELECT x, SUM(v) AS agg_y
FROM a
GROUP BY x
```

What is going on here? And how can we think of this like a loop?

Aggregate or `GROUP BY`?

To establish some terminology: You will hear me refer to `GROUP BY` as "aggregation" in the following passages.

We will call `SUM(v)` above an "aggregate function" and we will call `x` a "grouping column". We will refer to the
entire loop as the "aggregation loop"

# Aggregations are just Loops

Consider again the query from above:

```postgresql
SELECT x, SUM(v) AS agg_y
FROM a
GROUP BY x
```

We can state this as a Python loop:

```python
class Row:
  def __init__(**kwargs):
     for k, v in kwargs:
        setattr(self, key, value)

a: list[Row] = [<some rows>]

output: dict[Any, int] = {}
for a_row in a:
  if a_row.x not in output:
     output[a_row.x] = Row(x=a_row.x, agg_v = 0)
  output[a_row.x].agg_v += a_row.v
```

Simple to understand:

- Add the row to the dictionary if it not already there
- I the row is there add the `v` value to the exiting row.

There is a subtlety here that we can observe once we extend the example to use two grouping columns instead of one:

```postgresql
SELECT x0, x1 SUM(v) AS agg_y
FROM a
GROUP BY x0, x1
```

Sketching out the loop again:

```python
output: dict[Any, int] = {}
for a_row in a:
  key = <what goes here?>
  if key not in output:
     output[key] = Row(x0=a_row.x0, x1=a_row.x1,agg_v = 0)
  output[key].agg_v += a_row.v
```

We are faced with one of the first challenges of relational databases: "what is the meaning of equality?"

## Equality - Or why people hate `NULL` (part 1 of many)

Let us put some data into table `a` to make it more concrete:

```postgresql
CREATE TABLE a
(
    x1 INT,
    x2 VARCHAR,
    v  INT
);
INSERT INTO a
VALUES (1, 1)
     , (1, 1)
     , (1, NULL)
     , (2, 2)
     , (NULL, NULL)
     , (NULL, 1) 
```

How are we to define a key into the dictionary for the combination (`x1`, `x2`)?

We could use the Python notion of tuple equality. As a reminder, two tuples in Python are equal:

- If they have the same number of elements
- If the corresponding elements of each tuple are equal

This happens to be the same definition of equality that aggregation in SQL uses. Because of that, the following will
work:

```python
output: dict[tuple[Any, Any], int] = {}
for a_row in a:
  key = (a_row.x0, a_row.x1) 
  if key not in output:
     output[key] = Row(x0=a_row.x0, x1=a_row.x1,agg_v = 0)
  output[key].agg_v += a_row.v
```

During aggregation, the notion of `NULL` in a database maps exactly to the notion of `None` in Python (and `nullptr`
in C++).

Given the above insight, how many rows do you expect this to return:

```postgresql
SELECT L.x0, L.x1
FROM a AS L
         INNER JOIN a AS R
                    ON L.x0 = R.x0 AND L.x1 = R.x1
GROUP BY L.x0, L.x1
```

You might have expected this to return the _same_ number of rows as the aggregate query? The (x0, x1) equality function
evaluated to itself, via a join, should have exactly the same unique values as if we had not joined.

You would be wrong...

Equality, when evaluated in `JOIN` operations - is not the _same_ equality as the one used for aggregation / `GROUP BY`.

It gets worse: yet another comparison function is used for sorting (which is what you get when you say `ORDER BY`).
And don't get me started (yet) on `MIN` and `MAX` aggregation and the semantics of `SUM` and `AVG` with **NULL** values.

In 3-value logic (which is what you get when you play with **NULL**) - you have truth tables like these:

<table><tbody><tr><td><strong>x = y</strong></td><td><strong>y = 1</strong></td><td><strong>y = 2</strong></td><td><strong>y = NULL</strong></td></tr><tr><td><strong>x = 1</strong></td><td>TRUE</td><td>FALSE</td><td>UNKNOWN</td></tr><tr><td><strong>x = 2</strong></td><td>FALSE</td><td>TRUE</td><td>UNKNOWN</td></tr><tr><td><strong>x = NULL</strong></td><td>UNKNOWN</td><td>UNKNOWN</td><td>UNKNOWN</td></tr></tbody></table>

When **NULL** or **UNKNOWN** (subtle distinction, for now, you don't need to care and we can think of them as the same
value) is used as to evaluate a predicate (something that has to evaluate to either true or false) then these mysterious
values are treated as **FALSE**.

This means that the join above _only_ produces the rows where the left and right side of the join have values that are
not **NULL**.

Enough about **NULL** for now - let the above serve as a warning about what is to come.

<aside>
<b>What's the deal with the comma in front of the line?</b>

You might have noticed that I tend to mention lists with the comma prepended, instead of appended. This is a common
practise for SQL people. Why do we do this?

Typically, when you create a table or write a query, the first column you mention is the primary key of the object you
care about. This makes that line special. But the rest of those columns? We often want to remove columns, reorder them
for readability (or to please client tools) and generally mess around with queries.

For example, let us say I wanted to reorder `x1` and `x3` in the below table rendered "the Python way"

```postgresql
CREATE TABLE foo
(
    k  INT PRIMARY KEY
    x1 INT,
    x2 INT,
    x3 INT
)
```

If I just use my editor to reorder the lines, I am stuck with:

```postgresql
CREATE TABLE foo
(
    k  INT PRIMARY KEY
    x3 INT --- oops!
    x2 INT,
    x1 INT,
)
```

Which isn't correct SQL.

When you prefix the comma, it is easy to reorder and comment out lines of code. Unlike Python, SQL does not allow a
final, trailing, comma on a list.
</aside>

<aside>
<b>Why pros almost never write DISTINCT</b>

In the above query, you might have noticed that there is no aggregate function. This is legal SQL.

Of course, I _could_ have written the much shorter:

```postgresql
SELECT DISTINCT L.x0, L.x1
FROM ...<etc>...
```

I didn't... Why? First of all, using `DISTINCT` in this way is _exactly_ the same as `GROUP BY`. But for nearly all
cases where you `GROUP BY`, you do so because you eventually want an aggregate function somewhere in the query (
see [my blog](https://database-doctor.com/?p=77) about using HAVING for a nice example). When a database person
sees `DISTINCT` sprinkled all over SQL queries - she typically will assume that the writer of that query probably forgot
to join properly (or didn't know data modelling)
</aside>

# Performance - an Introduction to Access Methods

Let us recap. We now have an aggregation algorithm that will work and we generalised it for the case of multiple
grouping columns.

To illustrate the next point, I want to use the simplest form of the algorithm, the case of a single grouping column:

```python
output: dict[tuple[Any, Any], int] = {}
for a_row in a:
  key = a_row.x
  if key not in output:
     output[key] = Row(x=a_row.x, agg_v = 0)
  output[key].agg_v += a_row.v
```

Notice that we are not actually fully done with the aggregation. Whatever node in the query consumes our aggregation may
not want to know about our dictionary representation (because Object Orientation, SOLID etc.). We may have to do
something like this:

```python
temp_output: dict[tuple[Any, Any], int] = {}
for a_row in a:
  key = a_row.x
  if key not in output:
     temp_output[key] = Row(x=a_row.x, agg_v = 0)
  temp_output[key].agg_v += a_row.v

output = temp_output.values() -- we only need the values
```

The astute reader will also now observe that several optimisations could be done to the algorithm 
above. For example, it uses too much memory by storing `x` twice in the dictionary, for both keys and values.

I made another implicit assumption here: That we would use a Python dictionary to keep track of the unique values we
have seen so far. There are other ways to implement aggregation. For example, we could sort the data first:

```python
output: list[tuple[Any, Any]]
prev_x = None
for a_row in sorted(a, key = lambda r : r.x):
    if a_row.x != prev_x:
       # new value observed
       output.append(Row(x=a_row.x, agg_v=0))
    output[-1].agg_v += a_row.v
    prev_x = a_row.x
```

The algorithm a database will chose to implement an operation (like an aggregate) is often referred to as the "access
method" for that operation. It is just a fancy way of saying: Algorithm.

## How to databases pick Access Methods?

Databases will intelligently pick between access methods when running the SQL queries you write.
There are three major categories of algorithms classically in use (with various refinements over the years):

- Sort the data then do a loop like the above. This access method is typically called a merge (ex: "Merge Join" or "
  Merge Aggregate")
- Use a hash table (in Python: A dictionary) and update that hash table as you see each row. Unsurprisingly, this access
  method is called "Hash" - and we get "Hash Join" and "Hash Aggregate"
- Use some kind of tree structure to locate rows. This is typically only used for joins. What exactly this is called
  gets tricky. Some people would call it "nested loop" and add the disclaimer of a "seek" to it. But not all nested
  loops have seeks - and not seeks imply nested loop.

(That last list bullet was intentionally wordy and vague. We are not yet at the point where we can talk about trees and
how database make use of them.)

You might recall the notion of big-O and small-o notation from computer science. The algorithms chosen by the database
depends greatly on what the database thinks about the O-complexity of the memory and CPU. It will consider factors like
these:

- How much memory do I have available to run this query (memory O-complexity)
- How long is this query expected to run? Can I spend more time starting the query and earn that back later as I crunch
  data?
- How many rows must i send to the client and how important is it for the client to stream those rows fast (this is
  called: First row latency)
- How fast is my disk vs. my memory?
- How important is this user or query compared to other queries (this is called Workload Management)
- What kind of CPU parallelism do I have available?
- How many CPU cores are optimal (Amdahl's law - look it up)

These are deep, computer science types of considerations. Which is why a passion for computational complexity often
leads you into the realm of databases!

# Summary

Today, my ramblings brought us to another important database operation: the aggregation.

We saw how aggregations are just loops. We also started on a longer journey - exploring the ideas of optimising these
loops for performance.

Some things to take away from today's visit to The Doctor:

- Databases call the actual algorithms they use the "access methods"
- **NULL** is horrible and making excessive use of **NULL** is akin to self harm
- You learned two new terms: "aggregation functions" and "grouping columns"
- Sorting, Hashing and trees are used extensively by databases and it is a big deal.
- Pack your backpack with a book about big-O notation and computational complexity - you will need it on our journey
  together.
