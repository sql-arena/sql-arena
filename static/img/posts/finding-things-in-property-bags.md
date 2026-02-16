---
title: "Finding things in Data Models with Property Bags"
date: "2024-04-13"
tags:
  - "cook-book"
  - "data-model"
  - "aggregation"
  - "sql"
author: "The Doctor"
---

When designing database schemas, you may find yourself needing to create a property bag table that is in a 1-n
relationship with an entity table. It isn't always viable to just add more columns to a table because you may not know
all the properties you want in advance. The problem with these property bags is that they can be hard to query.

In this blog entry, we will explore the property bag data modelling use case and provide some tricks that will make it
very simple to query those bags.

# Example Data

Let us assume you have a `god` table containing the names of Nordic deities. The gods, being fickle - will have
properties you cannot predict. To solve this, you have added a general `god_property` table containing name/value pairs
so you can easily store new properties on each god as users add them.

Your schema might look something like this:

```postgresql
CREATE TABLE god
(
    god_id      INT PRIMARY KEY
    , full_name VARCHAR
);

CREATE TABLE god_property
(
    god_id      INT REFERENCES god (god_id)
    , name      VARCHAR
    , value     VARCHAR
)
```

To make it easier to follow the upcoming tricks - let us add some sample data you can use to experiment:

```postgresql
INSERT INTO god (god_id, full_name)
VALUES ( (1, 'Odin')
       , (2, 'Thor')
       , (3, 'Loki')
       , (4, 'Freya'));

INSERT INTO god_property (god_id, name, value) (
    (1, 'Eyes', '1') , (1, 'Pet', 'Raven')
        , (1, 'Pet', 'Raven')
        , (1, 'Weapon', 'Spear')
        , (2, 'Weapon', 'Hammer')
        , (2, 'Eyes', '2')
        , (2, 'Pet', 'Goat')
        , (2, 'Pet', 'Goat')
        , (2, 'Drinks', 'Mead')
        , (3, 'Eyes', '2')
        , (3, 'Drinks', 'Mead')
        , (3, 'Pet', 'Cat')
        , (4, 'Eyes', '2')
        , (4, 'Pet', 'Cat')
        , (4, 'Pet', 'Cat'));
```

Take a moment to think about how you would answer these two queries in the data model:

> Which god drinks mead and has a pet cat?

> Which god has 2 or more pets, 2 eyes and uses a weapon?

You answer might make you regret that choice of property bag - perhaps you are learning toward making the `god` table
wider and adding columns that could be **NULL** if they are not relevant? This is how bad data models with thousands of
columns pop into existence... Not so fast, let us solve this properly...

# The Correlated Sub-query Solution

The classic approach to answering these queries, and the solution that typically makes you wish you had wider tables, is
to use correlated sub-queries.

Let us start with:

> Which god drinks mead and has a pet cat?

```postgres
SELECT full_name 
FROM god G
WHERE EXISTS (SELECT * 
                         FROM god_property GP 
                         WHERE G.god_id = GP.god_id 
                             AND GP.name = 'Drinks' AND GP.value= 'Mead')
  AND  EXISTS (SELECT * 
                        FROM god_property GP 
                        WHERE G.god_id = GP.god_id
                            AND GP.name = 'Pet' AND GP.value ='Cat')
```

This isn't a very nice solution, because even simple, user formulated queries end up looking very complex. May the table
gods have mercy on you if you used an Object Relational mapper to solve it.

It gets worse... how about this one:

> Which god has 2 or more pets, 2 eyes and uses a weapon?

```postgres
SELECT full_name
FROM god G
WHERE  (SELECT COUNT(*) 
               FROM god_property GP 
               WHERE G.god_id = GP.god_id 
                 AND GP.name = 'Pet') >= 2
  AND  EXISTS (SELECT * 
                        FROM god_property GP 
                        WHERE G.god_id = GP.god_id
                            AND GP.name = 'Eyes' AND GP.value ='2')
  AND  EXISTS (SELECT * 
                        FROM god_property GP 
                        WHERE G.god_id = GP.god_id
                            AND GP.name = 'Weapon')
```

This is obviously horrible. The `EXISTS` part of the query typically ends up as joins and we join multiple times
to `god_property` - causing many reads of the same table. On large data models, this results in poor performance and
much more I/O than we should desired for such a simple query. It is also query optimiser suicide.

## Why is this so hard?

This problem, when solved with sub-queries, turns out to be deceptively complex for something that seems to be a simple
question. One of the reasons is that we are querying data in "two directions":

1. We are looking for a specific column in `god` going horizontal across the the column (in this case, `full_name`)
2. We are trying to find all rows that match it by going vertical (via `name` and `value`) through all foreign keys (
   via `god_id`) that point at the row.

it almost feels as if we should have pivoted the data.

But, is there a better way to write these queries?

# Boolean Aggregations

In database that support the `BOOLEAN` data type (for example, Postgres) you can aggregate boolean values
with `MIN`/`MAX` aggregate functions. It is generally the case that **True** is greater than **False** (C/C++
programmers know why that is so). **True** is also greater than **NULL**.

This is a valid query in most databases that have a `BOOLEAN` type:

```postgres
CREATE TABLE bool_test (x bool);
INSERT INTO bool_test VALUES (True), (False), (NULL);

SELECT min(x), max(x) FROM bool_test 
```

And it returns:

```
(False, True)
```

In a set of booleans, if at least one of them is **True**, the `MAX` of that set evaluates to **True**. This turns out
to be useful.

## Solving the god properties with Boolean aggregation and `HAVING`

Let us revisit this query:

> Which god drinks mead and has a pet cat?

Here is an alternative solution that looks (in the eye of some beholders) as simple as the question being asked:

```postgresql
SELECT G.god_id, G.full_name
FROM god G
JOIN god_property GP ON G.god_id = GP.god_id
GROUP BY G.god_id, G.full_name
HAVING MAX(GP.name = 'Drinks' AND GP.value = 'Mead') -- drinks mead
   AND MAX(GP.name = 'Pet' AND GP.value = 'Cat') -- had a pet cat
```

Why does this work? Consider the stream of data coming out of the join that is fed to the `MAX` aggregates and
the `GROUP BY G.god_id, G.full_name`: From inspection of the input data, we can see that the answer to our query is *
*Loki** and that the rows we calculate for **Loki** when joining `god` with `god_property` is:

<table><tbody><tr><td><code>G.god_id</code></td><td><code>G.full_name</code></td><td><code>GP.name</code></td><td><code>GP.value</code></td><td><code>GP.name = 'Drinks'<br>AND GP.value = Mead</code></td><td><code>GP.name = 'Pet'</code><br><code>AND GP.value = 'Cat'</code></td></tr><tr><td>3</td><td>Loki</td><td>Drinks</td><td>Mead</td><td>True</td><td>False</td></tr><tr><td>3</td><td>Loki</td><td>Eyes</td><td>2</td><td>False</td><td>False</td></tr><tr><td>3</td><td>Loki</td><td>Pet</td><td>Cat</td><td>False</td><td>True</td></tr><tr><td><strong>MAX</strong></td><td></td><td></td><td></td><td><strong>True</strong></td><td><strong>True</strong></td></tr></tbody></table>

We can see that the `MAX` value of the two last column is **True** _only_ if there is at least one row in `god_property`
that matches the boolean expression we are searching for. It should hopefully be clear how we can now use the `HAVING`
clause to find our answer.

Now that you understand the trick, let us expand the idea and introduce other types of aggregate functions to the
pattern.

> Which god has 2 or more pets, 2 eyes and uses a weapon?

```postgresql
SELECT G.god_id, G.full_name
FROM god G
JOIN god_property GP ON G.god_id = GP.god_id
GROUP BY G.god_id, G.full_name
HAVING MAX(GP.name = 'Eyes' AND GP.value = '2') -- has two eyes
   AND MAX(GP.name = 'Weapon')                  -- has a weapon
   AND SUM(CASE WHEN GP.name = 'Pet' THEN 1 ELSE 0 END) >= 2 -- has two or more pets
```

## Flexing with Sums

Depending on how your target database interprets `BOOLEAN` and `INT` - you can simplify queries that need to count
properties with:

```postgresql
SUM
    (CAST(GP.name = 'Pet' AS INT))
    >= 2
```

(This assumes that casting **True** to INT has the value 1 - validate it on your platform).

## Databases without Boolean Types or Boolean Aggregations

If your database of choice does not have a `BOOLEAN` type, or does not have boolean `MIN` / `MAX` aggregates, you can
still these news tricks with a simple rewrite.

Instead of aggregating a `BOOLEAN`, you can use `MAX` on a `CASE` expression (which every database worth using will
have).

This expression:

```postgresql
MAX
    (GP.name = 'Drinks' AND GP.value= 'Mead')
```

Is the same as this:

```postgresql
MAX
    (CASE WHEN GP.name = 'Drinks' AND GP.value= 'Mead' THEN 1 ELSE 0 END)
    = 1
```

# Helping the Query Optimiser

In large data models with a lots of properties, you may decide that you want some kind of index on `god_property` to
help you find specific, common `name` rows faster. You might do something along these lines:

```postgresql
CREATE INDEX make_name_fast ON god_property (name)
```

Depending on your query optimiser - this may not be enough to help our new solution run faster. Whether such an index
speeds up the query or not depends on the query optimiser understanding that the following:

```postgresql
HAVING MAX(GP.name = 'Drinks' AND GP.value= 'Mead') 
  AND MAX(GP.name = 'Pet' AND GP.value ='Cat')
```

... Implies that you _only_ need to look at rows with: `name in ('Pet', 'Drinks')` and that such a lookup can use an
indexed access. This type of reasoning is beyond most query optimisers.

But, you can help out, by doing this:

```postgresql
SELECT G.god_id, G.full_name
FROM god G
         JOIN god_property GP ON G.god_id = GP.god_id
WHERE GP.name in ('Drinks', 'Pet') -- Tell the optimiser that we only want some rows
GROUP BY G.god_id, G.full_name
HAVING MAX(GP.name = 'Drinks' AND GP.value = 'Mead')
   AND MAX(GP.name = 'Pet' AND GP.value = 'Cat')
```

# Summary

There you have it dear reader: It is possible to query property bags with elegant, high performance queries. The next
time you think: "Should I add a ton of columns to this table because it is hard to query all these damn properties users
keep adding?"... Perhaps try out the tricks above first.
