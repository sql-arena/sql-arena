---
title: "Synchronisation in .NET – Part 4: Partitioned Locks"
date: 2014-01-05
author: "The Doctor"
tags:
  - "c#"
  - "concurrency"
  - "scalability"
---

In this final instalment of the synchronisation series, we will look at fully scalable solutions to the problem first
stated in [Part 1](dotnet-sync-part1.md): adding monitoring to a high speed app where that monitoring is
scalable and minimally intrusive.

Thus far, we have seen how there is an upper limit on how fast you can access cache lines shared between multiple cores.
We have tried different synchronisation primitives to get the best possible scale.

Throughput this series, [Henk van der Valk](https://www.linkedin.com/in/cloudxcellence/) has generously lent me his 4
socket machine and been my trusted lab manager and reviewer. Without his help, this blog series would not have been
possible.

And now, as is tradition, we are going to show you how to make this thing scale!

# Recapping

Before we move to the solution, let us just summarise what we have learned so far:

- Even without locks, a single (Intel X7560 @ 2.27Ghz) core is limited to around 90K operations/ms
- Working backwards from the clock speed, we can conclude that 20-30 CPU cycles are need to do one call to `Add()`
- The moment we introduce contention beyond the L1 cache boundary, throughput drops significantly
- Inside the local L2/L3 caches, we see a nearly constant throughput for all synchronisation primitives
- Contention from threads outside the CPU socket degrades the throughput dramatically, until it eventually reaches a
  steady state (around 16-20 Logical Cores on the 4 socket box)
- Sharing cache lines between different copies of the `OperationData` struct introduces false sharing effects.
  To eliminate these effects, we have to pad the 32B wide struct containing the data
- There is a trade-off between the scalability of a lock and the cost to acquire it.
    - For example, the TTAS spin lock is cheaper to acquire than the .NET SpinLock
    - ...but it scales poorly

# Implementation: Partitioned Locks

Based on what we have learned so far, we can now design the optimal solution. There are several challenges to overcome.

First, we need to make sure that the `OperationData` struct lives on its own cache line. This can be done with the
implementation we have already seen:

```csharp
[StructLayout(LayoutKind.Sequential)]
private struct OperationData
{
  private fixed byte Pad0[64];
  public long TimeMs;
  public long Count;
  public long MaxTimeMs;
  public long MinTimeMs;
  private fixed byte Pad1[64];
}
```
Depending on the synchronisation method we choose, we may add additional fields (example: the `IsHeld` field in the TTAS
spin lock from the previous post)

Second, we have to avoid sharing cache lines between cores when we call `Add()`. This can be achieved by maintaining one
copy of the `OperationData` array per core. Instead of using a one-dimensional array of `OperationData`, we can make it 
two-dimensional, with the second dimension being the CPU whose L1 cache we want to hold the structure.

Here is the implementation:

```csharp
private const int MAX_CPU = 64;

private OperationData[,] _opsData = new OperationData[MAX_CPU, OPSLIST_LENGTH];
```

The drawback of this solution is that we need to visit every core’s copy when we want to report on the data (or when we
call `Clear()`). However, reporting is a rare event compared with the constant calling of `Add()`.

Third, we now need to make sure that a thread updating the `OperationData` always picks the one that is most likely to be
on the core it runs on. At this point, we run into trouble with the .NET framework. It turns out that it is not possible
for a thread to ask which core it currently runs on. The framework wont expose this information to you, it only
available via C++/Win32.

At this point, we have to fall back on our knowledge of Win32 and Windows. Each thread in Windows has a preferred core
that it runs on. The Windows scheduler will generally prefer to wake this thread up on the same core that it last ran
on (this is done to preserve L2 caches).

It is possible for a thread to ask which core it current runs on by calling `GetCurrentProcessorNumber()`. This call is
relatively cheap and .NET (unlike other: “Our one size coffee fits all, but we will pretend you can have it your way”
managed languages) has a very nice way to communicate directly with the underlying operating system. We can simply call
out to Windows like so:

```csharp
[DllImport("kernel32.dll")]
static extern int GetCurrentProcessorNumber();
```

We can now express `Add()` using this outline of code:
```csharp
[ThreadStatic]
private static bool knowsCore;

[ThreadStatic]
private static int cpuIndex;

public void Add(int operation, int timeMs)
  if (!knowsCore) {
    cpuIndex = GetCurrentProcessorNumber();
    knowsCore = true;
  }
  fixed (OperationData* s = &_opsData[cpuIndex, operation])
  {
    /* Syncronisation code goes here */
  }
}
```
By storing the the CPU ID we run on in a `ThreadStatic` (`cpuIndex`) the thread can "remember" which part of the array 
it needs to speak with. And it will always speak _only_ to the array

At this point you may ask: Why not call `GetCurrentProcessorNumber()` every time? Well, it turns out that while this call
is cheap, it is not _that_ cheap. We measured a significant drop in throughput when we tried the first implementation.

What we do from here in `Add()` solely depends on which synchronisation primitive we decide to use.

## Benchmark: Partitioned Lock
Using the knowledge we have acquired so far, we can now create several different implementations of the partitioned data
structure – each using their own synchronisation primitives.

Let us see how they do in test:

![Graph](/assets/img/lock-partitioned.png)

Now _that_, ladies and gentlemen, is what scalability looks like. Even the worst partitioned, thread racy (unsafe) 
implementation tracks the racy (unsafe) un-partitioned version at low scale and massively outperforms (by about a factor 20) the racy
version at high scale.

At the very highest scale, the low overhead, partitioned TTAS spin lock outperforms the racy un-partitioned version by 
x85.

It is also clear that when the contention on a lock is low – a lightweight alternative to the .NET `SpinLock` (like the
TTAS spin) is very good – and so, interestingly, is the .NET `lock()` operation.

# A Word of Warning
Getting scalability right requires a keen eye for detail – bordering on OCD (just the kind of thing [My Autism](/about/)
loves). Henk and I had to make a lot of small adjustment to the data structure to hit the relatively clean scale curves 
you see above. 

Constant benchmarking and analysing of results is the key to success – nothing beats empirical data on a big machine.

Going over the mistakes I made while adjusting the code would require an entire, new blog entry. Yet, it is probably
worth showing you one example to illustrate the point. In one of our partitioned data structure tests, I had forgotten 
to add padding to the struct. This resulted in false sharing rearing its ugly head as can be seen below:

![Graph](/assets/img/lock-false-share-fail.png)

The moment false sharing occurs the scalability goes all wonky. The small things matter!

# Summary
In this blog series, we have shown you how to build scalable data structures and quantify the overhead of
synchronisation primitives.

We have seen that the only viable solution for high scalability is to use partitioned data structures.

When data structures are designed for low contention, the choice of synchronisation is determined by two factors:

- Do you want to block when you cannot access the critical region. If so use `lock()`
- Do you want to spin when you cannot enter the critical region? In this case, rolling your own TTAS spin lock might  
  be worth it.

In a fully asynchronous programming model, the .NET `lock()` statement will likely be the best choice for nearly all
implementations. There are very few cases where `SpinLock` is preferable – unless of course, you have no way to avoid
contention.

At the end, we managed to build a highly scalable data structure that works well even on a lot of cores. This means that 
we can feel confident about adding this instrumentation generously to our application server code – at least until we 
manage to drive a throughput of more than 800K operations/ms.

<aside>
<b>Note from Future Me</b>

When rebuilding my blog I decided to resurrect these old blog entries. I am not sure (yet) if .NET has evolved enough to 
make some of this information invalid. But I think the overall lessons you can learn from these experiments is every
bit as valuable as they have always been.

In today's HW (writing this in 2024) the multi-socket systems Henk and I used have been delegated into the history 
books. But NUMA is still very much a thing when the core count is high. False sharing did not "get solved" by the
CPU vendors - as a programmer - you still need to know about these things if you are serious about high performance
code.

I hope to one day get a chance to blog about even more complex synchronisation problems.
</aside>