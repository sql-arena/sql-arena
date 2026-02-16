---
title: "Why are Databases so Hard to Make? - Digging up Graves"
date: "2024-10-04"
tags:
  - "database"
  - "se"
  - "transaction-log"
---

In my [last post about high speed DML](high-speed-dml.md), I talked how it is possible to modify tables at the
kind of speeds that a modern SSD can deliver. I sketched an outline of an algorithm that
can easily get us into the >10GB/sec `INSERT` speed range (with an array of SSD). With the right hardware and a low
latency transaction log - we may even reach into the 100GB/sec range for DML. That's without
scaling out to multiple nodes.

But, we also saw that when we `DELETE` or `UPDATE` data, it leaves behind tombstones in the data,
markers that tell us: "This data is dead and no longer visible". I alluded to the problem of cleaning up these data 
graves.

It is time to talk about cleaning up these tombstones. Get your shovels ready - because the
work we are about to do will be unpleasant.

# The Problem

When data is _not_ immutable, any `DELETE` or `UPDATE` operation will leave behind a tombstone. The disk space used to
represent the data is "old bones on disk" - and the data is no longer visible to users. As we change
data, more space leaks in this way. We eventually run out of space or go bankrupt buying more storage
(particular if you pay cloud pricing).

Every query reading data account for tombstones and correctly ignore the death markers. There is a non zero
CPU cost associated with "bypassing" each tombstone this way. This means that `SELECT` queries will slow down over time, even 
though the visible data is not growing. This phenomena is not _explainable_ to users: the data appears to be the same, 
but the system is mysteriously slower.

Eventually, disk blocks will made up mostly by - graveyards for data that once was. The accounting overhead of
managing all those disk blocks then becomes unfeasible. In fact, the metadata needed to keep track of nearly empty disk 
block may eventually be larger than the data itself. As metadata grows to dominate storage, the system will slow to 
a crawl and any attempt at memory buffering of disk blocks becomes futile.

Something has to clean up the graves - and it must do so at the same rate that we generate tombstones.

# Book of the Dead

Recall our mental model of tables from the [previous blog entry](high-speed-dml.md).

- Tables are files on disk
- Rows are offsets into those files

We learned that the transaction log can be used to track _where_ those files are. We also saw that tombstones can be 
implemented as additional files on disk (deletion bitmaps for example) - or stored inside the rows themselves. No matter 
which tombstone representation we use, we can expand our mental model of tables and say:

- Tables are files on disk
- The location of those files are tracked in other files (for example: the transaction log)
- Rows are offsets into those files
- Rows that are invalid are tracked by additional files or offsets on disk

With simple book keeping of these files, I hope it is clear that the following question is easy to
answer:

> Of the space I have allocated to tables, how much of it is dead space?

We can sum up the size of all the tombstones and the rows they represent and compare it to total size of the
table. With a tiny amount of mental effort - we can track this incrementally - on every DML
statement.

## Immediate Tombstone Cleanup - Clean up as we go

The simplest approach to cleaning up tombstones is to do it "immediately", as we generate them:

- When a `DELETE` or `UPDATE` is issued, look at the amount of dead space we are creating in each disk block 
- If the space is above some threshold, clean up the dead in that disk block right away.

But, we are now faced with a problem: The disk block we are currently creating dead space in may now be so small
that the resulting, cleaned up disk block is too small to be useful. For example, let us assume our dead space
threshold is 20% of the target disk block size. If a `DELETE` operation creates 20% dead space in a disk block, it will
immediately rewrite that disk block. But, the resulting disk block is now 80% of the original size - which is not
optimal. As we issue more deletes, the number of disk blocks grows and their average size shrinks. We are back 
in metadata hell.

### Immediate Tombstone Cleanup - with merging

An optimisation should occur to you: When we clean up a disk block, we could "merge" the cleanup
with another disk block that also needs cleaning - resulting in a single disk block that is big enough. We could keep a
list of disk blocks that are "dead enough" that need to be cleaned. When a `DELETE` needs to remove dead 
space - it can then "scavenge" disk blocks from this list.

Lets play with that idea a bit:

- I am on cloud storage and my target disk block size is 100MB
- My `DELETE` operation creates 20% dead space in a 100MB disk block, the resulting disk block, if I cleaned up, would
  be 80MB.
- I look at the list of disk blocks that are "dead enough". And I find the following:
    - 3 disk blocks with: 20MB dead space - 80MB live space
    - 1 disk block: 15MB dead space - 85MB live space
    - 1 disk block: 10MB dead space - 90MB live space
- I have 80MB live space, and I know that the "dead enough" blocks will never have less than 80MB live space
  (because if they had more, they would already have been cleaned up)
- We are looking for 80+\[some more space\] to be divisible by 100. The ideal combination would be another 4, 80MB disk 
  blocks (because: 80*5 = 400 is divisible by 100). But the closest we can get is to take 3 blocks of 8 and 1 block of 85. 
  This will result in 4 disk blocks of 100MB each and one of 105MB (or some other balancing act)

I should hopefully be clear that an algorithm like the above, is a form of "disk space Tetris". Also, remember that
compression increases the complexity of this problem. We might try to merge 5 disk blocks of 80MB each, hoping to write
4*100MB blocks. But if the data was "just wrong enough" we could end 4 disk blocks of 80MB each - resulting in a merge
that leaves 20% dead space in all blocks.

We can modify the algorithm and allow the "dead enough" list to contain disk blocks with more than 20% dead space. 
Having blocks handy with a lot of of dead space gives us more opportunity to create disk blocks closer to the target 
size. But this has a nasty side effect: Remember that we want a database to be _explainable_ to users. If we allow some
disk blocks to be full of dead space - those blocks will take longer to read than the "mostly alive" blocks. If we have 
a have a max tolerance for dead space in _each_ disk block, we would at least have an upper boundary on how slow a read 
operation could be, no matter what block is read.

Merging _does_ mean that a `DELETE` can end up writing significantly more data than what you deleted (because it needs 
to scavenge for blocks to merge). We also have to be very careful with locking as we implement this algorithm. When we
scavenge for disk block - we must make sure the the the merge is atomic. We can't have a `SELECT` operation read from
a disk block that is in the middle of being merged.

When implemented correctly, the "merge and clean up as we go" is one of the most powerful grave digging algorithms. It
is also quite tricky to pull off (particularly the scavenge algorithm and its associated  locking). And unfortunately, 
when something is complex the predictable behaviour of programmers kick in: We will be tempted to take shortcuts!

Someone in the room stands up and says: "Why don't we just do this once a day - when the system is not busy?". And the
room nods in agreement....

## Naive Approach - Closing the Graveyard while we dig

We could schedule a background task to clean up the graves and run this task at some regular interval.

A "full cleanup" of a table has an advantage: It can look at all the disk blocks at once. This allows us to perform an
optimal merge - rewrite what needs to be rewritten - and let the users move on with a system that only has disk 
blocks full of life. We are deferring all the cost of `DELETE` until "later". Hopefully, when the system is not busy. 
There is a small issues: we have to decide _when_ to kick off the background process - and _explain_ its impact to our
users.

The implicit assumption when we schedule cleanup as a background task is: "There _will_ be a time when the system has
the resources to do this". But the system is already slow once the tombstone problem has become noticeable. We could get
lucky and not have too many users accessing the system at this point. But the users we _do_ have, are the ones that
already suffer the slowness from the tombstones.

When the batched, tombstone cleanup runs - it will slow down the system even more. It may also take locks that are
highly disruptive to users (Because taking coarse grained locks is easier to implement than fine grained locks). If the
batch process cannot acquire those locks - for example because users are currently holding locks running queries - 
it will wait... And wait... And while it waits in the queue for the lock - anyone who tries to run a query will 
sometimes (depending on your lock implementation) wait _behind_ the cleanup process. And the system has now ground to a 
halt.

For anyone running Postgres: know that the `VACUUM FULL` process is a classic example of this problem!

Now, the same person who stood up and suggested the "once a day" cleanup, will stand up and say: "Why don't we just
_try_ to take the lock, and if it fails, try again later". That way, we can at least make sure that the cleanup process
doesn't block users. And the room once again nods in agreement... This is what I call "heuristic engineering" and its
a cancer on our industry! Why is this approach also stupid?

If we only _try_ to take a lock - we are not guaranteed to _ever_ clean up the graves. A successful system is a busy
system - and a busy system may never have the opportunity to grant a heavy lock on a table that needs cleaning.

A database being highly available does not mean: "It responds to ping". It means: It responds to queries in a timely
manner. A database that is slow to respond to queries, because it is busy cleaning up, is _not_ highly available. 
Background processes always move to the foreground, unless you are extremely careful.

<aside>
<b>Pissing your pants to stay warm</b>

In Denmark, we have a saying: "Don't piss your pants to stay warm". It means that you should not take a short term
solutions that will cause you long term problems.

The "once a day" cleanup is a classic example of pissing your pants to stay warm. It is a short term solution that
is easy to implement for database developers. But it puts a terrible, long term burden on users and databases
administrators.
</aside>

## Intermezzo - Amortisation
What we have seen so far is a classic example of algorithm amortisation. Modifying data builds up a "debt" in the form
of tombstones. And sooner or later, we have to pay back that debt. The question is: Who carries the burden of that debt?

The naive approach of "once a day" cleanup is an attempt to pay back the debt in one, big installment. The "clean up as
we go" approach is an attempt to pay back the debt in small, incremental installments.

Common to both approaches is that we must pay back as fast as it is generated - over some interval of time. We have to 
pre-allocate resources to service our debt.

Unfortunately, there is no ideal solution to this problem. But, there is a design space we can explore - and most 
databases pick the "once a day" approach because it is easier to implement.

There are two more approaches I would like to examine, briefly for now.

## Periodic, small scale cleanup

Inspired by the "once per day" batch cleanup - we could do a micro cleanup that runs regularly enough 
(typically every few seconds) to keep the space usage in check. The idea is to run a small cleanup process every time 
we have a "gap" in the system. For example, when CPU cores are not fully busy. We will also want this cleanup to be 
small enough to not block users and take lightweight locks. Postgres has made great strides over the years to 
make `VACUUM` less intrusive - some cleanup can now run as a non-intrusive background operation. 

With sufficient control over system resources, it is possible to do a very good job of keeping track of the CPU gaps 
needed to run such a process. SQL Server stands out of one of the better implementations of this algorithm - it calls
the background tombstone cleaner the "[ghost cleanup](https://learn.microsoft.com/en-us/sql/relational-databases/ghost-record-cleanup-process-guide?view=sql-server-ver16)" process.

Apart from consuming resources, the ghost cleanup is minimally intrusive and does not block users

But, as Microsoft states:

> On high-load systems with many deletes, the ghost cleanup process can cause a performance issue from keeping pages 
> in the buffer pool and generating IO

There is no such thing as a free cleanup and every database must reserve enough resources to service the debt.

## Have the `SELECT` queries clean up
Recall that tombstones cause two problems for users:

- They consume additional space
- They slow down queries (via CPU and I/O) that touch disk blocks with lots of tombstones

What if we didn't care much about the space? Space is, after all, pretty cheap. That leaves us with only the second 
problem. It is common, that some disk blocks in a database are infrequently examined. We don't really care about the 
CPU and I/O overhead of tombstones in that type of data. What does it mean to "examine" data? It means that someone 
is actively `SELECT`ing it. `SELECT` statement frequency provide a map of how hot each disk block is.

What if we let the `SELECT` queries clean up the tombstones? We could chose to only clean up
tombstones that are expensive to resolve - or the ones that get resolved frequently. We could use an algorithm similar 
to "Immediate Cleanup with Merge" and reactively run it. We could amortise by adding additional runtime to the 
`SELECT` query which saw that the cleanup needed to happen.

Oracle does not directly do this - but it does piggyback on `SELECT` queries to do clean up work left behind by DML
operations (namely materialising some of the transaction log entries to disk). The process is called 
"[Delayed Block Cleanup](https://www.databasejournal.com/oracle/delayed-block-cleanout-in-oracle)". I am not aware of
any other databases that let `SELECT` queries pay the debt. It may be a design space worth exploring.

# Summary
Today, I have hopefully convinced you that cleaning up tombstones and digging up graves is a hard problem. There is no
optimal design, you have to carefully weigh the tradeoffs. I strongly believe  that most designs, particularly
those used in the open source databases, suffer from being overly simple and too intrusive. Deferring cleanup until 
"later" is easy to implement - but it fails to engage with the complexity of highly available system. Clearly, this is 
not an easy problem to solve.

This post is already too long for the attention span of Millennials (sorry reader, if you are one). But before 
I go, I want to give you an hint of what is coming next.


**Time Travel**

In our cleanup process, we have assumed that we only care about the latest version of the data. The algorithms just 
replaces data that has been tombstoned with clean data - leaving no trace of the tombstone behind. But what if we _do_ 
care about the old, dead data? Many modern database implement the notion of "time travel". You can go back to any data from 
the past and see what it looked like _before_ you deleted it. This is a powerful feature - but it also makes the 
cleanup process a lot harder.

Before we can understand Time Travel - we are going to need a deeper look at Transaction Logs and the wonderful things 
they can do.

Until then - stay curious and keep digging!

