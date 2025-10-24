
## The filter on `l_shipdate`

The `[DELTA]` value is chosen in such a way that nearly all data in the table must be visited to answer the query.

Two things are being tested with this filter:

1) How fast we can actually scan through data and find what we are looking for?
2) How expensive is it to evaluate a filter that does almost nothing?

To achieve high scan speeds, the database must use strong, on disk data structures. Optimally the database engine can
use the full speed of the disk (that's >3GB/sec on a cloud NVMe drive and about the same on your laptop). That,
in turn, requires the database to use many threads to scan in parallel. Lack of parallelism immediately dooms a database
as being too slow to run a query like this. Thus, we can already discard MySQL as not being as serious contender
for this benchmark.

We are only requesting a small subset of the columns in `lineitem` - which means that column stores greatly benefit this
query. Row stores on the other hand, would have to fetch the entire row and the project away everything except a small
fraction of the row - greatly increasing the bytes we must read from disk.

Finally, the filter on `l_shipdate` is removing a tiny fraction of the total rows. That means we are also testing how
fast the database can do "almost no op" filtering (a common use case). Optimally the database will apply the filtering
as early as possible. For example, we can use these optimisations:

1) Have each block of data contain meta information about the min/max values in that block. If the block does not meet
   the criteria, we can skip the block instead of decompressing it.
2) Partition the data on `l_shipdate` to make this "metadata only" skipping even faster
3) Vectorise the filter evaluation

Ad 3) If data is stored in columnar format, it is possible to use vectorised filter speed up the discarding of data not
already eliminated by step 2+3. To understand why, consider the following, row based, data layout on disk with a filter
of `l_shipdate <= 1998-12-02`:

``` 
l_shipdate | l_returnflag
1998-12-01 | R
1998-12-01 | R
1998-12-03 | R
1998-12-01 | A
1998-12-02 | A
1998-12-02 | R
1998-12-04 | A
1998-12-05 | R
```

For a data layout like this, we would have to do this filter:

```python
for i in range(block_row_count):
   row = block_data[i] 
   if row["l_shipdate"] <= "1998-12-02":
      emitRow[] 
```

This requires doing a read of data (`block_data[i]`) and then evaluating the filter condition
(`row["l_shipdate"] <= "1998-12-02"`) for every row in the data block. It turns out that we can actually do better
than that. To understand how, we need a short detour.

## Detour: SIMD
SIMD means "Single Instruction, Multiple Data" - it is a technology that most modern CPUs support. At the CPU level
it is series of instructions (or simulated instructions) that are accessible to compilers or directly to programmers via
[intrinsics](https://en.wikipedia.org/wiki/Intrinsic_function).

If data is laid out sequentially in memory (and by inference on disk), we can use a SIMD `mov` CPU instruction
(`ld` on ARM) to move data directly from memory into a special SIMD CPU register. It is also possible to use SIMD
on non-sequential data, but that is significantly slower.

A SIMD register contains multiple values of the same type, for example, it can hold 8 32-bit integers if you have access
to AVX2 on an Intel/AMD CPU. (1)

Once data is inside a SIMD register, we can use other SIMD instructions to operate on *all* the values in the register
at the same time - in a single instruction (hence: Single Instruction Multiple Data). Think of this like
operating on vectors all the way at the CPU instruction level.

If your data is laid out correctly, SIMD thus allows you to go faster - because you need fewer CPU instructions to do
the same work.

For anyone interested in playing with  SIMD instructions, I highly recommend Agner Fog's Library:

- [Agner Fog - Vector Class Library on GitHub](https://github.com/vectorclass)

*(1) I am aware that this is highly simplified explanation of how these registers work. I hope it is sufficient to
get the point across.*

## Columnar SIMD filtering
Consider a more modern, columnar layout of the data we previously stored as rows:

``` 
l_shipdate   | 1998-12-01 | 1998-12-01 | 1998-12-03 | 1998-12-01 | 1998-12-02 | 1998-12-02 | 1998-12-04 | 1998-12-05 
l_returnflag | R | R | R | A | A |R | A | R
```

Here, we have made sure that the `l_shipdate` value are sequentially laid out in memory. We can assume these dates
can be represented with 32-bit integers.

With an 8 element SIMD register (on an AVX capable CPU for example), we can now do the following:

```python
for i in range(0, block_row_count, 8):   # NOTE: we jump 8 elements at a time
   row: simd_register = simd_mov(block_data, i) 
   is_match: simd_register = simd_lte(row, "1998-12-02")
   emitRow(row, is_match) 
```

Readers who are still paying attention will no doubt notice my hand waving in `emitRow`. How exactly one takes
a vector of matches and turns it into something that can be emitted, is a topic for a later blog post. The exact
implementation of `emitRow` depends on what format you want to emit (ex: Do you want Columnar or Row based
output from the scan?)

What we can see, is that a columnar layout enables a SIMD based filtering - which reduces the number of loop iteration
we do by 8x. This does not directly translate to 8x faster filtering, because we still have to do other work, like
decompressing data and reading from disk. But typically, there is a good speedup to be had here.

## The aggregate of `l_returnflag`, `l_linestatus`
Recall that executing TPC-H queries in parallel, on all CPU cores, is a crucial part of winning this benchmark.

What is the most optimal way to calculate this part of the query:

```sql
GROUP BY l_returnflag,
         l_linestatus
```

Two categories of algorithms are available in computer science for aggregating data

1) Sort / Merge based
2) Hash Based

Variants and optimisations exist for both categories and both have been researched thoroughly for decades.

### Sort/Merge based aggregation
It is possible to aggregate data by first sorting all the data by `l_returnflag`, `l_linestatus` and then doing a loop
over the sorted output to calculate the aggregates. The algorithm is simple to implement, but it has almost
entirely fallen out of fashion. There are three, major reasons for this:

1) Sorting is an **O(n log n)** operation
2) The comparisons between values needed to sort data leads to branch misprediction.
3) It can be tricky to parallelise the sort operation

Ad 1) While **O(n log n)** is not a terrible algorithmic complexity, using hash based aggregation is **O(n)** and thus
faster.

Ad 2) To sort data, we must compare values in the input dataset. Every compare we make is a conditional branch
(i.e. `if`/`else`). Moderns CPUs try to predict the outcome of branches in order to prefetch the code they need to
execute. With more branches and more data diversity we get higher mis-prediction rates.
Once a CPU mis-predicts a branch, it results in a [pipeline stall](https://en.wikipedia.org/wiki/Pipeline_stall).
Such a stall can take hundreds of CPU cycles where the CPU is doing nothing waiting - while it is waiting in this
way it will still report itself as 100% busy.

Ad 3) Multiple CPU cores need to cooperate on sorting data. Typically, this is done by having each CPU work on a small
chunk of the data, sort it, and then merge the sorted chunks together. However, merging ultimately requires CPUs to
coordinate with each other. One CPU will say to the other: "I have these 10 sorted Rows, could you take them
and merge them with your rows, please". Whenever two CPU cores need to coordinate, we need locking - and
locking is always costly and tricky to scale.

### Hash based aggregation
Most modern, analytical database, use hash based aggregation. The naive algorithm is simple:

```python
aggregate = {}
for row in input_data:
    key = (row["l_returnflag"], row["l_linestatus"])
    if key not in aggregate:
        aggregate[key] = {
            "sum_qty": 0,
            "sum_base_price": 0,
            "sum_disc_price": 0,
            "sum_charge": 0,
            "avg_qty": 0,
            "avg_price": 0,
            "avg_disc": 0,
            "count_order": 0
        }
    aggregate[key]["sum_qty"] += row["l_quantity"]
    aggregate[key]["sum_base_price"] += row["l_extendedprice"]
    aggregate[key]["sum_disc_price"] += row["l_extendedprice"] * (1 - row["l_discount"])
    aggregate[key]["sum_charge"] += row["l_extendedprice"] * (1 - row["l_discount"]) * (1 + row["l_tax"])
    # ...etc...
```

Consider what must happen if more than one thread wants to do this at the same time. Two threads cannot write to the
same key/value pair without coordinating. This coordination is done via a lock. As we already discussed, locks cost
CPU cycles and whenever possible, we prefer to avoid them.

#### Concurrent, Low Cardinality Aggregation
The aggregate in TPC-H Query 1 has low cardinality - it is only 6 unique values. This small aggregate is specifically
designed to check for the presence of an optimisation: Thread local aggregation.

In Thread local aggregation, each thread maintains it own hash table and aggregates the data locally. This requires
more memory than using a single, large hash table. However, threads can insert and update their local hash table without
any locking. Once all threads have finished processing their data, the local hash tables are merged into a single
output result.

This thread local algorithm is *significantly* faster than the naive, lock based algorithm. But to pull off the
algorithm we must *only* use it when the expected output cardinality of the aggregate is low. We will meet large
cardinality aggregates in later blog entries and if we used thread local aggregation to solve these, the memory
consumption of the query would skyrocket.

There are two major ways we can wield thread local aggregation:

1) Have the query planner estimate the aggregate output size
2) Dynamically switch algorithm at runtime

Ad 1) In the case of `l_returnflag`, `l_linestatus`, the query planner can easily estimate that the output cannot
exceed 6 rows. All we need to know is how many distinct values are in each column. We can get that distinct values count
with database statistics, for example with [Theta Sketches](https://apache.github.io/datasketches-python/5.0.2/distinct_counting/theta.html)
or with [Hyper Log Log](https://en.wikipedia.org/wiki/HyperLogLog). However, the generic algorithm for estimating output
of aggregates is notoriously tricky - even with very good database statistics. This problem of estimating cardinality
of aggregates is hard to generalise.

Ad 2) Many modern databases, including the Yellowbrick Aggregation Node (I wrote v1 of it), can
dynamically upgrade a thread based aggregation to a global aggregation - if the output size is larger than expected.
The aggregation starts with a thread local aggregation and keeps an eye on the size of the hash table. If the hash
table exceeds a threshold - threads merge their local hash tables into a global aggregate. This allows you to put
an upper boundary on the amount of memory used for thread local aggregation. Note that you can benefit from combining
the two approaches and maintain a small, thread based hash table and only merge periodically. This is particularly
useful if the input dataset contains skewed values: each thread can then merge those skew values into a single
aggregate value before merging. This reduces locking overhead. However, if the thread local aggregate is not beneficial
at all (i.e. it does not lead to fever merges to the global aggregate) - it is an advantage to completely disable thread
based aggregation and just use global aggregation.

Exactly how you lock the global aggregate depends a lot on the implementation. A popular method is to lock a certain
subset of hash buckets. This keeps the number of locks (and the memory you need to hold those locks) at a bounded size.
Combined with skew based local aggregation - this leads to low lock contention.