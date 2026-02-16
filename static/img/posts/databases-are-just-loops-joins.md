---
title: "Databases are just Loops - Joins"
date: 2024-05-24
tags: 
  - "database"
  - "join"
---

I decided to write this post in response to my recent discussions with [Matt Martin](https://www.linkedin.com/in/mattmartin14/). Matt and I have been sparring lately over software performance. During one of these discussions, Matt said the magic words in the title of this post. I hypothesise that this quote carries of lot of explaining power for those who are not fully familiar with databases.

Let us play with this idea a bit! I'm going to use Python to show examples of "database loops". Obviously, no one in their sane mind would implement a database in Python. But Python has the great advantage of being readable to nearly everyone. Let's go...

# Joins are just loops

If you have read an introductory blog or book about joins in database, you probably seen something like this:

![Join Diagram](/assets/img/sql-joins.png)

That is great if you're a visual type of thinker (if there is such a thing). You may even be able to solve basic SQL problems with an illustration like the above in the back of your mind.

But what does the database actually _do_ when it executes these joins? How are we to understand it well enough to do joins in our heads without needing to run code?

# INNER JOIN

Consider this query:

```postgresql
SELECT x, y
FROM a
INNER JOIN b ON a.x = b.y
```

What INNER JOIN says is: We need to visit all rows in `a` and match them with `b`. From what I can tell, it is often easier for people to think of this Python loop:

```python
class Row:
  def __init__(**kwargs):
     for k, v in kwargs:
        setattr(self, key, value)

a: list[Row] = [<some rows>]
b: list[Row] = [<some other rows>]
output: list[Row] = []
for a_row in a:
  for b_row in b:
    if a_row.x == b_row.y:
      output.append(Row(x=a_row,x, y=b_row.y)
```

I am going to leave out the definition of `Row`, `a`, `b` and `output` in the next examples, they will be the same from here on

`INNER JOIN` is just a loop.... That was easy, right? Let's do `LEFT JOIN`.

<aside>Tuple or row?

You will sometimes hear database people call a row a "tuple". They may even call a table a "relation". This makes us sound like esoteric wizards who KNOW stuff that other people don't. For example, Postgres calls the thing that contains tables `pg_class` (yes, I know it contains other things too) and the name of the thing in there is called `relname` (for "relation name" - because abbreviating something obscure makes it even cooler). You may also hear people say "attribute" instead of column. This all goes back to relational algebra - but nobody talks that way anymore.

For the rest of us out here in the real world - let's just call it: "rows", "columns" and "tables". We all know business users love Excel. The world runs on Excel and in Excel, it's called "a row" and "a column". Business users pay our salary - so lets talk like them!
</aside>

# LEFT JOIN

```postgresql
SELECT x, y
FROM a
LEFT JOIN b ON a.x = b.y
```

Translating to a Python loop, this is simply:

```python
for a_row in a:
  bool matched = False
  for b_row in b:
    if a_row.x == b_row.y:
       # same as INNER
       output.append(Row(x=a_row,x, y=b_row.y)
       matched = True
  if not matched:
    # no match, emit the OUTER LEFT
    output.append(Row(x=a_row.x, y=None)
```

## What is this INNER and OUTER thing? Why those names?

You might have heard database people talk about the "inner" and "outer" part of a join. As you can see from above, the join is just a nested loop (which you will also hear database people talk about - but they mean something slightly different).

You can now guess what is meant by the "inner" and the "outer" side of a join. Read the loop code above again. But this all gets very confusing - so I prefer to refer to the tables as the left and right tables (and you will see why in a later blog).

# RIGHT JOIN - an exercise

When you look at code from database geeks like me - you will almost never see a `RIGHT JOIN`. The reason: There is never a case where you need it!

Why is that? Because `RIGHT JOIN` has mirror symmetry with `LEFT JOIN`

The following:

```postgresql
SELECT x, y
FROM b
RIGHT JOIN a ON b.y = a.x
```

Is _exactly_ the same as:

```postgresql
SELECT x, y
FROM a 
LEFT JOIN b ON a.x = b.y
```

This means that every right can be translated to a left, and vice versa. Your choice! (but see below)

**Exercise for the reader:** Write the `RIGHT JOIN` above as a Python loop.

<aside>
<b>Should I use LEFT or RIGHT?</b>

In my experience, nearly everyone prefers writing `LEFT JOIN` over `RIGHT JOIN`. This is likely because most people read text from top to bottom. If you write your SQL query to only use `LEFT JOIN` - the tables that are preserved in the data, are the ones that are mentioned first. This makes it easier to do "mental math" on the SQL query. You will also see SQL experts writeall `INNER JOIN` in a query before they write the `LEFT JOIN`.

For example, you might write:

```postgresql
SELECT *
FROM a 
INNER JOIN b 
  ON a.k = b.k
INNER JOIN c 
  ON b.k = c.k
LEFT JOIN d 
  ON c.k = d.k
LEFT JOIN e ON d.k = e.k 
```

And you can read this as:  
Up until the last `INNER JOIN` we are matching rows and _only_ emitting matces. Starting from the first `LEFT JOIN` all rows that came before it are preserved.
</aside>

<aside>
<b>How to type the join clause like a pro</b>

When writing the join clause (that's the thing after the `ON`) mention the table you are joining from, before the table you are joining to.

For example, do this:

```postgresql
SELECT x, y
FROM a
INNER JOIN b ON a.x = b.y 
```

But _don't_ do this:

```postgresql
SELECT x, y
FROM a
INNER JOIN b ON b.x = a.y 
```

Why prefer `a.x = b.y` over `b.y = a.x`? They are semantically the same. You just wrote: `INNER JOIN b` - what comes next _must_ be about `b` - and what you are joining on from `b` is, if your data model is good, probably obvious. What is _not_ obvious is what you are joining from (in the above case: `a.x`). Mention the non obvious part first - that allows the reader to keep less information in his head. And we all want to save on mind cycles.
</aside>

# FULL JOIN

We have arrived at the join that some people find hard to reason about. But now that you realise that is is "just a loop" I think you will never have this problem again (if you had it before).

Here is the `FULL JOIN` version of our educational query:

```postgresql
SELECT x, y
FROM a 
FULL JOIN b ON a.x = b.y
```

Translating this to "just a loop Python":

```python
for a_row in a:
  bool matched = False
  for b_row in b:
    if a_row.x == b_row.y:
       # same as INNER
       output.append(Row(x=a_row.x, y=b_row.y)
       matched = True
  # Same as LEFT
  if not matched:
    output.append(Row(x=a_row.x, y=None)

# The FULL bit... (aka: the b ANTI a)
for b_row in b:
  matched = False
  for a_row in a:
     if b_row.y = a_row.x:
        match = True
  if not matched:
     output.append(Row(x=None, y=b_row.y)
```

So the `FULL JOIN` is actually:

- a `LEFT JOIN`
- plus all the stuff that from the `RIGHT` side that was not already emitted by the `LEFT` JOIN

# ANTI join

There is a concept you don't need to worry about yet, but which I will add here for completeness: It is called `ANTI JOIN`. You can't just write: `b ANTI JOIN a`. But the `b` ANTI join of `a` is actually that last part of the `FULL JOIN`, which is added at the to the `LEFT JOIN`. I often her that "full is left+right" or something along those lines. But that way of thinking about it will probably lead you to the wrong conclusions. Think: FULL = LEFT + ANTI RIGHT

# The infamous CROSS JOIN

This is the join that your DBA hates. It looks like this:

```postgresql
SELECT x, y
FROM a 
CROSS JOIN b
```

And the Python code is the simplest we have seen yet:

```python
for a_row in a:
  for b_row in b:
       output.append(Row(x=a_row.x, y=b_row.y)
```

You can see why it is called the "cross" join - multiplication looks like a cross in some mathematical notations: `a x b`. Cross is also what your DBA will feel if you do this stuff without good reason. This is the join that creates a ton of rows for all non-trivial cases. Be careful with it.

Why you need to stop using comma for joins!

Cross joins are deadly and nothing says: "Junior programmer" the way a cross join does (and yes, I still write them by accident sometimes).

Fortunately, there is something you can do avoid writing cross joins by accident. Most databases support join syntax of this form:

```postgresql
SELECT x, y
FROM a, b
WHERE a.x = b.y
```

For some people, this is more readable than explicitly typing the join. It is also less typing on the keyboard - and some people really care about that (answer: Install an IDE with autocompletion and shut up - this isn't 1990 anymore!). The above syntax is cancer, avoid it! .. it is too easy to forget the join clause in queries like this. How on earth are we to make sense of something like this:

```sql
SELECT *
FROM a, b, c, d, e, [...] 
WHERE a.k = b.k AND b.k = c.k [... <ad nauseum>]
```

One typo here, one quick commenting out some code you dont want, one little mistake... and you got a cross join.

Save yourself some trouble and type:

```postgresql
SELECT x, y
FROM a
INNER JOIN b ON a.x = b.y
```

And if you _must_ do a cross join,type:

```postgresql
SELECT x, y
FROM a
CROSS JOIN b
```

This says to the reader: I know what I am doing here is dangerous - trust me: I'm a pro!  


## Summary

In this blog, we have scraped the surface of an idea that is simple, yet hold great explaining power: that database are "just loops". Most programmers intuitively understand loops - and I hope the above might "turn on the light" for some people who have previously been afraid of databases and their sometimes obscure notations.

There is a lot more to be said about this. Next time, I think we will talk about `GROUP BY` - which is also: "just a loop". And then, we should start talking performance...

## Performance

Anyone remotely familiar with writing code will have realised that my Python loops above are the kind of loops that will get you kicked out of computer science school (or make cloud vendors like AWS very happy if you put them into production).

I got your mind thinking about loops now! Soon, we will talk about the kind of performance optimisations databases do to make these loops fast. So fast that most programmers just need to use a database to crunch numbers. Because you will realise the truth: that the database is smarter than 99% of everyone out there (including me).


## An Exercise

Consider the following data:

```postgresql
CREATE TABLE a (x INT);
INSERT INTO a VALUES (1), (2), (2), (3), (4)
CREATE TABLE b (y INT);
INSERT INTO b VALUES (2), (2), (3)
```

Without running the SQL below in a database, tell me what the output of the following is:

```postgresql
SELECT x, y 
FROM a
INNER JOIN b ON a.x = b.y
;
SELECT x, y 
FROM a
LEFT JOIN b ON a.x = b.y;
;
SELECT x, y 
FROM a
RIGHT JOIN b ON a.x = b.y;
;
SELECT x, y 
FROM a
FULL JOIN b ON a.x = b.y;
;
```

You can use your favourite database to check the results instead of bothering me. 
All database agree on what the results are of each join

**Edit: My good friend Martin Broholm pointed out a bug in the LEFT join. Fixed on 2025-08-11**
