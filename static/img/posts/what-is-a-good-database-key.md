---
title: "What is a good database key?"
date: "2023-04-07"
tags: 
  - "data-model"
  - "key"
---

A central value add of modeling databases for analytical purposes and speed is that you can restore the sanity, often lost in the source system, that comes from using _good_ keys in each table.

But what exactly does it mean for a key to be "good"?

# Key Properties

Keys, they refer to “something” that is uniquely identifiable in a database. Depending on what you are modeling, those “somethings” have different names, for example: entities, rows, tuples, cells, members, documents, attributes, object instances, and relations between the any of the latter.

Because this blog is about relational databases and performance, let us get real with the terminology here. Nobody really cares about "logical models" these days, if ever. So, I will use the term: “row” as the “something” that a key refers to, the term “column” as the data structure that contains the key and the term "table" as the thing containing all the rows we are talking about. Sorry Postgres people, nobody calls it tuple, attribute and relation these days. Oh, forgive me... I'm rambling again...

A “good key” is a column that has the following properties:

- Unique
- Small
- Integer
- Once assigned to a row, it never changes
- Even if deleted, it will never be re-used to refer to a new row
- Single column
- Stupid

Let's begin...

# Unique

It follows from the definition of a key that it is unique. But saying it is so, does not make it so. If you have it available, use the features of your database to _force_ the key to be unique. Or trust some ORM system at your own peril.

You could use a `PRIMARY KEY` constraint, a `UNIQUE` constraint or any other method your favourite database supports.

Even if your database does not enforce uniqueness (like some MPP databases don't) you should still declare the `PRIMARY KEY`. Why is that? Primary key constraints in a database allows the database to make inferences about the data. Particularly if you also use `FOREIGN KEY` constraints pointing at the key. Think of them like statistics - but across tables.

Consider the follow SQL statement:

```postgresql
SELECT ...
FROM Foo
JOIN Bar ON Foo.FK = Bar.PK
```

If the database knows that `FK` is a foreign key to `PK` it can make a very useful inference: It MUST be the case that this join produces exactly the same amount of rows as there are in `Foo` (except those that have `NULL` values). Think about how useful that is when the query optimiser gets to work.

In summary: Declare those keys, every time, even if your database does not force them to be unique.

# Small / Integer

Your keys should be integers, pretty much no exceptions. Why? Integers have a unique property that no other data type has: a CPU knows how to work with them. Well, strictly speaking, floats/doubles have the same property . But you _really_ don't want floats as keys, for reasons we can discuss later.

What kind of integers do you want? 8, 16, 32, 64 or 128bits? It is generally considered the revealed wisdom that smaller integers take up less disk space. In a modern database using a column store, this is mostly nonsense. Why is this?

Most databases compress column based storage using a method known as "bit packing". Consider the 32 bit integer 42. In hex, with most significant bit on the left, this is:

```
4210 = 0x0000002A16
```

You will notice something about this pattern: it's full of zeroes. Databases make use of this insight. Nearly all column storage formats knows how to represent integers as:

- A prefix of number of bits that are empty
- The actual value

Since there is a max of 32 bits that can be empty, you will use a maximum of 5 bits for the prefix. "but wait", I hear you say, "doesn't that still mean that a value which would otherwise fit in 16 bits takes up an extra 5 bits?". Well, yes.. but with some reservations. Most columnar formats keep some metadata around that says something to the effect of: "The next N column values all have a prefix of 18 zeros". Since N is typically very large (particularly if you only store 16 bit integers in a 64 bit integer type) the amount of prefix bits needed is _very_ small compared to the total data size.

Because of bit packing, you can generally get away with using 64-bit integers for all your keys. That makes it easy to remember for everyone designing new tables. And, it gives you enough unique keys value to last until the heat death of the universe (you do _not_ run out of 64-bit values, trust me on this one).

You should not need 128 bit keys and they are nowhere as effective as their smaller siblings. CPU registers generally operate better on things that are 64 bits or smaller.

## The super unique key trick

I am going to share a trick with you that I may regret later. But, I have found it so incredibly useful in my career and it hasn't come back to haunt me. It is probably useful and harmless.

If you have decided to use 64-bit integer for keys in all your tables - it is rather tempting to make sure those keys don't overlap _across_ tables.

Consider the following, small data model that you probably have somewhere in your database environment:

```postgresql
CREATE TABLE customer (
  customer_id BIGINT PRIMARY KEY
  , name VARCHAR
);
CREATE TABLE customer_special (
  customer_id  BIGINT PRIMARY KEY
  , name VARCHAR
)
CREATE TABLE fact (
  customer_id BIGINT NOT NULL REFERENCES customer(customer_id)
, sales NUMERIC(15,2)
);
CREATE TABLE fact_special (
  customer_id BIGINT NOT NULL REFERENCES customer_special(customer_id)
  , sales NUMERIC(15,2)
)
```

Somewhere in your analytical system, someone created a different customer table, with their own keys, and their own data. And they aren't following the naming convention either. Because people are special like that...

A reader of the database schema can immediately see the problem. But the "special people" use Superhero BItm, with a special data model that writes queries for them using visual interfaces only THEY understand (because they are special).

And now, you end up with a query like this:

```postgresql
SELECT name, SUM(Sales)
FROM fact
JOIN customer_special 
  ON fact.customer_id = customer_special.customer_id
GROUP BY name
```

Do you see the problem? The special people don't, because they forgot that the `fact` table keys only match `customer` and not `customer_special`.

Two things can now happen:

- Some of the keys in `customer_special` match `fact` by accident
- None of the key `customer_special` match `fact`

In the former case, the query produces a results that the special people might think is wrong - and you are now going to hear them say things like: "Your database doesn't work". In the latter case, the special people might realise they aren't that special after all, and every bit as prone to errors as the rest of us.

The trick here is to make sure the primary keys are unique _across all tables in the database_. This is doable using a variety of hacks. With a proper, high speed, sequencer implementation of the database, you can simply do this:

```postgresql
CREATE SEQUENCER super_unique;
CREATE TABLE customer (
  customer_id BIGINT PRIMARY KEY default next_val(super_unique)
  , name VARCHAR
);
CREATE TABLE customer_special (
  customer_id  BIGINT PRIMARY KEY default next_val(super_unique)
  , name VARCHAR
)
```

It's dirty and a bit sneaky. But, you are not going to run out of BIGINT values. Trust me on this one too: there are a lot of "special" people out there.

# Never changes

You should never update key columns or change the column that is the key.

First, it creates a mess of anything that depends on the key (which may or may not be enforced with referential integrity).

Second, updates of key columns can have bad performance implications since the database has to do a lot of book keeping to keep the table consistent

# Never re-use

This is a variant of the unique property and ties into the same problems you saw with the super unique trick.

Keys should never the re-used – even if the row they identify has been deleted. This turns out to be a crucial requirement in analytical systems, because we may not always be able to track all the dependencies between tables in an automated manner. This means that some user reports may be in a state of partial inconsistency, and this is ok and normal. However, if rows exist that refer to an old version of the key, those rows may magically reappear in user reports and end up pointing to the wrong values.

If your keys are 64-bit integers - you have no reason to reuse them.

# Single Column

It is bad practice to use multi-column keys.

First, it is ugly to express foreign key constraints on them.

Second, it makes the SQL required for accessing the key (and joining on it) more complicated and error prone to users (and programmers). Particularly bad if you forget to join on one of the key components.

Third, multi column keys makes it harder to write automated code that accesses the model (including code that auto loads the model).

Fourth, it is more difficult to express histograms on multi-column keys, which makes the query optimizer more prone to generating bad plans when you join on multi-column keys.

## The multi column exception

I used to advise against this pattern for modelling M-N relationships

```postgresql
CREATE TABLE customer_owns_product (
  customer_id BIGINT NOT NULL REFERENCES customer(customer_id)
  , product_id BIGINT NOT NULL REFERENCES product(product_id)
  , PRIMARY KEY (customer_id, product_id)
)
```

You could add an additional column to track each row in this table and add a `UNIQUE` constraint on `(customer_id, product_id)`. But, it turns out that for the M-N case, it doesn't really matter because you only `JOIN` on one of the columns at a time. Sorry about that for anyone who followed my advise and wasted some bytes.

But, there is an exception to the exception. Consider the case where a customer owns a product, and that ownership has one of more subscriptions attached to it. We might be tempted to model like this:

```postgresql
CREATE TABLE product_subscription (
    product_subscription_id BIGINT NOT NULL PRIMARY KEY
  , customer_id BIGINT NOT NULL REFERENCES customer(customer_id)
  , product_id BIGINT NOT NULL REFERENCES product(product_id)
  , monthly_cost NUMERIC(15,2)
  , CONSTRAINT fk_owns_product
    FOREIGN KEY(customer_id, product_id) 
    REFERENCES customer_owns_product(customer_id, product_id)
)
```

This is not a good idea. The data model above forces us to join on both `customer_id` and `product_id` when we need to check if the subscription is valid. A better design is:

```postgresql
CREATE TABLE customer_owns_product (
  , customer_owns_product_id BIGINT NOT NULL PRIMARY KEY
  , customer_id BIGINT NOT NULL REFERENCES customer(customer_id)
  , product_id BIGINT NOT NULL REFERENCES product(product_id)
  , UNIQUE (customer_id, product_id)
);

CREATE TABLE product_subscription (
  product_subscription_id BIGINT NOT NULL PRIMARY KEY
  , customer_owns_product_id BIGINT NOT NULL 
    REFERENCES customer_owns_product(customer_owns_product_id)
  , monthly_cost NUMERIC(15,2)
)
```

This makes the joins occur on a single column, restoring our ability to properly estimate cardinalities without venturing into the tricky area of multi column statistics.

# Stupid

A key should not contain useful information about the row it refers to. This would be a violation of the rules of database normalization. While you may not agree with the rules of normalization (and there are good reasons to disagree), consider this: If the key contains information about the row it refers to – “smart” programmers may get the idea that code could be written that would use the value of the key to implement business logic. Remember, when we build analytical databases, we are not writing code - we are presenting information to users who aren't trained programmers.

What happens if someone changes the row values and the key no longer reflects the other columns that it used to be correlated with inside the row? Then the code is wrong, and you will have users begging/ordering you to change the key (violating the principle of “never change”).

Any dependency on specific key values in business logic is generally bad news for your ability to implement changes. Keep the keys to yourself and don’t tempt users to get smart about them. The keys are meant for joining on - efficiently. This means you will have a secondary key on a table. For example, you may model a person with a social security number like this:

```postgresql
CREATE TABLE customer (
  customer_id BIGINT NOT NULL PRIMARY KEY
  , ssn varchar NOT NULL
  , UNIQUE(ssn)
)
```

You generally don’t want users remembering specific primary keys in your data model except for debugging purposes. This is the teflon principle: “nothing sticks to it”. Teflon keys allow you to change the data structure of the database transparently to the end users by normalising and de-normalising to your heart's desire (and making clever use of views).

Users should be using the primary key on the table only for joins, and fetch unique rows by some known, secondary key.

The exceptions to the teflon principle, are keys for date and time. It is a reasonable assumption that “time does not change” and you may get away with generating these keys in the integer format `YYYYMMDD` and `HHMMSS`. Incidentally, this makes queries on date and time easier to write and the data easier to partition.

# Summary
We have gone over what a good database key looks like. Go out there and use this knowledge to make better data models.
