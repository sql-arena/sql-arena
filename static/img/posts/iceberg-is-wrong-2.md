---
title: "Iceberg, The Right Idea - The Wrong Spec - Part 2 of 2: The Spec"
date: "2025-7-10"
tags:
- "database"
- "iceberg"
- "data-structures"
- "se"
- "transaction-log"
---

Let us finally look at what is so wrong with the Iceberg spec and why this simply isn't a serious attempt at solving
the metadata problem of large Data Lakes.


# Recapping
In the [first part](iceberg-is-wrong-1.md) of this series, I took us back in history to learn some lessons from the past.

I introduced "The Space Management Problem" which databases have to solve:

- Fragmentation of Space
- Granular Concurrency control
- Atomicity across multiple objects
- The impedance mismatch between Row and Files
- Low latency, high throughput access to metadata

I made it clear that I am 100% in favour of open formats across the entire stack. I am particularly excited about using
Parquet as a common storage format for table structured data.

# A Folder with Parquet files is not a Table
Parquet provides us with a self describing, tabular data format. If you squint your eyes: A pile of Parquet files with the
same columnar layout resemble a database table. But a database table is more than a set of rows.

In order to make multiple Parquet files look like a database table, we must provide:

1) A list of all file locations that make up the table
2) Metadata stating what is roughly in each file
3) A transactional control mechanism that allows us to add and remove files from the table and provide
   consistent snapshots of the table as it evolves over time.
4) A way to evolve the schema of the table

Ad 1) If I want to treat a set of Parquet files as a single table, I must have a mechanism to locate the files that 
make up the table.

Ad 2) Each file needs additional metadata to quickly locate interesting rows. For example, we might want to locate all
rows from 2025 without having to decompress every single Parquet file in the table to find those rows.

Ad 3) When I add a new Parquet file to a table, I need a way to signal that this file should be visible to other users. 
Ideally, I will do that in a way that allows us to revert that change (=Time Travel). I must be able to atomically
add or remove files from the table.

Ad 4) Tables changes, and if I add a new column to the table - I don't want to rewrite every single Parquet file the
table is made of. I need a way to keep track of changes to the table schema.

## Footnote: Convention as Configuration
Some Data Lakes use a convention based approach to address the list requirement above.

"If a parquet file is in folder `foo`,  it belongs to table `foo`"

But of course this does not address the other problems. But many Data Lakes have used this convention successfully
to provide the illusion of tables (for example, you can make such a structure in AWS Glue).

Iceberg seeks to provide a more formalised approach.

# The Iceberg Spec
When I talk about the Iceberg spec, I am referring to the [Apache Iceberg Specification](https://iceberg.apache.org/spec/). 
At the time of writing, the spec is in version 3. Version 4 is on the way. But nothing I will say here depends on
what version of the spec we are talking about.

To understand what is wrong with the spec, we must look at the file formats and data structures it describes. Let's
start with the easy bit: Listing where things are.

As you read on, you will no doubt ask yourself: "Surely, this cannot be true?". I have provided references directly
to the spec so you can check for yourself. I sincerely hope I have misunderstood at least part of the spec - but I have
read it several times and I am not sure I have.

## Manifest Files and Manifest Lists
When a client of Iceberg wants to add data to a table, it must first go through this process:

1) Write one or more Parquet files to some location (e.g. S3)
2) Write a Manifest file pointing at the files in step 1
3) Write a new Manifest List

Both Manifest files and Manifest Lists are in AVRO format, which means they are compressed and self-describing. It also
means that the overhead of each file is large (in the order of 1KB).

### Manifest File Content
Reference: [Manifest Files](https://iceberg.apache.org/spec/#manifests)

The Manifest File contains pointers to the Parquet files - with their full path. It also contains metadata about each
column in the Parquet file. Recall that AVRO is a row based format which also allows nested structures. It is also a 
binary format, so I will use a JSON representation to visualise it for you (just remember, it is not stored like this):

Here is a sample Manifest file for a table with this schema:

Table:

```sql
CREATE TABLE foo (
    col1 INT,
    col2 VARCHAR
)
```

Manifest for new data, I have abbreviated this a bit:

```json
{
  "manifest_schema": {/* Avro schema for manifest entries */},
  "entries": [
      {
        "status": 1, // = Adding new data 
        "snapshot_id": null, // More about this later!
        "data_file": {
          "content": 0, // = DATA
          "file_path": "S3://bucket/foo_0001.parquet",
          "file_format": "PARQUET",
          "record_count": 10000,
          "file_size_in_bytes": 200000,
          "column_sizes": [{"col1": 1, "col2": 40} ],
          "value_counts": [{"col1": 1, "col2": 20} ],
          "null_value_counts": [{"col1": 1, "col2": 0} ],
          "lower_bounds": [{"col1": 1, "col2": "4222"} ],
          "upper_bounds": [{"col1": 16, "col2": "zzz"} ],
          "sort_order": 1
        }
      },
     {
        "status": 1, // = Adding new data 
        "snapshot_id": null,
        "data_file": {
           "content": 0, // = DATA
           "file_path": "S3://bucket/foo_0002.parquet",
           "file_format": "PARQUET",
           "record_count": 10032,
           "file_size_in_bytes": 210123,
           "column_sizes": [{"col1": 1, "col2": 40} ],
           "value_counts": [{"col1": 1, "col2": 20} ],
           "null_value_counts": [{"col1": 1, "col2": 0} ],
           "lower_bounds": [{"col1": 2, "col2": "4222"} ],
           "upper_bounds": [{"col1": 17, "col2": "zzz"} ],
           "sort_order": 1
        }
     },
     
  ]
}
```
Obviously, all these key string are not stored in the file - only the values are physically written. However, you will
notice that even with the value field, there is a *lot* of repetition going on. Remember, everytime a client wants 
to add data to a table, it must write one of these files. And while the file itself is compressible - we cannot compress 
*across* files. 

Observation: Storing metadata this way makes it a *lot* larger than necessary. For example, 
we cannot benefit from using [Huffman Codes](https://en.wikipedia.org/wiki/Huffman_coding) and other compression 
mechanisms to reduce metadata sizes by recognising common string values across files.

Iceberg has, so to speak, built metadata bloat into the spec.

### Manifest Lists Content
Reference: [Manifest Lists](https://iceberg.apache.org/spec/#manifest-lists)

To understand why Manifest Lists exist - recall that we need this to turn Parquet files into tables:

   "A transactional control mechanism that allows us to add and remove files from the table and provide
   consistent snapshots of the table as it evolves over time."

The Manifest List contains pointers to all the Manifest files that make up the table - for THAT 
particular snapshot of the table. If a client wants to add a new Parquet file to the table, it must write a
new Manifest List file too. And that file must contain a pointer to *all* the Manifest files that make up the table.

Let me repeat that, just to make sure it really sinks in: A client that wants to add rows to an Iceberg table
must write a file containing pointers to *all* Manifest Files that makes up the *entire* table.

To quote the spec (my emphasis):

> A new manifest list is written for each **attempt** to commit a snapshot because the list of manifests always changes 
> to produce a new snapshot. When a manifest list is written, the (optimistic) sequence number of the snapshot is 
> written for all new Manifest Files tracked by the list.

If a client fails to commit - it must read the latest snapshot, create a new Manifest File and try again. Of course,
it can read the last Manifest **List**, it does not need to read the new Manifest **Files**.

The manifest list contains a field called `addded_snapshot_id`. This is the snapshot the manifest represents and
all the Manifest Files it points at inherit that value (that is why you can put `null` in the `snapshot_id` field of the
Manifest File)

The Manifest File also contains an aggregate of the Parquet level metadata. We shall soon see why that is nearly pointless.

### Putting the burden on the client
We are now observing a pattern that is repeated throughout the Iceberg spec: The client is burdened with an extraordinary
amount of bookkeeping - just to make simple changes.

We are also faced with the question: What happens if the client gets some of this wrong? Must the commit of a new 
snapshot meticulously check that all the manifest data is written correctly? What's the protocol for dealing with 
exceptions where the manifest were somehow corrupted?

### Row Security is fundamentally broken 
Even in loosely regulated countries like the US - we often require row level security to protect sensitive data. In 
an EU context - where we have laws like GDPR, we must be extra sensitive about who can see what data.

We want clients to add data to tables - but we may not want them to *see* all the data that is already in that table.
If clients need to write manifest lists that point at all Manifest Files - we have already leaked the location of
every single S3 file worth stealing.

Considering how valuable Data Lake information is - we should wonder why the spec does not deal with security as first
priority.

## Metadata Files
Reference: [Table Metadata](https://iceberg.apache.org/spec/?h=metadata#table-metadata-and-snapshots)

Once a client has written its Parquet file, generated the corresponding Manifest File, read the existing Manifest List and
created an new Manifest List - it must now commit its data.

Commiting is done by writing a metadata file (called `<prefix>.metadata.json`). Why this is JSON and not AVRO like
the other files is anyone's guess. This is the kind of "design by committee" feel you get throughout the Iceberg spec.

The metadata files has several fields with the usual amount of repetition of information we have now gotten used
to from Iceberg.

It also has these:

- `current-snapshot-id`: The ID of the current snapshot. This is the ID of the most recent snapshot in the list below. 
  It is the data a client will see if it is not time travelling in the data.
- `snapshots` - A list of snapshots, each of these point to a Manifest List file and has some additional metadata, 
  including the schema of the table (more repetition of data). The snapshot also contains the `snapshot-id` which
  is what `current-snapshot-id` points to.

In other words, the Metadata file that the client must write, lists every snapshot that has ever existed of the table.

These files are relatively small, it's metadata after all. But because we are constantly repeating the same information,
over.... and ... over ... again... we are looking at a massive bloat in space. This will become important when we cache it.

### Footnote: Faking O(1)

Its also worth noting that any writing must basically repeat the metadata of every previous write. The spec states
as a [design goal](https://iceberg.apache.org/docs/1.6.0/reliability/?h=o%281%29):

> O(1) RPCs to plan: Instead of listing O(n) directories in a table to plan a job, 
> reading a snapshot requires O(1) RPC calls

Which indicates that the designers at least know what O-notation is. But to then proceed to write a spec that requires
every write to repeat the metadata of every previous write? Did we not learn in CS 101 that if you need O(n) operations
to append to a list, you are probably doing something wrong?

## Actually Committing
The client is now ready to commit. It has:

- Some Parquet files already written to an Object Store
- A Manifest file that points to those Parquet files
- A Manifest List that points to all Manifest Files in the table
- A Metadata file that points to the Manifest List and contains the desired new snapshot as well as all previous 
  snapshots that exist in the table.

We now have the "atomicity problem" that database solve so well. We need to make the new Metadata file available
as the latest file - and have it atomically swap out the previous Metadata file.

What happens next is so bizarre that I just have to quote it verbatim [from the spec](https://iceberg.apache.org/spec/#metastore-tables):

>
> To commit a new metadata version, `V+1`, the writer performs the following steps:
>
>    1. Create a new table metadata file based on the current metadata.
>    2. Write the new table metadata to a unique file: `<V+1>-<random-uuid>.metadata.json`.
>    3. Request that the metastore swap the table’s metadata pointer from the location of V to the location of `V+1`.
> 
>        -  If the swap succeeds, the commit succeeded. `V` was still the latest metadata version and the metadata file 
>        for `V+1` is now the current metadata.
>        -  If the swap fails, another writer has already created `V+1`. The current writer goes back to step 1.

The *client*, if it races with another client, is responsible for re-reading the metadata file that beat it (including
the Manifest List) and then re-creating the Manifest List and Metadata file - only to try again!

What kind of protocol is this? From previous fights on LinkedIn - it is apparently believed by some members of
the data community that this is somehow a "more scalable" way of doing things. Because it does not require a lock...
 
### Optimistic Concurrency - Why it does not work!
Let us establish a few facts about concurrency:

If you are not expecting to contend on a resource, it does not matter what kind of concurrency you use - because
you will, a priori, not have to worry about contending.

If you are expecting two clients to change the same value, you should use a locking mechanism to ensure that
the clients queue up to make changes, and that you order the writes on the server (and let clients wait).

A locking mechanism should only lock the thing that is being changed. This means that if two clients wants to
change two different, unrelated things - they should not block each other.

If a resource can be changed without requiring coordination between clients, you should not use a lock at all. 

Given all that - is there *ever* a point to optimistic concurrency control? Since Oracle and Postgres both uses 
optimistic concurrency for some operations we should probably assume there *is* a point of it. What is it?

Optimistic concurrency control is great when the conflict created by two writers can mostly be resolved *by the server 
receiving the write requests*. This is why inserting rows to a table in a database does not block other inserters - 
because two inserts running concurrently can always be resolved by the database server - even if they operated on
two different snapshots. (there is an exception to this rule, namely if two inserts try to insert the same value in a 
key column).

If you are expecting conflicts that cannot be resolved by the server, then you should use pessimistic concurrency control.
For example, if you often update the same row in a table from multiple writers - you are better off having client
lock the row, and have competing clients wait for that lock to release. 

In Iceberg, two concurrent writes to a table will ALWAYS be in conflict - because that is the way the spec is designed.

Let that sink in: The spec uses the WORST possible locking semantic for the metadata of a table. There should be no
need to coordinate between writers if all we wanted to do was append data. Yet, because every write must repeat all
the metadata that is already written - we introduce contention where none is needed.

### The upper boundary of Iceberg Writing
Again, I have to [quote from the spec](https://iceberg.apache.org/docs/latest/performance/) because you wouldn't believe 
me if I didn't:

> Iceberg is designed for huge tables and is used in production where a single table can contain tens
> of petabytes of data.

Once again, I repeat that which is so trivial it should not need repeating: "Tables grow large by being written to,
they grow really large by being written to frequently".

By centralising the metadata for a table in a single file (the `metadata.json`)- we have created a single point of 
contention for all writes to that table. Almost like a transaction log - but less efficient.

We have also forced clients to retry if they fail to write. And on every retry, clients must read the data the 
previous client wrote, re-create the Manifest List and Metadata file. That means the that clients failing to 
commit must take at least 2 read round trips to the server before they can try again (to read what the previous
client committed). Under contention, just like in a pessimstic concurrency, one client can always commit - namely 
the one who wins the race. Unlike in pessimistic concurrency, we *cannot* merge commits from multiple clients into 
single operations (the way transaction logs do). The number of commits that can be done with this naive concurrency
is limited by the time it takes to atomically swap the metadata file. 

The spec states:

> The atomic swap needed to commit new versions of table metadata can be implemented by storing a pointer in a metastore 
> or database that is updated with a check-and-put operation

What? Did we just go through all this effort to avoid using a database, simulating row writes with AVRO files. Only to 
realise we *need* a database after all just to do the atomic swap?

Databases, I know something about that. Iceberg is designed for the cloud. If we are generous, a client can
reach the database and ask for the atomic swap in about 1ms. That means the maximum number of metadata swaps we can do
is 1000 metadata swaps/sec (per table). And that is a VERY optimistic value - the actual value is more likely 10x lower
than that. The service that has to handle these swaps also have to deal with the storm of retries while doing so. We are
here assuming that the service trusts the client to write a well-formed metadata file and that it does not have to 
validate that to be the case.

Clients who don't win the race requires a few network round trips AND a bit of file writing (latency 20ms) before
they can try agaiun. By the time we are ready to retry, another client may have beaten us to it. In fact, 
unlike the pessimistic locking scenarios, we are *not* guaranteed that a specific client makes progress. We may end 
up with starved writers and stalled clients. This phenomenon is already, predictably, being observed by Iceberg users.

Did I mention that 1000 commits/sec is a pathetic number if you are appending rows to table? A simple transaction log 
implementation is capable of at least 100x that.

## Cross Table Transactions
If you are going to be serious about making a Data Lake transactionally consistent - and you want snapshots that
allow you to travel back in time, the you need to support cross table transactions.

But... Alas... Iceberg has no such thing and interestingly barely mentions this big omission in the spec. The 
best you can get is this from the [Java API Documentation](https://iceberg.apache.org/docs/1.9.1/api/#transactions)

> "Transactions are used to commit multiple table changes in a single atomic operation"

Not "changes to multiple tables", but "multiple table changes".

## Locating table metadata files - Maybe we need a database after all?
Reference: [Overview of Iceberg](https://iceberg.apache.org/spec/#goals)

We know that an Iceberg table snapshot is fully described by the `metadata.json` file. But you might be wondering:
how do I locate the `metadata.json` file in the first place?

Again, the spec is suspiciously vague about this. But if we look at the illustration in the link above, we can see
a component called an "Iceberg Catalog". Not an "Iceberg Database" - because that would mean using the D-word.

That catalog is responsible for locating the current `metadata.json` file and doing the atomic swaps. It's a database,
a very simple database, but nevertheless a database. 

# Intermezzo: Iceberg REALLY does not want to be a database
What have seen so far? Iceberg goes to great length to specify a metadata format that can be stored purely in files.

Yet, to make it all come together, we still need a database - though by some sleight of hand it is called a "catalog".

Recall from the [previous post](iceberg-is-wrong-1.md) that filesystem have a natural impedance mismatch with rows
in a database. When we append data to an Iceberg table, we are essentially writing a new row to the metadata. First,
by writing a Manifest file, then copying the previous manifest list and rewriting it. Finally, we then replace
the `metadata.json` file. And this begs the question: "Why didn't we just use a database to begin with and do a 
good, old-fashioned `INSERT` statement?"

## Argument: Because it doesn't scale!
In this Cloud Era - there is real suspicion of database engines. This goes all the way back to the 1990s where
few databases could scale out, and you could hit a scale ceiling if you scaled up (because you couldn't buy a 196 core
server back then).

First, the scale ceiling is VERY high these days - even if you don't scale out. A modern database is well capable
of hundreds of thousands of writes per second. And if you scale out, you can get to millions of writes per second or
more. Today's databases, even the open source ones, are good at scaling.

Second, what is actually more scalable when you want to add data to your Data Lake: 

1) Appending a single row to some database holding your metadata
2) Writing a Manifest file, copying the previous manifest list, writing a new manifest list and then
   atomically swapping out the metadata file via HTTP round trips?

How is that even a question? What is the overhead of option 2? 100x? Maybe 1000x? 

Third, as we already talked about in the previous blog post - metadata is very small compared to the data itself.
We can handle gigantic Data Lakes with very little metadata. Unless, of course, you use the bloated Iceberg 
format to store it.

The "poor man's database" implementation of AVRO files and retrying writes that Iceberg seems so obsessed about -
is anti-scalable.

## Argument: Because file systems are open and database are not!
This argument is a bit more nuanced. It is true that once you have something in a file, you can in principle just
read that file. Of course, you can't actually read Iceberg files with a text editor, because they are in AVRO format.

You need to decode the AVRO, then read it. You also need complicated clients that understand this convoluted spec
to actually change data or make any use of it. This isn't vendor lock it - it's complexity lock in.

How is this *any* different from executing a SQL statement against a database? Is storing files in Object Storage
run by cloud vendors more "open" than putting metadata in an open source database like PostgreSQL? Do you have *more*
choice of vendors when it comes to Object Stores than you do with databases? Obviously not!

## Argument: Because Standards Matter
As stated in the first section of this blog series - I agree that standards matter - they save us a lot of effort. 

But standard formats need to be useful - they need to meet the requirements of the problem domain. And Iceberg does
none of that.

First, there is no good way to secure the data inside your Iceberg. For that, you need a wrapper around Iceberg - for
example AWS Lakehouse Formation (welcome back to lock-in). 

Second, the Iceberg spec standardised all the easy bits - it does not deal with the hard problems of fragmentation
and proper concurrency control. Nor does it deal with cross table transactions. This leaves a space for other vendors
to create addon products that help you do this - just to make Iceberg useful. These standards will be subtly different,
because that is what vendors do to lock you in. The vendors will also charge you for the privilege of delivering a 
service the spec should have handled in the first place.

## Grounding ourselves after the Intermezzo
If you feel passionate about our industry, it is hard to resist a visceral reaction to the Iceberg spec. Before 
I fuel your anger even more, let me remind you of an infamous quote:

> "Never attribute to malice that which is adequately explained by stupidity"
> 
> - Robert J. Hanlon

With that in mind we can maintain our composure. You think you have seen the worst yet? We're just getting started.

# Fragmentation and Metadata Bloat
Recall that the `metadata.json` file pointed at by the Iceberg Catalog (i.e. Database) is the latest snapshot of the 
data. Each metadata file also contains reverse pointers to all previous snapshots. 

You might be wondering: Doesn't that imply that metadata keeps growing? And yes, it does. This is extra
problematic if you have a workload where you constantly trickle data into the Data Lake. 

For example, let us say you micro batch 10000 rows every second and that you have 100 clients doing that. This 
data could come from a Kafka queue or perhaps some web servers streaming in logs. This is a very common workload
and the kind of pattern you need for big data and Data Lakes to make sense in the first place (if not, why
didn't you just run a single PostgreSQL on a small EC2 instance?).

You are now generating 100 new Manifest files every second. Each Manifest file is at least 1KB (because AVRO overhead)
and you also need to generate a Manifest List to commit. And remember, that list grows by 100 items every second - and
cumulatively so. *Every* transaction must copy those lists to create the next commit.

I am going to be generous and assume you only do this 12 hours per day. You are now generating 100 * 60 * 60 * 12 
= 4.3M Manifest files per day. And that takes up at least 4.3GB of metadata space per day. Does that sound like a
good idea to you?

You will need to clean this up. And the way you do this is by merging historical snapshots into a new snapshot. You
merge the Parquet files into bigger Parquet files as a background task. Then you merge the Manifests, and finally you
commit the merge of the table by creating a new snapshot.

Iceberg has methods to remove old snapshots - but someone now needs to issue delete HTTP request to all those metadata
files. Did I forget to mention that HTTP requests against S3 cost money in AWS? Not a lot, but that adds up real
fast when you store data like this.

The clean-up process is also a transaction, which means it must race with the clients that are continuously committing
to the table. Recall that there is no guarantee of progress for individual clients (including the cleanup task) - 
because we are using optimistic concurrency.

In v2 of the Iceberg spec - you can at least have a Manifest List that overrides the `snapshot-id` of
the files it points to. In principle at least - that means you can still travel to the old snapshots even after 
they are merged.

Well-designed database engines continuously clean up metadata and remove fragmentation. The reason they do this continuously is
that it allows us to make guarantees about the performance. With Iceberg Metadata merging, we are not
even guaranteed that our metadata merge makes progress on commits. At any point in time
the amount of metadata files we have in the latest snapshot can vary wildly - even though the table size does not. 
... So much for O(1).

# Reading data and Skipping
Recall that Manifest Files contain metadata about the Parquet files they point to. Manifest Lists contain
aggregate values of that metadata.

Like I mentioned in the first part of the series, object stores suck. Reading from them is expensive and slow. 
We want to skip past Parquet files we are not interested in - the cheapest read is one you don't need to do.

Consider the following example

We have these Parquet files

| File             | Min Year | Max Year | Size  | 
|------------------|----------|----------|-------|
| foo_0001.parquet | 2021     | 2023     | 200MB |
| foo_0002.parquet | 2019     | 2020     | 100MB |
| foo_0003.parquet | 2017     | 2019     | 200MB |

This will result in a Manifest File that looks like this:

`manifest_0001.avro`

| file_path                | lower_bound | upper_bound | file_size_in_bytes | 
|--------------------------|-------------|-------------|--------------------|
| S3:/.../foo_0001.parquet | 2021        | 2023        | 200MB              |
| S3:/.../foo_0002.parquet | 2019        | 2020        | 100MB              |
| S3:/.../foo_0003.parquet | 2017        | 2019        | 200MB              |

And we will have a Manifest List like this:

`manifest_list_0001.avro`

| Manifest File      | Min Year | Max Year |
|--------------------|----------|----------|
| manifest_0001.avro | 2017     | 2023     |

If I now issue this query:

```sql
SELECT SUM(some_value) FROM foo WHERE year = 2020
```
What must I read? If we only read the Manifest List (remember, there is *one* of these for the snapshot) we know that
the data we are looking for is pointed to by `manifest_0001.avro`. But we don't know which Parquet files. For that, 
we must read `manifest_0001.avro`. Once we have read it we can conclude that we only need to read one parquet 
file: `foo_0002.parquet`

We need two reads to plan the query that issues a single read. Those two reads  have to be executed in sequence. 
An S3 read takes around 5ms when the stars align. So just planning the query takes 10ms. In that time, a regular 
database could have read and returned the data.

What happens when the metadata is fragmented and grows? For every entry in the manifest list, we have to travel a 
layer of indirection. Because we are typically operating on object stores, we must also be careful not to issue too
many HTTP requests for Manifest Files at the same time. Just getting access to the metadata for a table now becomes 
tricky for the client. And we can't assume (as is the goal of the Iceberg spec) that this can be done in O(1) RPC
requests.

Of course, we are really screwed if someone does this:

```sql
SELECT SUM(some_value) FROM foo
```
To find all data, we now need to:

1) Read the Manifest List to find all Manifest Files
2) Read every Manifest File (we generate 4.3M of those every day)
3) Read every parquet file (goodness knows how many of those we have now)

Good luck with that set of HTTP requests! Several minutes later, we still haven't started executing - we are still
just trying to figure out what data we have in the table. Of course, we can stream this and read a little at a time,
overlaying the metadata requests with the data requests. This is non-trivial to get right - again moving complexity
to the client. But I am sure there are vendors you can pay for this. Isn't it wonderful that you data is no
longer trapped in a vendor specific storage format but that you now need superhuman skills to read it?

We don't even need to scan the table to incur this penalty. How do you think we will handle statistics if all that
metadata is fragmented all over the Manifests?

## But, but - what about caching?
Of course, we can cache Manifests. Just remember, they are a lot larger than they would have been if we just
used a database.

There is this other problem with caches: How do you make sure they are up-to-date?

We can always poll (=not scalable) the Iceberg ~~Catalog~~Database and see if the `manifest.json` file has changed.
If it has - we just need to ask for the delta of Manifest Files we don't yet have. Of course, this requires us to
read the Manifest List and ~~compare~~join it with the manifest list we already, to find the difference. 

Once we decide to merge metadata, we must also invalidate the cache entries that are no longer valid. 
And 12 hours after that - we have another 4 million files we need to pull into the cache. And the story repeats itself. 
Did I mentioned that we need to do that on *every* client that is using the Data Lake? Which means every one of them
must do millions of HTTP requests. I'm sure there is a vendor who will do that for you - and that isn't lock-in....
Is it?

## Is this Malice?
I don't think Iceberg or its creators are malicious. 

But I will point this out: If you set out to create a table format which locks people into cloud vendors, creates a large
market for addon products and makes it nearly impossible to move away from that format - you would have created Iceberg.

On the other hand - if you are one of those people who just can't stand databases and therefore never took the time to 
learn how they work - you might also have created Iceberg.

Right now, an undergrowth of vendors are building products that help you use Iceberg. A new market is emerging just 
to give you a functional database. A database that does exactly what your old database can  already do - but on top of 
this new format, with worse performance. There is an enormous amount of lobbying going on for this to be the standard. 
The ones who stand to benefit the most - are the cloud vendors. Draw your own conclusions.

# DuckLake
I am not the only person to observe that Iceberg isn't a serious spec. DuckDB recently 
[announced DuckLake](https://duckdb.org/2025/05/27/ducklake.html) - a SQL based Data Lake metadata format.

DuckLake embraces being a database, it does not try hard *not* to be. Instead of opening the file format, 
Duck are opening the table schema and the queries needed to operate on the data.

I am fan of this idea - it allows us to keep our data files in the open Parquet format (which is, after all
good enough) and still access the metadata of those files at speed and with elegance. 

## Why DuckLake Won't Win
I hope the battle for Data Lake metadata is still raging. I think DuckLake is the most serious attempt so far - at 
least in the open format space. Of course, there is Unity from Databricks. It is a closed format,
but relatively easy to integrate with - at least if you just want to read tables.

But DuckLake is not going to win - because they don't have a name that sounds like it's from a cold climate. If only
it was called PenguinLake or PolarBearLake - they would have a chance. Maybe there are some arctic ducks they can 
use to rename it?

No, seriously - there *is* another problem with DuckLake.

I have been building databases, database engines and writing SQL for over 35 years now. I can reliably beat most
query optimisers (on multiple platforms) with handcrafted query plans. I have learned many lessons, but there is 
one thing that stands out:

- "You must be born with a special gene sequence to appreciate databases and learn how to wield SQL"

You think I am kidding again? I am dead serious! A significant fraction of practitioners in our industry
can't learn SQL. They shy away from anything that smells like a database - the D-word! 
Relational algebra scares them! They will write long, clunky Python programs to join data on clients. They will use an
ORM to avoid writing a SQL statement. They will say that "joins are slow" because they never learned what an index is.
They will put everything in one, very wide table - because that is the only way way they can understand data.
This is why we keep repeating disasters and waste talent and money in our industry. I suspect a similar 
gene exists for grokking functional programming - which is why we aren't all writing applications in F#.

To name a few, pointless things created by those who lack the necessary gene sequence:

- ORMs - Trying *very* hard to make you *not* learn SQL only to introduce more complexity
- Pandas and all other forms of client DataFrame libraries
- HADOOP - particularly the MapReduce part
- Key/Value stores
- MongoDB
- XML/JSON/(insert random data exchange format here) "databases"
- NoSQL in all its forms
- SQL Alchemy - turning lead (Python) into gold (SQL) 
- Every ETL pipeline tool that tries to do data movement without using SQL

Our industry *insists* on not learning from the past. Every 10 years, our collective memory is wiped clean and we 
relearn why database were a good idea in the first place. I have seen this cycle repeat itself at least 3 times. 

And that, is why DuckLake will not win. There are very few of us left, the ones familiar with SQL, the ones who don't 
fear it. At the very mention of the word "SQL", the majority of programmers will be running for the hills. Let's have 
optimistic concurrency on AVRO files instead - because any pain, no matter how large, is better than learning SQL. Even
if it means reinventing a database to avoid using one.

This time, I hope I am wrong...

# Summary
Today, I delivered the rant I promised you in the first part of this series. 

If I did well, I have convinced you that Iceberg - in its current form - is not a serious spec for Data Lake 
metadata and that we need to stop treating it as such. 

Iceberg suffers from many problems, it:

- Uses O(n) operations to add new metadata to an existing table - where it should have used O(1) or O(log(n))
- Cannot handle cross table commits
- Relies on file formats that are bloated and ineffective
- Tries to be a "file only" format, but still needs a database to operate
- Does not handle fragmentation and metadata bloat and remains silent about the real complexities of that problem 
- Does not handle row level security or security at all for that matter
- Fundamentally does not scale - because it uses a bad, optimistic concurrency model
- Is entirely unfit for trickle feeding of data - a hallmark feature of large Data Lakes 
- Moves an extraordinary amount of complexity (and trust) to the client talking to it
- Makes proper caching and query planning (the hallmarks of good analytics) very difficult, if not impossible
- Has all the hallmarks of something being designed by committee, completely lacking elegance

And with this, I leave you with a question: "Why do we, as IT craftsmen, allow this to happen to our industry?"

Pitchforks and angry commentary welcome on LinkedIn.
