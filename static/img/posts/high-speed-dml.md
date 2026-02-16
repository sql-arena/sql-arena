---
title: "Why are Databases so Hard to Make? - High Speed DML"
date: "2024-9-24"
tags:
- "database"
- "se"
- "data-structures"
- "transaction-log"
- "dml"
---

After a brief intermezzo about testing (read about my thoughts here: [Testing is Hard and we often use the wrong
Incentives](testing-is-hard.md)) - it is time to continue our journey together to where we will explore databases and 
all the wonderful things they can do.

To fully enjoy this blog entry, it will be useful if you first read the previous posts:

- [Why are Databases so hard to Make? Part 1 - CPU usage](database-cpu-usage.md)
- [Why are Databases so Hard to Make? Part 2 – Logging to Disk](logging-to-disk.md)

Let's get to it...

# Appending Data to Tables

The basic building blocks of every database are tables and the rows in them. A useful analogy is this:

- Tables are files on disk
- Rows are offsets into into those files.

While the analogy will break down later in the series, it is a good intuition pump to get us started.

For the purpose of this blog, let us consider a simple table, this one:

```postgresql
CREATE TABLE loot (
    loot_id INT PRIMARY KEY
  , item VARCHAR(100)
  , weight_kg DECIMAL(18, 3)
)
```

Remember how a database makes a guarantee: 

> Returning successfully from a statement means that the data is safely on disk

How does it achieve this at scale?

<aside>
<B>Why your table names should use snake_case naming. And why your key column should be prefixed with the table name</b>

In the examples I use, you will see my use snake_case for my names. If a table is called: `my_table` then I will call 
the key in that table `my_table_id`. This convention is useful for several reasons:

- Most databases will treat all names as case insensitive and store the name of the object internally as lowercase
- That means that if you say: `SELECT * FROM My_Table`, the database will interpret that as: `SELECT * FROM my_table`.
- Because tables are "default lowercase" - you might as well name that as such in your scripts. Because that is how they  
  will get stored.

The key of the table should be named with the full name of the table as a prefix. Foreign keys should use the same name
as the key they point at.

This makes it easy to tell what table a foreign key references, without looking up the DDL. For database that support 
the `USING` syntax for joins, it also makes your SQL more readable

That last point might be controversial, so let me show you why I am right. Consider two different schemas:

```postgresql
-- The wrong way
CREATE TABLE a (
    id INT PRIMARY KEY
);
CREATE TABLE b (
    id INT PRIMARY KEY
  , a_id INT REFERENCES a(id)
);

-- The right way
CREATE TABLE x (
    x_id INT PRIMARY KEY
);
CREATE TABLE y (
    y_id INT PRIMARY KEY
  , x_id INT REFERENCES x(x_id)
);
```

Now, let us write the two joins next to each other. First, the join of `a` to `b`. It looks like this

```postgresql
SELECT *
FROM a
JOIN b ON a.id = b.a_id
```

Notice how easily we could get this join wrong. We might for example write `a.id = b.id` and we would get a very odd
result.

Compare this with the `USING` syntax - we can write:

```postgresql
SELECT *
FROM x
JOIN y USING (x_id)
```

Nicer, succinct and less error prone! Prefixing with the table name also makes it easy to ask: "Which columns reference
this primary key?". Because you simply do this:

```postgresql
SELECT *
FROM information_schema.column
WHERE column_name = 'x_id'
```
</aside>


# Small `INSERT` - with and without concurrency

If we execute these statements:

```postgresql
BEGIN TRANSACTION;
  INSERT INTO loot VALUES (1, 'hammer', 1.5);
  INSERT INTO loot VALUES (2, 'goats', 50);
  INSERT INTO loot VALUES (3, 'gold', 10);
COMMIT;
```

We will expect that the transaction is safely on disk before it returns.

How much data is this? An `INT` is around 4B (depending on null'ness and bit packing). `VARCHAR` data is around the size 
of the data, plus either a length indicator or zero byte terminator. The `DECIMAL` is likely 8B for this case (since all
numbers with 18 digits or less fit in a 64-bit integer). The total size of this data is less than 100 bytes. This is a
very small disk write.

Previously, you saw how we can write this data to the transaction log and make use of concurrency to aggregate many
small writes into larger ones. For small writes like these - this is a very solid strategy that we can also use when
writing to tables - if the writes are small.

One thing I did not mention in the blog about logging to disk was this interesting set of observations:

- If the incoming data has low concurrency or low frequency - writing small data blocks to disk does not matter
  Because even if we end up paying the cost of small writes - there just aren't that many of them
- If, on the other hand, the system is very busy - we want to avoid lots of small writes
  Because we now have a source of concurrency, we can aggregate the writes and make them bigger

Thus, when appending to tables - we can treat the table very much like a transaction log. Obviously, this wont work if
the table has indexes where we can't just put the write "at the end of the file" - but let us keep things simple for
now.

# Big `INSERT` operations

Not all appends are small. When doing ETL for data warehouses - we tend to move large quantities of data around. This
type of data movement can also occur when we remodel a database - something many fear doing. 

A large data append could look like this:

```postgresql
BEGIN TRANSACTION;
  INSERT INTO loot
  SELECT new_id(), item, weight_kg
  FROM loot_from_england_raid;
COMMIT TRANSACTION;
```

Assume the above results in 100GB of data being copied and that the average row size is 100B. Writing a 100GB file to a
modern SSD will take around 2 minutes (if you have a single SSD, faster if you have more). So we expect this statement
to run in the order of minutes.

We could treat this append just like a loop of small `INSERT`, looping once for each row in `loot_from_england_raid`.

As we saw in the transaction log implementation, we can batch up multiple rows in a single round trip to the transaction
log. If our log write size is a typical 8K and it takes 1ms to flush the log, we can calculate the time to write the 
100GB table as follows:

```
Write Time = 100GB / 8KB * 1ms = 12500s ~ 200minutes
```

That's a _lot_ (100x) longer than we would have expected from the speed of our SSD.

## Bulk/Allocation Logging
Well written databases, particularly those designed for analytical/ETL workloads, understand that large `INSERT` like 
the above must be handled differently.

Recall, that a transaction either happens fully or does not happen at all. We can make use of this if we know we are 
about to write a large amount of data. We can do the following:

1) Allocate a large chunk of space on disk
2) Write the data to the allocated space
3) Log that we have successfully written the data
4) Repeat as needed until the entire transaction is done

This is called "bulk logging" or "allocation logging". It is a very powerful optimisation that can make large appends
run significantly faster. It also comes with some interesting properties:

- If the transaction fails, we can simply delete the allocated space (by re-reading the log stream an deallocating
  the space written in step 3.
- As we write the data, we can pipeline the replication of that data. Instead of waiting for the entire append to 
  complete, we can send data to the replica when each block is successfully written (step 3 above).
  - Note that using this technique assumes most transactions succeed. 
  - If you have a high failure rate, streaming data to the replica only to roll it back later is a waste of resources.

### How large should the Chunk be?

We already saw that a chunk size of one row (100B) results in a 100x slowdown from the expected speed. In the other 
extreme, we could bulk log the entire 100GB allocation in one go. But that would result in replicas falling behind 
the primary. Why is that? 

Consider this sequence:

1) Primary logs allocation of 100GB
2) Replica receives the allocation and reserves 100GB of space 
3) Primary writes 100GB of data to the allocated space (this takes 2 minutes)
4) Primary logs that the write is successful
5) Replica now knows that copying the 100GB of data is safe and committed 
6) Replica copies the 100GB (this takes another 2 minutes)

In this sequence, the write takes a total of 4 minutes - because the replica is waiting for the primary to finish the
write before it can start copying the data. This is not ideal.

An optimisation should come to mind: Primary streams the write both locally and to the replica. This requires careful 
coordination between the primary and the replica. The problem we face now is that the primary must wait for the replica 
to acknowledge the write before it can continue writing. If the replica is slow, the primary will be slow as well. We 
can work around this by making heavy use of buffers - but that is memory intensive.

Instead, we can split the 100GB into smaller chunks. We can then stream each chunk to the replica as it is written. If
we use the transaction log to keep track of each chunk, we can even recover from a disconnect between the primary and
the replica (resulting in resumable replication - a highly desirable property). 

How large should the chunks be? 

Turns out the optimal block size this depends on the latency of the drive. We assume that putting a marker in the 
transaction log takes around 1ms. The I/O required to do so is synchronous and serialised. This means there is an 
upper limit of transaction log write will be able to do while still staying under the 2min (120sec) time budget.

The maximum number of transaction log writes we can do in our 2 minute window is:
```
[Max TLog writes] = 120s / 1ms/write = 120000 writes
```

If we assume that the transaction log write is 8KB and that the writes only contain metadata, the total amount of 
data to write is:

```
[Total Data to Write] = 100GB + [Max TLog writes] * 8KB ~ 101GB
```

The allocation logging cost is tiny compared to the total amount of writing we want to do. We can now calculate the
smallest block size (under our current, naive, assumptions) we can use for bulk allocation. It is:

```
[Block Size] = [Total Data to Write] / [Max TLog writes] = 841KB
```

Between friends, that's about 1MB. A very comfortable block size for most modern SSDs and for network traffic. We can't
always assume that the disk will deliver writes in 1ms. For example, you may be in the unfortunate situation of having
an IT department insisting you run SAN - or you may be on cheap storage in the cloud. But, even at chunk sizes of 10MB 
or larger, which we can sustain with 10ms latency writes, we are still very much in the comfortable zone of pipelining 
the writes to the replica and doing bulk allocation.

Why might we want the chunk size to be _even_ _larger_ than the latency of the drive dictates?

### Compression
If we know we are going to write a lot of data - we can play compression tricks on it. The general rule about 
compression is: the more human generated data you have, the more likely it is that there are patterns or repetitions in 
that data. In a sense, put enough humans together and they all do the same stupid shit (just look at corporations).

Repetitions in data is exactly what compression algorithms make use of to reduce space. If we pick larger block sizes
for bulk allocation, we can often compress the data more. 

### Object Stores
These days, using Object Stores has become very fancy. Object stores are basically slow storage system that are designed
by people who are not smart enough to scale block storage. They typically serve I/O over HTTP - because if HTTP is 
good enough to serve Porn to the masses - its good enough for your storage! Furthermore, Object Storage allows Cloud 
providers to pretend the are being "innovative" while locking you into their specific Object Storage protocol.

Object Stores prefer _really_ big writes - if we can get away with 100MB or even 1GB - that's great news. 
It is particularly nice if we can have many such writes running in parallel (because the roundtrip time is so high). You
also need to account for the fact that some of those writes may fail and need manual retry. Because reliable storage is 
so last century.

Bulk logging got you covered - you dont have to pay for expensive EBS storage. You can still go fast - even in the 
cloud (look away, you didn't hear me say this).

# `DELETE` of Rows
As we have now seen, adding rows to a table, even a _lot_ of rows can be done at SSD disk speed if you have a good 
transaction log implementation with bulk allocations. Some databases leave it at that - and celebrate that they are 
"immutable". That's another way of saying: "We didn't finish the product because the rest was too hard".

_Our_ journey does not end there. We want a database to understand `DELETE` (and `UPDATE`) - so we can change records
in the database.

It turns out `DELETE` is a lot harder than `INSERT`. To understand why, let us start with the simple case.

## Deleting a lot of sequential rows

Consider a statement like this:
```postgresql
DELETE
FROM loot
WHERE loot_id > 3912
```

If we assuming our `loot_id` was sequentially written (for example by a bulk allocation), this `DELETE` can just remove 
the tail end of the file that represents the `loot` table. I hope it should be reasonably clear how to do this even 
if the table is made up of several chunks. Just write a transaction log entry for each chunk you remove.

<aside>
<b>Transaction Control</b>
At this point in our blog series, we have not yet discussed how to implement ACID properties and transaction control.
I am skimming over this subject for now - but I hope you trust that I will talk about this later.
</aside>

### Partitioning Data and `DELETE` (or `TRUNCATE`)
Databases that can handle very large workloads will often have a partitioning feature that allows you to split a table
into many smaller, "sub-tables" (=partitions). In such databases, you can delete an entire partition quickly by simply
deallocating the sub table and updating the allocation metadata.

Most database also support the `TRUNCATE` operation, which is a optimised path that simply says: "Delete everything 
allocated in this table". This is a very fast operation, because it can be implemented as a single log entry. Of course, 
a database really should be smart enough to realise that `DELETE FROM loot` is in fact the same as 
`TRUNCATE TABLE loot`.

You can get fancy and combine partitioning and `TRUNCATE`/`DELETE` to quickly get rid of old data by simply dropping
an entire partition.

## `DELETE` of random rows
We have been nice so far. Time to turn up the complexity a bit. For example, we might do this:

```postgres
DELETE
FROM loot
WHERE weight_kg < 10.0
```

This `DELETE` could touch rows _anywhere_ in the table. How can we reflect this on disk?

One strategy would be to run the following algorithm:

```python
for old_disk_block in loot_table_blocks
  new_block = DiskBlock()
  for row in old_disk_block:
    if row.weight_kg < 10.0
      pass # Throw row away
    else:
      new_block.append(row)
  new_block.write()       # write the new version of the block
  old_disk_block.delete() # deallocate the old block
```
This will work, but it is horribly slow and inefficient. In the worst case, we only delete one row in each of the 
exiting disk blocks. But the result would be a rewrite of the entire table. This is not acceptable.

<aside>
<b>Fragmentation</b>

It may have occurred to you that the above algorithm, will make the size of each disk block smaller and smaller. 
Everytime we delete a row, the new block is shrink, until the table is made up of many small blocks. This in turn
causes the overhead of the metadata to grow dramatically.

Again, I am going to hand wave a bit here. There is another blog entry coming up about exactly this problem.
</aside>

### Tomb Stones - Turning `DELETE` into `INSERT`
Rewriting an entire disk block to remove a few rows in that block is unacceptable - which should be obvious.

Instead, we can use a technique called "Tomb Stones". The idea is simple: instead of deleting a row, we mark it as
"dead". Future `SELECT` operations can then skip past that row as if it wasn't there. This is a very common technique 
in databases.

There are a few ways we can go about writing tombstones to disk. 

#### Using the Transaction Log
The most obvious choice is to use the transaction log to mark rows as dead. However, it would be very inefficient for 
`SELECT` to keep track of all dead rows by reading the transaction log data. One way to get around that is to cache the 
tombstones in a data structure in memory. But this now makes recovery from a crash very expensive (because you have to 
reconstruct the cache from disk).

#### Marking the rows inline
We could reserve a few extra bytes in the row that will be set when the row is dead. That way, a `DELETE` of rows in a 
block can be done in place. This works great if the block size is small (for example 8KB-64KB). It works even better
if we don't write the block to disk right away, but instead flush it only when we need memory. By deferring the write, 
multiple `DELETE` operations in the same disk block can be batched up to a single write. For OLTP type workloads, where
small `DELETE` operations (and their cousin: the `UPDATE`) are common, this is a good strategy.

When the database flushes the disk blocks, the entry in the transaction log has now been materialised and we don't need
to read the transaction log again to know what has been deleted - we will know by simply reading the data on disk.

However, it might be clear at this point that making this strategy work with compression is tricky. If we overwrite
the row in place, there is no guarantee that the resulting disk block will have the same, post-compressed size.

#### Deletion Bitmaps
Another strategy is to use a bitmap to mark rows as dead. For example, consider a sequence of blocks, each with 1000
rows:

**Block 1:**

| loot_id | item   | weight_kg |
|:-------:|:-------|:---------:|
|    1    | hammer |    1.5    |
|    2    | goats  |    50     |
|    3    | beef   |    30     |
|    4    | slave  |    82     |
|   ...   | ...    |    ...    |

**Block 2:**

| loot_id | item          | weight_kg |
|:-------:|:--------------|----------:|
|  1000   | gold          |       500 |
|  1001   | flying carpet |        20 |
|  1002   | sword         |        15 |
|  1003   | silver        |        11 |
|   ...   | ...           |       ... |

If someone issues a `DELETE` statement like this:

```postgres
DELETE FROM loot
WHRERE weight_kg >= 50
```

We can see that this should result in removing: **goats**, **slave** and **gold** from the table. We could represent 
this operation as a bitmap that looks like this (with the `loot_id` shown for clarity):

```
loot_id  bit
1        0
2        1 <-- DELETE goats
3        0
4        1 <-- DELETE slave
...      0 ...
1000     1 <-- DELETE gold
1001     0
1002     0
1003     0
...      0 ...
```
if there are 1000 rows in each block, the bitmap only needs: 

```
[Bits Needed] = 1000 rows/block * 2 blocks / 8 b/B = 250B
```

Obviously, such a bitmap would generally compress really well - particular if the set bits are reasonably 
sequential or represent a proportionally small (or large) fraction of the rows in the underlying block. In the case
above, where we only deleted 3 rows, we should expect the entire bitmap to compress down to around 10B.

You might at this time have inferred several issues with this approach.

First, if we `DELETE` a few rows in a lot of blocks, we may have to open, rewrite and recompress bitmaps. Alternatively,
we could stack multiple bitmaps on top of each other and having the OR'ing of those bitmaps be the resulting `DELETE`.
That would move the cost of keeping track of `DELETE` to the `SELECT` statements. We could also end up with many, 
very small, writes to disk for something that appears to be a simple `DELETE` operation touching only a few rows.

<aside>
<b>Explain-ability of Databases</b>
You might be wondering why products such as Oracle, SQL Server and Teradata still run such a large part of the IT 
industry. Surely, you would argue, the great brains of the open source industry must at this point have solved all the
problem these big databases solve.

The answer is that databases are not just about performance and the latest feature trend. They are also about 
predictability, reliability and _explain-ability_. This is a huge, blind spot for most open source products. If my query 
is slow, I want to know _why_ it is slow. And the why has to be explainable to someone whose only "skill" in life is 
having saved enough money to take an MBA degree.

The big, corporate databases get this - the open source databases do not!

The need for explain-ability drives design choices through the entire, complicated database stack. For example, in our
`DELETE` operation above, we would want a `DELETE` of 1000 rows spread over 1000 block to be roughly the same speed as
deleting 1000 rows in a single block. From the users perspective, its the same operation: 1000 rows are deleted.
If two `DELETE` are  not the same speed, we will want enough instrumentation to know _why_ it was not the same 
speed. We may even be willing to sacrifice the average speed of operations, just so outliers have more consistent 
runtimes. If users have to ask: "why?" too many times and come up with blank answers, they will stop using the product. 
And no, "read the source" is not an explanation!
</aside>

Again, we could use caches and the transaction log to amortise this cost and merge writes together when we flush bitmaps 
to disk. This requires careful tracking of the relationship between bitmaps and the disk blocks they represent.

Second, as the number of set bits grow, we are leaving behind more and more "lost storage" that must eventually be 
reclaimed.

#### Combining Strategies
Marking rows with tombstones is tricky business - particularly if you want large `DELETE` operations touching a lot of
different disk blocks to be fast. Often, a combination of strategies is best. For example, the transaction log is very
good at handling changes across many blocks (because we can write all the changes in sequence to the log). We could also
intelligently detect when a transaction log write is optimal (for example, a single row being deleted in one block)
vs when writing data either in-place or to a deletion bitmap is preferred.

But no matter which strategy we use and how we combine them, we are eventually going to end up with "holes" in the table
where the rows used to be. And if those holes don't get cleaned up... Well, its your cloud storage bill...

Which brings us to...

#### Digging up the Dirt
SQL Server calls it "ghost cleanup", MySQL (with InnoDB) calls it "purging", its "Garbage Collection" in Teradata
and Yellowbrick, Postgres calls it "vacuuming". If you are on a Postgres Database - or one of its many clones - 
you will have learned to rightfully fear this operation.

Common to all these names is that they are about cleaning up the mess left behind by `DELETE` operations. At some point, 
something has to pay the price for all those holes on disk and get rid of those tombstones. 

This blog is getting rather long already - but we will get there soon enough.

# `UPDATE` of Rows
We have seen how `INSERT` and `DELETE` operations can be sped up with various transaction log tricks or with clever use
of data structures. At this point, most databases engine realise the truth: "There is no `UPDATE`!"

This:

```postgresql
UPDATE loot
SET weight_kg = 10000
    , item = 'Thor''s Hammer'
WHERE loot_id = 1
```

Is the same as:

```postgresql
BEGIN TRANSACTION
    DELETE FROM loot
    WHERE loot_id = 1;

    INSERT INTO loot (loot_id, item, weight_kg)
    VALUES (1, 'Thor''s Hammer', 10000);
COMMIT;
```

We can optimise this a bit by having the `DELETE` operation mark the row as dead and return the old values in the row 
for the `INSERT` to consume. That allows us to update with a single pass over the data.

## `UPDATE` in place
There are cases where marking an entire row as dead (with a `DELETE`) and then adding a new row (with an `INSERT`) is 
not the optimal strategy for `UPDATE`. For example, if the row is very large, we might not want to copy the entire row 
to a new location if we only change a single column. People who put JSON, XML (\<add your markup language here\>) in 
databases may have experienced this problem.

In such cases, we can sometime benefit from updating the value directly in the disk block, overwriting only the location
of one column with the updated value. 

For column stores, you can often optimise statements like these with in-place updates:

```postgresql
UPDATE loot
SET weight_kg = weight_kg * 1.1
```

Here, we might be able to get away with only reading one column from the table and overwriting just that column, without
having to pay the disk cost of writing to `loot_id` and `item`.

# `MERGE`
You have now see how to `INSERT`, `DELETE` and `UPDATE` rows in a table. I am sure you can figure out how to do `MERGE`
if that is your particular flavour of syntax sugar.

# Summary
Today, our journey took us to large scale DML operations (`INSERT`, `DELETE` and `UPDATE`). We have seen how it is 
possible to have such operation run at disk speed - potentially unlocking write speeds in the multi GB/sec range for
relational database tables (with the right implementation).

I have alluded to the problem of tombstone cleanup - what I like to call "The Swiss Cheese Problem". There is a long
blog to be written about that. But right now, I am going to take a swim in the ocean and enjoy the sun.

For those of you joining me for the first time - you are most welcome. For my regulars - you might want to check out 
the [About Me](/about/index.html) page as I am now taking on Patreon sponsors. If you like what you read, consider
supporting my work. You are in the database industry - so I know you can afford it.

Until next time...