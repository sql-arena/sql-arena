---
title: "Synchronisation in .NET– Part 1: lock(), Dictionaries and Arrays"
date: 2013-12-25
tags:
  - "c#"
  - "concurrency"
---

As part of our tuning efforts at Livedrive, I ran into a deceptively simple problem that beautifully illustrates some of
the scale principles I have been teaching to the SQL Server community for years.

In this series of blog entries, I will use what appears to be a simple .NET class to explore how modern CPU 
architectures handle high speed synchronisation. In the first part of the series, I set the stage and explore the .NET 
`lock()` method of coordinating data.


# The Problem: Write a Class that tracks duration of Operations
The problem we are trying to tackle is add instrumentation to a .NET application server. 
We would like to get aggregated statistics about how long business operations inside the server takes and how many times 
each business operation gets executed.

The desired output is:

| Operation | 	Count | 	TotalTimeMs | 	MaxTimeMs | 	MinTimeMs |
|-----------|--------|--------------|------------|------------|
| Foo       | 	42    | 	104	        | 20         | 	1         |
| Bar       | 	13    | 	1303        | 	500	      | 75         |

With a class that tracks this information, we can query the application server while it is running to understand how 
long common operations take and where to tune first. Of course, we can get to this level of detail by plugging into 
Event Tracing for Windows (ETW) and analysing using tools like 
`xperf` and Windows Performance Analyser (or `perf` if you are on Linux). 
But for our scenario, we would prefer to explicitly measure code paths that represent full business operations instead 
of doing generic code profiling. We would also like this data gathering to be running non stop.

(Users of SQL Server may be familiar with `sys.dm_os_wait_stats` and it should be obvious why I would want something 
like this done for a generic application server).

Apart from the functional goal, we have the following performance requirements:

- The class should not introduce a new bottleneck in the code it measures
- It should add barely measurable CPU overhead, ideally only a few %
- The same operation should be log-able from several code paths, this should not introduce any contention between these 
  code paths

# Initial Design
In the following, I will sketch the high level design required. There are several ways to implement this design, but to 
compare implementations, let us first agree on the common interface of the class we need to build.

From the problem description, it should be obvious that the implementation needs to contain a data structure like this:

```csharp
private struct OperationData
{
  public long TotalTimeMs;
  public long Count;
  public long MaxTimeMs;
  public long MinTimeMs;
}
```

And we can also specify the desired interface that must be implemented:

```csharp
public interface IAggregateStatistics
{
  /// <summary>
  /// Clears the data in the class
  /// </summary>
  void Clear();
  /// <summary>
  /// Add or update a measurement in the instance of the class
  /// </summary>
  /// <param name="operation">The operation to update statistics for</param>
  /// <param name="timeMs">The time measured by the caller</param>
  void Add(int operation, int timeMs);
}
```

The `Add()` method takes an integer representing the operation to log (example: Foo = 0, Bar = 1). We could implement 
this parameter as an enum or a string too, but let’s keep the example simple and just assume the caller passes us an 
integer. To further simplify, we can also assume that those integers fall into a fixed range so we can know the maximum 
number of rows in the output at compile time.

Obviously, there are other ways to implement this class. For example, the time measurement itself could be part of the 
class. However, for the purpose of this blog, I would like you to focus on the problem of keeping the `OperationData` 
class/struct up to date at high concurrency. For the rest of this blog series, the focus will be on the `Add()` method with hints on how to implement `Clear()` where this is (pardon the pun) unclear.

## Implementation: `ConcurrentDictionary` and `lock()`
Let us try the simple and straightforward way to implement this class. Here is the code:

```csharp

private ConcurrentDictionary<int, OperationData> _opsData
= new ConcurrentDictionary<int, OperationData>();

public void Add(int operation, int timeMs)
{
  OperationData s;
  if (!_opsData.TryGetValue(operation, out s))
  { 
    s = _opsData.GetOrAdd(operation, new OperationData()); 
  }
  /* Lock up the entry */
  lock (s)
  {
    s.TotalTimeMs += timeMs;
    s.Count++;
    s.MaxTimeMs = Math.Max(timeMs, s.MaxTimeMs);
    s.MinTimeMs = Math.Min(timeMs, s.MinTimeMs);
  }
}
```

This takes a granular lock on the dictionary entry for the statistic we are trying to update. This is safe because 
`Clear()` of a ConcurrentDictionary creates a new, empty dictionary. What this means is that even if an `Add()` 
operation is  racing with a `Clear()` operation, our change of s (inside the lock) will just be lost and garbage 
collected.

To benchmark the different implementation we will try in this blog series, I have created a test harness that 
initialises an implementation of `IAggregateStatistics`, starts multiple threads and logs 4 different operations 
(randomly) at high speed. The exact details on how to implement such a high speed test harness is a subject for a 
completely different blog entry.

### Benchmark: `lock()` and `ConcurrentDictionary`
To compare implementations, we will use a test harness that logs 4 different operations (creating a moderate amount of 
contention on big boxes) and measures the number of calls to `Add()` that are done per second

The results are _not_ encouraging on the 4 socket, 8 cores (16 in HT) machine:

<aside>
<b>Note from Future Me</b>

Very similar behaviour is observed on single socket system as you get into the >32 core range. The latency
between cores is smaller, but the scale graph has the same shape.
</aside>

![Graph](/assets/img/lock-dictionary-naive.png)

The scale of the class breaks already at 2 threads. I would expect that as we add more threads and more CPU power, 
more operations can be logged every second. At a maximum of just over 18K operations/sec – this implementation will not 
scale to our requirements. Recall that I have previously proven that a single SQL server is well capable of 1M 
operations/sec.

It’s worth noting that at least two locks are being taken in this implementation:

- A lock on the dictionary itself (during `TryGetValue`)
- A lock on the entry while it is being updated 

# Implementation `Array` and `lock()`
While .NET has some great concurrent data structures, they are meant to be generic and widely applicable, not optimised 
for specific use cases. When programming for high scale, it is often necessary to create your own, highly optimised data 
structures.

For our purpose, an array really is good enough, we don’t need `ConcurrentDictionary` and the locking overhead that 
comes with it.

Let us now attempt this implementation which uses an array instead:

```csharp
private StatData[] _opsData = new OperationData[OPSLIST_LENGTH];

  public void Add(int operation, int timeMs) 
  {
    OperationData s = _opsData[operation];

    lock (s)
    {
      s.TimeMs += timeMs;
      s.Count++;
      s.MaxTimeMs = Math.Max(timeMs, s.MaxTimeMs);
      s.MinTimeMs = Math.Min(timeMs, s.MinTimeMs);
    }
  }
}
```

Recall that we know the maximum number of operations we want to time (4 for the purposes of our test case), which allows 
us to pre-size the _opsData array. With this implementation, a trivial constructor is required too in order to new the 
objects in the array.

`Clear()` can be implemented by traversing the array and locking each element in turn. Alternatively, a new array can be 
allocated and swapped out with the old one.

I leave it to the reader to come up with an implementation that works even if the number of operations is not known in 
advance. It's not that hard.

## Benchmark: `Array` and `lock()`
Running the same test used for the `Dictionary`, we get this result:

![Graph](/assets/img/lock-array.png)

The array implementation performs about twice as fast as the dictionary. For both implementations, the scale goes 
negative under even moderate concurrency, though the array seems to hold up a little better for the first 8 cores.

# Pinning
While running benchmarks, Henk noticed that the cores used by the harness were not always the same ones. While the number of busy cores DID match the thread count, the cores that were busy would “wander” around depending on the state of the test and the .NET scheduler.

To correct for this, I modified the test harness to pin each new thread to the next unused core, gradually added more and more pinned threads (starting from logical CPU 0 and up to logical CPU 63).

## Benchmark: Pinning to Cores
Interestingly, the test results with the harness changes now become:

![Graph](/assets/img/lock-array-pinned.png)

The array implementation is still twice as fast as the dictionary at low concurrency, but it quickly falls into the same 
low performance of the dictionary. Also notice that as we add a second core to the array implementation (the hyper 
thread partner of the first one) we actually get a little bit of extra scale. Interestingly, this matches the theory of 
the performance measurement that showed 70% of a single CPU core is spend in acquiring/releasing the lock. In other 
words: there is a slight amount of scale (up to ~30%) to be found by going from one to two threads, but only if they 
share the same CPU caches (more about this in the next entry).


# Summary
In the implementations used, it is obvious that even a single core can saturate the maximum throughput of the data 
structure.

Behind the scenes, the `lock()` statement is an implementation of the Windows Monitor object 
(source: http://msdn.microsoft.com/en-us/library/ms228964(v=vs.110).aspx). We might hypothesise that the CPU cost of 
entering an exiting the monitor dominates the workload. We can confirm this hypothesis with a quick Visual Studio code 
profile of the code running on one thread:

![Graph](/assets/img/lock-profile.png)

Over 70% of one CPU is spent to enter/exit the monitor. Since only one core can be in the critical section at any time, 
this limits the throughput to one or two cores worth of calling Add. While we are logging 4 different operations, it 
appears that the cost of coordinating between threads drowns out any benefits of concurrency. In other words: The work 
required inside the lock is cheaper than the lock itself and hence the data structure does not benefit from parallelism.

With the array implementation, the number of locks required is cut in half, which then halves the number of 
`Enter`/`Exit` calls. This expectedly doubles throughput.

The implementation chosen so far does not meet the requirements! If we were to log operations using this implementation, 
the logging itself would introduce a bottleneck to the logged code.

Read the rest of this series:

- [Part 2: False Sharing](dotnet-sync-part2.md)
- [Part 3: Spinlocks and Atomic](dotnet-sync-part3.md)
- [Part 4: Partitioned Locks](dotnet-sync-part4.md)

