---
title: "Why are Databases so Hard to Make? - CPU usage"
date: "2024-06-09"
tags: 
  - "performance"
  - "database"
---

In our previous blogs, we have visited the idea that "databases are just loops". At this point, my dear readers may rightfully ask: "if those database are indeed just loops - why is it they are so hard to make?" "Why have we not nailed databases once and for all?" The answer is complicated - but I want to take a stab at it.

Today, we look at the CPU usage of databases - delving deeper into what those loops actually look like. We will see how you use "just loops" thinking to make predictions about what database you want to deploy. You will learn how to sanity existing database platforms - to cut through all the bullshit in the market.

# Making Loops faster

When you want to execute a SQL query faster, you can:

1) Use the the best possible data structure
2) Make the loops faster on the CPU they run on
3) Use multiple CPU cores to parallelise the loops.
    - Typically, we call this "Scaling up"
4) Use multiple machines (or Pods, if you are a Docker person) to create distributed execution of the query
    - We will call this "scaling out"

A lot of databases, including Postgres and MySQL, use single threaded execution to run queries. One query, one thread. Yes, I know Postgres is getting better in this area and some things are now multi threaded. Improving single threaded execution is about optimising 1+2 above. A lot or performance can be gained by being clever about these two steps. They are also the simplest steps to understand.

## Using Good Data Structures

Let us go back to the query we saw at the very beginning of this journey: (see [Databases are just Loops under the Hood – Part 1: Joins](https://database-doctor.com/?p=85))

```postgresql
SELECT x, y
FROM a
INNER JOIN b ON a.x = b.y
```

Recall that we could express the query as this Python loop:

```python
a: list[Row] = [<some rows>]
b: list[Row] = [<some other rows>]
output: list[Row] = []
for a_row in a:
  for b_row in b:
    if a_row.x == b_row.y:
      output.append(Row(x=a_row,x, y=b_row.y)
```

It is time to think like a computer scientist!

You realise that the above execution is of time complexity O(|a| \* |b|). This is obviously brain dead! A simple improvement is to turn `b` into a dictionary. We can rewrite to:

```python
a: list[Row] = [<some rows>]
b: list[Row] = [<some other rows>]
b_hash = {r.b, r for r in b}
output: list[Row] = []
for a_row in a:
  if a in b_hash  
      output.append(Row(x=a_row,x, y=b_hash[x].y)
```

What we have here, is a "hash join access method" (see: [Databases are just Loops – Part 2: GROUP BY](https://database-doctor.com/?p=97)).

Building a dictionary (= hash table) over the rows in `b` turns the algorithm from time complexity **O(|a| \* |b|)** into time complexity **O(\[a| + |b|)**. For non trivial size of `b` , we will gain orders of magnitude faster execution with just this trick. In other words: Having Hash Joins available in your database is a big deal.

There were database in history who did not have hash joins (for example, older version of MySQL). For those databases, you needed to be extra careful with your indexes. If Hash Join is not available, your only other options become loop join and merge join - both are very expensive (they have their uses, which is a subject for another blog entry)

**Takeaway so far:** Be a proper computer scientist and pick smart data structures.

In the rest of this blog entry, we will use hash joins as our sample use case. I picked those because they are crucial to nearly every modern databases. They are also easy to understand for most programmers - we have all used hash tables before. Hash joins are the fastest joins available to us when we want to perform a lot of join operations in a single query. We will use a specific way of thinking in the next sections to reason about the hash join. This way of thinking can be also be applied to other database operations.

## Single Threaded Execution

I would like you to focus on the join loop above and ask yourself two questions:

- How could I make this loop any faster?
- How many iterations of this loop could I do every second on a single CPU core?

Look again:

```python
for a_row in a:
  if a in b_hash  
      output.append(Row(x=a_row,x, y=b_hash[x].y)
```

You might now be thinking something like: "I have no idea" or "How can I possibly answer that question unless I run it on an actual machine?" or the very worst, the willfully ignorant: "There is no answer to this question - it depends".

If so, you may at this point in your career only have spent coding time in Python, Java, JavaScript, R or another high level language. Maybe you are even an architect or designer telling other people how to build big computer systems! Maybe you didn't think much about these subjects - because modern programming languages allow you to get work done, make money and not think about these things. If you are that person and still reading this: now is a good time to wake up an learn how a modern computer actually works. Because we are about to see just how incredible modern hardware is - if you can wield it.

I am going to introduce you to a way of thinking that database engine developers learn very quickly: Putting boundaries on things.

Let us start with an overly optimistic, upper boundary. How fast could this loop _possibly_ go under optimal conditions?

We can make some pretty strong assumptions about the physical world we live in (that wont change every year "because IT moves so fast" and all the similar lies they told you):

- A modern CPU will run at around 4-5GHz (that is 4-5B CPU cycles/sec)
    - This is unlikely to change much (because it hasn't changed in about 10 years and quantum computing isn't going to help us out in this case)
- In a perfect world, looping over `a_row` is an array - the simplest possible data structure.
- To find something in a hash table requires us to calculate a hash value (of `a.x`).
- To put something in the list `output` we must write to memory

A modern CPU will use pipelining of instructions - which means it can execute _more_ than one CPU instruction per cycle. Keep that in mind - but pretend for a moment that a CPU can run around 1 instruction/cycle. What can we now say about the upper boundary of the loop above?

What must happen?

- We must read the next value of `a` from `a_row`.
    - That is a read from memory in a beautiful, sequentially laid our array. CPUs can do prefetching on that stuff
    - Generously: 1 CPU instruction, might be more depending on cache state.
- We must calculate a hash of `a.x` to look into `b_hash`.
    - Even with very good hashes, we need one multiply (3 instructions), a shift (1 more instruction) and an xor (1 more). We operate on 4-8 bytes.
    - This is assuming a highly specialised hash function just for the integer.
    - Readers interested in digging deeper can look at xxHash - at the time of writing one of the fastest hash algorithms (see: [GitHub - Cyan4973/xxHash: Extremely fast non-cryptographic hash algorithm](https://github.com/Cyan4973/xxHash))
    - Lets be really nice and say 5 CPU cycles with a carefully crafted hash joining on an integer.
- We must locate the `b.y` key in `hash_b` which matches the look key `a.x`.
    - This requires a memory read, and we don't know where in memory that read is coming from before we calculate the hash value.
    - If we are _very_ generous we can assume this read happens from L1 cache.
    - Best case with L1 cache residence: ~5 CPU cycles to load the cache line
- We must then compare if the found `b.`y matches our `a.x` and emit if they match.
    - Assuming perfect hashing - this is one compare of two integers, with a conditional jump
    - Another 1-2 CPU cycles - assuming no branch misprediction
- We must write the value of `a.x` and `b.y` to memory for the output array.
    - If _everything_ works out perfectly we don't need to allocate
    - Maybe we pre-allocated the output.
    - If the value was long, we could even use highly optimal `memcpy` (with const known size)
    - This is all doable in 1-2 cycles, by applying minimal intelligence to the task

All of the above are extraordinarily generous assumptions about how fast we can do this. The numbers roughly add up to something in the range of 10-15 CPU cycles for a single join.

We now have a very optimistic, upper boundary on our theoretical join for single threaded execution. Combining our data we get

- The CPU can execute 5B CPU cycles/sec
- In a theoretical, perfect world, it will cost ~10 CPU cycles to join one row in `a` with `b`
- **Conclusion:** We can't possibly go faster than 500M joins/sec on a single CPU core

At this point, my performance optimising readers may object: "Wait, can we shave off some instructions by using SIMD to calculate multiple hashes at the same time?". You are correct - we can. But it turns out this is rarely worth it in the real world. The reason is that the memory read of the hash table tends to dominate. The actual hash calculation is in the noise. Why?

In the above example, we assumed the read happens from L1 cache. The L1 cache of a modern CPU is _tiny_ - typically in the order of a few tens to hundreds of KB. No real workload for hash join fits in L1 cache. What happens if we have to hit L2 or L3 cache? Or even main memory?

- Missing L1 caches: another 20 cycles.
- Missing L2 caches going to L3: another 50, even 100 cycles.
- Going to main memory (assuming no TLB misses): 100-300 cycles (assuming modern, DDR4 DRAM). Once you hit main memory, you can also forget about CPU pipelining.

If we are being more realistic - the actual joins/sec you can do on a modern, top end, best in class, CPU is around ~10-50M joins/sec. We get this number by taking 4-5B cycles/sec and dividing it by 100-300 cycles/memory lookup

The memory cost of this kind of lookup is so dominant that even Python has a chance at keeping up. Doing a simple loop like the above with 10K rows in `hash_b` and 100M rows in `a` I can run get around ~3M joins/sec in Python. Not too bad for a language that is not focused on performance.

**Single threaded takeaway:** You can join at roughly 10M rows/sec - give or take an order of magnitude - on a single CPU core.

<aside>
<b>Why VARCHAR keys are stupid!</b>

In this entire section, I assumed that we are hashing and joining on integers. 32 bit or 64 bit - doesn't matter much.

What if you decided to use **VARCHAR** for our keys?. What if that **VARCHAR** was a UTF-8 **VARCHAR** with a collation on it?

I will tell you what will happen: All those calculation hash operations and the compares to check if we found the right item in the hash table. They go up by about 100-1000x (even for a **VARCHAR** of only 4 bytes). Comparing two collated **VARCHAR** for equality in a collation requires lookup tables (bye, bye L1 cache), branches that can be mis-predicted (particularly the one checking if the two **VARCHAR** are of the same length) and loop boundary conditions that need to be checked.

Databases will happily take your **VARCHAR** and join on it. But are you going to be that guy that takes your database from 10M joins/sec/core to 10K joins/sec/core? You going to be the 1000x slowdown guy?
</aside>
Benchmark it in Python yourself

This is the program I ran. I ran it in Python 3.12. Curious to know what numbers you get:

```python
lookup_size = 10000
a_rows = [i % lookup_size for i in range(100000000)]
b_hash = {i: i for i in range(lookup_size)}

random.shuffle(a_rows)
matches = 0
start_time = time.time()
for a in a_rows:
if a in b_hash:
   matches ^= (b_hash[a] + a) # Do something that is really cheap

end_time = time.time()
print(f"checksum {matches} found at speed: {len(a_rows) / (end_time - start_time)} joins/sec")
```

# Intermezzo - How powerful are Modern Databases and CPUs?

We have seen the limits of single threaded execution now. Before we talk about scalability - I want to stop for a moment to ponder the numbers.

Reiterating:

On a single core, with a good implementation - you can find and read >10M items in a large hash table per second. If the circumstances are just right - you can go 10x faster than that. That is assuming the hash table is in memory of course... We can talk disk another day.

What kind of business problem can you solve with that kind of speed?

As per the time of writing, there are around 7B people on this planet. Assume half of them have a credit card. Assume they use that credit card an average 10 times per day (that is some dream consumers for you right there).

Let us say that a credit card transaction between you and me is:

- One lookup of your balance
- One lookup of my balance
- One update your balance
- One update of my balance

I am going to assume those updates are also hash lookups. Which is reasonable in a memory resident database. One credit card transaction is 4 hash lookups (give or take).

Back of the envelope, we can now calculate the global credit card throughput for our species:

- 3.5B credit cards \* 10 transactions/card/day = 350B transactions/per day

Turning that into transactions/sec:

- 350B transaction/sec / 24h/day / 3600 seconds/hour = 4M transactions/sec

We are assuming one transaction is 4 hash table lookups, so that is 16M hash table lookups/sec.

In other words: From the perspective of the database - a single CPU core, with a good implementation of hash lookups, could handle all credit card traffic on the planet. The rest is overhead from apps! You could run the world's banking systems on your iPhone!

Think about that a bit, before you burn a power budget the size of Poland's to run your little crypto pyramid scheme and claim that crypto currency is the new money.

# Multi Threaded Execution - Scaling Up

What if 10M hash lookups/sec just isn't enough?

The first path open to us is multi core execution. A modern CPU, like the beautiful AMD Epyc, can be acquired relatively cheap. It has 160 cores - some serious compute power on a single package! Modern CPUs can also hold significantly larger hash tables in their L3 caches. We are moving into the GB range of L3 caches - L3 cache is the new DRAM. This is all great news for database developers!

It appears, at first glance, that a 100x improvement in query execution is in reach for the database engineer who is clever about multi threading.

Our use of Python as the "sample language" is now getting a little tricky. Python hides too many details about concurrency - you can't "see" the execution at the level it needs to be visible for this type of analysis. But let me try to see how far the analogy goes...

Consider again this loop:

```python
b_hash = {r.b, r for r in b} # Assume very fast (i.e. b is small)
for a_row in a:
  if a in b_hash  
      output.append(Row(x=a_row,x, y=b_hash[x].y)
```

I am going to assume that `b_hash` is so fast to create that the time it takes does _not_ factor into the runtime of of the query that contains the loop. I leave it as an exercise for the reader to think about how to make creation of the hash table parallel - or you can just read on.

Using libraries like `concurrent`, we can write something like this (ChatGPT wrote this - I am not sure it works)

```python
with concurrent.futures.ThreadPoolExecutor() as executor:
   output = list(
      executor.map(lambda a: 
                   b_hash[a.x] if a in b_hash else None), a_row))
```

This doesn't tell us anything about what must happen behind the scenes! But we can infer this by thinking a bit deeper.

If presented with a list of data in `a_row` to join in parallel, we must:

- Split up that list in a way that each thread looks at a separate subset of items in that list. This requires the threads to agree who does what
- Have the threads do the parallel work of looking into the hash table (remember that this dominates the runtime)
- Put that data back into a list, in a thread safe manner, so we can send that data to the next operator in the query

For trivial cases, like the list parallelism above, this operation scales nearly linearly. For non trivial cases - you will need locks and coordination between threads. Creating low impact thread coordination is an extraordinary tricky piece of hacking - which deserves a blog entry of its own.

## Amdahl's Law - The Pain that keeps Giving

A principle called [Amdahl's Law](https://en.wikipedia.org/wiki/Amdahl%27s_law) comes into play when designing for multi core execution. There is typically an upper limit to how much extra speed you can get, just by adding more cores.

Consider the case of building a large hash table in parallel. We need to do the following operations:

- Each thread must calculate the hash of the incoming values that belong to it. No other thread needs to be involved in this
- Each thread must then locate the right slot in the hash table to insert the value. This requires it to acquire a lock (or do a compare and swap). Without some kind of coordination, other threads could end up overwriting our data.
- If the hash table needs to grow, that part of the hash table cannot receive insertion while it is growing. This in turn may block other threads from executing

The time we need to synchronise with other threads is time we did not spend actually building the hash table. That time is not zero. Because that time would _not_ need to be spend in single threaded execution - we are no longer scaling linearly.

**Multi Threaded Execution Takeaway:** With the current generation of CPU cores, you can probably do around 1B joins/sec in a single query. This is an extraordinary amount of throughput and it is only going to get bigger as time goes by.

Amdahl's Law Exercises

Here are some SQL queries that are challenging to execute in parallel. Think about how much extra speed you will get by throwing cores at the problem and how you would write a program to make use of all cores.

**Every 10th row:**

```postgresql
-- Every 10th row
SELECT * FROM (
  SELECT ROW_NUMBER() OVER (ORDER BY x) AS rn
  FROM BigTable
) AS subquery
WHERE rn % 10 = 0
```

**Finding duplicate values**:

(particularly interesting when there is a great number of distinct x and very few duplicates)

```postgresql
SELECT x
FROM BigTable
GROUP BY x
HAVING COUNT(*) > 1
```

**Sending ordered rows to the client without a `LIMIT` or `TOP`:**

```postgresql
SELECT x
FROM BigTable
ORDER BY y
```

## Scaling Out - You need a Good Reason

We have come to a train station on our journey. On the platform - we see a train parked with the name: "The Hype". Are we going to get on it to speed up our journey even further?

Scale _out_ computing has, for a very long time, been a dream we all aspired to. The idea is simple: I want to build a compute cluster out of cheap, easily available, cost effective hardware. I then want to treat that computer cluster as if it was a single database system. This, in principle, also removes all single points of failure. Because it is simple to understand - but hard to implement - it makes a lot of people feel very smug when they talk about it.

Software architects have argued for this idea for longer than anyone can remember. With the cloud - it sounds every more tempting. Because what is a cloud, if not a collection of someone else's hardware, build of cheap components, that you can quickly get more of if you want? At least that is the principle...

If you have been thinking carefully about the multi threading example - you might be able to infer what is coming: Amdahl's law is merciless. Remember that accessing DRAM when the data is not in L3 cache, is expensive. In the order of 100-300 CPU cycles. During those cycles, the CPU is doing _nothing_ - except burning your cloud credits. Accessing the data across a network card - even a very powerful one - is at least 10x longer - maybe 100x (depending on how smart you are). That's a lot of compute down the drain.

"But Doctor", I hear you say, "isn't that what shuffle operations are supposed to solve?"... I'm glad you asked.. let us dig in

# Shuffle - The Secret, 5th Operation

When we design databases, we typically think of four operations that we _must_ optimise our loops for:

- Joining - Like what we saw in [Databases are just Loops under the Hood – Part 1: Joins](https://database-doctor.com/?p=85)
- Grouping - Caused by `GROUP BY`, `DISTINCT` and `HAVING`. We saw that in [Databases are just Loops – Part 2: GROUP BY](https://database-doctor.com/?p=97)
- Sorting - for operations like `ORDER BY` and window aggregates like `OVER (ORDER BY)`. Also used for merge join/aggregate
- Scanning - actually retrieving data from disk or memory. A large topic that deserves its own blog entry

There is a hidden operation that only distributed database engines have to use. It is called: "Shuffling" - sometimes also known as "exchange" or "distribute". To understand shuffle, we need to visit our join query again. This time, let us `EXPLAIN` it on a distributed database system

```postgresql
EXPLAIN
SELECT x, y
FROM a
INNER JOIN b ON a.x = b.y
```

If we assume that `a` and `b` are very large and that their data is spread all over a distributed cluster, we may get something like this:

```postgresql
SELECT
INNER HASH JOIN ON (a.x = b.y)
|-SHUFFLE (a.x)
| SCAN a
|-SHUFFLE (b.y)
  SCAN b
```

On a single node system (i.e. not distributed), the same query would look like this:

```
SELECT
INNER HASH JOIN ON (a.x = b.y)
|-SCAN a
|-SCAN b
```

What is `SHUFFLE` used for in the distributed case?

## A Shuffle Example

Think about what needs to happen if we want to hash join across multiple machines. if Machine 1 is looking at a row from `a` - how does it know if there is a matching row in `b` on Machine 2?

To understand what is going on with a shuffle, think of `x` and `y` values as being suits of playing cards - diamonds (♦) , spades (♠), clubs (♣) and hearts (♥). Our sample scenario has two machines (Machine 1 and Machine 2).

Our distributed query optimiser may decide as follows:

- Machine 1: You are responsible for joining the **red** suits (♦ and ♥)
- Machine 2: You are responsible for joining the **black** suits (♠ and ♣)

if Machine 1 observes a **black** suit card - it knows that is should just send that card to machine 2 - if the card is **red** suit - Machine 1 will just keep it

Similarly, if machine 2 observes a **red** suit card, it sends it to machine 1, if it observes a **black** suit card, it keeps it.

With these decisions, Machine 1 and Machine 2 both know that when they join on `x` and `y`, any matches will _already_ be on the relevant machine and we generate right results without having to synchronise between members of the cluster.

We can illustrate this with the actual execution plan for each machine:

**Machine 1:**

```
Output1 Machine1 (♦ and ♥)                 
♦♥      SELECT                                              
♦♥      HASH JOIN ON (a.x = b.y)        
♦♥      |-SHUFFLE (a.x)            
♦♥♠♣    | SCAN a                   
♦♥      |-SHUFFLE (b.y)            
♦♥♠♣      SCAN b                   
```

**Machine 2:**

```
Output2 Machine2 (♠ and ♣)          
♠♣      SELECT                            
♠♣      HASH JOIN ON (a.x = b.y)    
♠♣      |-SHUFFLE (a.x)  
♦♥♠♣    | SCAN a                    
♠♣      |-SHUFFLE (b.y) 
♦♥♠♣      SCAN b
```

## Shuffle is Expensive

What needs to happen in a shuffle is this:

- Inspect each row of the input, decide what target machine it has to move to. This is typically done with a hash function
- Copy that row into an output buffer destined for that target machine
- Coordinate with the other threads on the local machine to decide who gets to copy to which buffer (i.e. locks again)
- Either send the row immediately or gather up enough rows until we have a batch
    - If we send rows immediately, we pay too much CPU to roundtrip on the network
    - If we wait too long - the other side will not make progress. Or worse: Our parent node in the query plan wont get data fast enough
    - We need a pile of memory to do this effectively and always be ready to transmit to the other side while still making progress locally.
    - This extra memory competes for cache slots - and it lower the aggregate amount of memory available for concurrency
- Receive rows from all other members of the distributed cluster, potentially taking an interrupt. Then send those rows to the parent node.

These are all memory intensive operations - copying data around and handling buffers.

While the cost of actually transmitting the data can be partially offloaded to the network card - it cannot be fully offloaded. For high speed databases - TCP/IP is too slow and costs too much CPU to use (try to run four 10Gb NIC at full speed on your Linux box and run `htop`). Typically, RDMA or custom protocols on top of UDP are used instead.

Shuffling is not free. It is not as expensive as a join, but it typically contributes significantly to the overall performance of a query and the distributed system as a whole. This makes distributed queries that operate on the same data as a non distributed system - cost _more_ overall CPU (i.e. it makes your cloud bill larger)

**Scaling out Takeaway:** When scaling out databases, it is possible to reach a nearly unlimited amount of performance. However, the aggregate CPU cost per query is significantly higher in a distributed system than running the same query in a scale up system

The problem of Skew

This blog entry is already getting too long. But I want to put something on the table (pun intended) for you to think about.

In our example we had `x` and `y` represent suits in a large deck of cards. There are four suits available in this domain (i.e. ♦♥♠♣).

How would we scale the query to more than 4 machines?

What would happen if 90% of all the data was hearts? (♠). How would this scale with the algorithm outlined?

# Summary

Today, we have gone over some of the advanced tricks databases use to optimise CPU usage when running loops.

We have seen that it is possible to do some rough calculations to predict how long things _should_ take. This type of "order of magnitude" reasoning is a useful way to think about computation in general. It allows you to sanity check your own algorithms.

We have seen that there is a CPU cost incurred when moving to multi threaded execution and that this cost goes up even more if we move to scale-out solutions.

Hopefully, I have at least convinced you that those "just loops" are a little more complicated than meets the eye.
