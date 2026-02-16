---
title: "Synchronisation in .NET – Part 2: Racy Data Structures, Padding and False Sharing"
date: 2013-12-27
author: "The Doctor"
tags:
  - "c#"
  - "concurrency"
  - "scalability"
---

In the previous blog post we saw how the `lock()` statement in .NET scales very poorly when there is a contention on a
data structure. It was clear that a performance logging framework that relies on an array with a lock on each member to
store data will not scale.

Today, we will try to quantify just how much performance we should expect to get from the data structure if we somehow
solve locking. We will also see how the underlying hardware primitives bubble up through the .NET framework and break
the pretty object oriented abstraction you might be used to.

Because we have already proven that `ConcurrentDictionary` adds to much overhead, we will focus on `Array` as the 
backing store for the data structure in all future implementations.

# Implementation: Racy Array
We saw how the `lock()` statement itself is very expensive and dominates the CPU consumption of the test. What might
happen if we decided to make the data structure complete unsafe and just get rid of locks?

Let us try this implementation:

```csharp
private OperationData[] _opsData = new OperationData[OPSLIST_LENGTH];
public void Add(int statistics, int timeMs)
{
  OperationData s = _opsData[statistics];
  s.TimeMs += timeMs;
  s.Count++;
  s.MaxTimeMs = Math.Max(timeMs, s.MaxTimeMs);
  s.MinTimeMs = Math.Min(timeMs, s.MinTimeMs);
  Thread.MemoryBarrier()
}
```

Since there is no thread coordination here, all bets are off on the results we can expect. Just for the experiment, let
us see how fast this will go.

Note: The `Thread.MemoryBarrier()` call is necessary to make sure that the update of the data is visible to other 
threads and that the compiler wont remove or reorder instructions. The MSDN documentation states that this method is 
only needed on IA-64, but this is wrong. Instead of explaining this, I refer you to this excellent
blog: [Threading in C#](http://www.albahari.com/threading/part4.aspx)

## Benchmark: Racy Array
Below is the benchmark of the racy array compared with the previous run using a lock based array:

![Graph](/assets/img/lock-array-racy.png)

This might surprise you. The racy version of the implementation, while significantly faster at low concurrency, still
scales poorly at high concurrency.

What is going on here? Even without locks, the data structure does not scale?

A code profile of where we are spending the time shows something most curious:

![Profile](/assets/img/profile-racy.png)

Notice that the first access of the class (`s.timeMs += TimeMs`) takes almost twice as long as the rest of the
modifications, we would not expect adding an integers to be a “long” operation (certainly shorter than taking the
max of two values).

Another noteworthy phenomena is that the first 2 CPU threads seems to scale well, followed by steep drop in scale to an
almost flat line, then another drop at 16 CPU threads. If you squint your eyes, you can see the same effect in the
locking run.

Welcome to the world of hardware! Because all threads (each running on their own core) need to update the 
`OperationData` class, the CPU root complex have to coordinate the writes to the memory so each thread sees a 
consistent picture of the values we change when they read it next (preserving strong memory semantics). CPU cores 
exchange information about memory state using the MESI protocol. This coordination is not free, as cache lines become 
dirty (by writing to memory from code) information has to flow between the CPU cores.

In the case of an Intel CPU, the communication between two hyper threads (in L1 cache) on the same core is relatively
cheap – which explains that the first two CPU threads have good scale. As we move out to other cores on the same socket,
we have to touch L2 and L3 caches, which causes the first big drop in scale. Finally, as we leave the CPU socket, the
coordination becomes very expensive – dropping us to our final, bottleneck limited workload.

Below illustrates the jumps we make in scale and between CPU cores:

![Old CPU Core](/assets/img/old-core.png)

_This_ is why even the racy variant of the data structure doesn't scale.

The MESI protocol does not operate on individual integers, it operates on a full cache line. In the case of the x86/x64
architecture, a full cache line is 64B and anything that changes inside that cache line will have to coordinate with the
other cores.

# Implementation: Padded, Racy Array
Consider again the data structure that holds the measurements:

```csharp
private class OperationData
{
  public long TimeMs;
  public long Count;
  public long MaxTimeMs;
  public long MinTimeMs;
}
```
This class takes up 8B/long x 4 longs = 32B. That’s only half a cache line. What might happen if two of these end up
next to each other in memory?

Recall that the test harness calls the `Add()` function with 4 different operations, which means there are 4 instances 
of the `OperationData` class in play. 

The memory layout looks like this:

![Memory Layout](/assets/img/memory-layout.png)

Since coordination of dirty data is done on a cache line (64B) granularity in the CPU, a layout like this would
effectively serialise access, at the CPU level, to the three OperationData objects – even though they are entirely
independent data structures.

Is it possible to validate if this is happening? Of course: you can simply break into the code and take the address of
the first long in each class. Like so: `&(_opsData[0].TimeMs)`.

Comparing the byte offsets of each long in the four instances of `OperationData`, we can see that the above is indeed
happening! This phenomena is known as “False Sharing”.

What can we do about it? Well, one way is to use a struct instead of a class to store the data. Structs in .NET have the
advantage of giving the user full control over the memory layout of the data. For example, we could do this:

```csharp
[StructLayout(LayoutKind.Sequential)]
unsafe private struct OperationData
{
  private fixed byte Pad1[64];
  public long TimeMs;
  public long Count;
  public long MaxTimeMs;
  public long MinTimeMs;
  private fixed byte Pad2[64];
}
```

Note the `byte` array at the beginning and end of the `struct`. It will prevent the struct from sharing a cache line
with any other copies because the struct is now larger than a cache line. Because structs are value and not reference
types, we have to be a bit more careful with the `Add()` method, it has to take out a pointer to the array of structs:

```csharp
unsafe public void Add(int statistics, int timeMs)
{
  fixed (OperationData* s = &_opsData[statistics])
  {
    s->TimeMs += s->TimeMs + timeMs;
    s->Count++;
    s->MaxTimeMs = Math.Max(timeMs, s->MaxTimeMs);
    s->MinTimeMs = Math.Min(timeMs, s->MinTimeMs);
    Thread.MemoryBarrier();
  }
}
```
## Benchmark: Padded, Racy Array
The results are rather impressive for such a minor change:

![Graph](/assets/img/lock-array-racy-padded.png)

40% Faster in every single case!

# Summary
In this blog post, we have seen that even when we remove locking from the equation, the data structure is still not
scalable. This experiment has provided us some upper boundary of how fast this structure will go with the current
implementation patterns (around 90K operations/ms).

We saw how even very small changes to the cache layout of data structure can lead to a significant scale boost. It`s 
also clear that going beyond a single CPU socket on the Xeon has a large, negative impact on the scalability of the code. 

What does this mean in practical terms? If you ran this data structure on a large machine with a great many cores, it would
run _slower_ than on your laptop. This is the kind of physical reality that a managed language will try to hide from you
with all of its fancy, object oriented blah blah. Such abstractions leak horribly when concurrency goes up.

Without knowledge of the hardware, we would have had a real “WTF moment” seeing this data. Understanding scenarios like
these, which are more common than you might hope, is what distinguishes a great programmer from a good one. This is why
I believe that teaching languages like JAVA and C# in university is outright harmful until a student has a good grasp of
C/Assembler and machine architectures.

On to the next parts:

- [Part 3: Spinlocks and Atomics](dotnet-sync-part3.md)
- [Part 4: Partitioned Locks](dotnet-sync-part4.md)
