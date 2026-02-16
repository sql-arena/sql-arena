---
title: "Synchronisation in .NET – Part 3: Spinlocks and Interlocks/Atomics"
date: "2014-01-04"
tags:
  - "c#"
  - "concurrency"
  - "scalability"
  - "spinlock"
---

In the previous instalments ([Part 1](dotnet-sync-part1.md) and [Part 2](dotnet-sync-part2.md)) of this series, we have
drawn some conclusions about both .NET itself and CPU architectures. Here is what we know so far:

- When there is contention on a single cache line, the `lock()` method scales very poorly and you get negative scale the
  moment you leave a single CPU core.
- The scale takes a further dip once you leave a single CPU socket
- Even when we remove the `lock()` and do racy operations, scalability is still poor
- Going from a standard struct to a padded struct provides a scale boost, though not enough to get linear scale
- The maximum theoretical scale we can get with the current technique is around 90K operations/ms.

In this blog entry, I will explore other synchronisation primitives to make the implementation un-racy again.
We will be looking at spinlock and `Interlocks`.

# Spinlock Background

Spinlocks are an alternative to blocking synchronisation. The premise of a spinlock is that it is sometimes cheaper to
go into a busy waiting loop and poll a resource, instead of blocking when the resources is locked. Context switches are
quite expensive, so it is often wise not to yield a scheduler if you expect that the held resource will be available
soon.

It is difficult to determine when a spinlock is better than a blocking lock. The MSDN documentation is wisely vague:

> A spin lock can be useful in to avoid blocking; however, if you expect a significant amount of blocking, you should
> probably not use spin locks due to excessive spinning. Spinning can be beneficial when locks are fine-grained and
> large
> in number (for example, a lock per node in a linked list) and also when lock hold-times are always extremely short.

While our data structure has a significant amount of contention, it also has a very shortly held
lock. We can hypothesis that using a C# `SpinLock` instead of a `lock()`/`Monitor` might yield more throughput at high
concurrency.

## .NET `Spinlock` (Queued Spinlock) Implementation

Spinlocks can be implemented in several ways. There is a significant amount of controversy about when to use which.
Notably, the Linux kernel (at this time of writing) uses what is known as a "Ticket Spinlock", which works really well
under low concurrency. It is noteworthy
that [Google is now lobbying to have this changed](https://www.phoronix.com/news/MTI4MTY) to something more like the
Windows (introduced in XP/2003) implementation instead. There is significant evidence that the ticket lock is not as
scalable as one could wish for:
[Non-scalable locks are dangerous (PDF)](https://pdos.csail.mit.edu/papers/linux:lock.pdf).

Let us see if .NET does better.

The spin lock implementation included with the .NET framework is a queued spin lock, similar to the one used in [the
Windows Kernel](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/queued-spin-locks?redirectedfrom=MSDN). 
This particular spinlock, when implemented correctly, guarantees fairness and scales well under high
concurrency - even on system with high core count. 

But how does it scale under our _high_ contention test?

# Implementation: Spinlock protecting
Here is an implementation of `OperationData` using `SpinLock`

```csharp


[StructLayout(LayoutKind.Sequential)]
unsafe private struct OperationData
{
  private fixed byte Pad0[64];
  public SpinLock Spin;
  private fixed byte Pad1[64];
  public long TimeMs;
  public long Count;
  public long MaxTimeMs;
  public long MinTimeMs;
  private fixed byte Pad2[64];
}
```
W
e use our knowledge from the last blog about padding to make sure cache lines don’t overlap. Ideally, the `SpinLock`
itself should take up a full cache line (so two spinlocks don’t experience false sharing when spinning). However, when i
take `sizeof` on the SpinLock struct, it looks like it takes up only 4B.

Here is the new implementation of `Add()`:

```csharp
public void Add(int operation, int timeMs)
{
  fixed (OperationData* s = &_opsData[operation])
  {
    try
    {
      bool lockTaken = false;
      s->Spin.Enter(ref lockTaken);
      s->TimeMs += timeMs;
      s->Count++;
      s->MaxTimeMs = Math.Max(timeMs, s->MaxTimeMs);
      s->MinTimeMs = Math.Min(timeMs, s->MinTimeMs);
    }
    finally
    {
      s->Spin.Exit();
    }
  }
}
```

## Benchmark: .NET SpinLock
And here are the results of the standard .NET spinlock

![Graph](/assets/img/lock-spinlock.png)

This might be quite surprising result - if you consider the .NET description of the spinlock. Even though the lock is
held very shortly, using a spinlock is still _slower_ than the heavyweight `lock()`. However, as the lock becomes
increasingly contended, the spinlock achieve that same scale as `lock()`.


# Implementation: TTAS Spinlock
As mentioned earlier, there are several ways to implement spinlocks. One very simple variant is called the "Test, Test
And Set" (TTAS) spinlock. The advantage of this spinlock is that it is very cheap to acquire and release – which may
address the issue we saw with the .NET `SpinLock`. However, it scales very poorly under high concurrency, perhaps
worse than .NET?

Let us see how this lock would do as concurrency increases (and to compare with the .NET implementation, I build my own TTAS
spinlock.

Here is the OperationData struct:
```csharp

[StructLayout(LayoutKind.Sequential)]
unsafe private struct OperationData
{
  private fixed byte Pad0[64];
  public long IsHeld;
  private fixed byte pad1[64];
  public long TimeMs;
  public long Count;
  public long MaxTimeMs;
  public long MinTimeMs;
  private fixed byte Pad2[64];
}
```

And here is the `Add()` implementation with the TTAS spin lock:

```csharp

public void Add(int operation, int timeMs)
{
  fixed (OperationData* s = &_opsData[operation])
  {
    try
    {
       /* Begin: Simple TTAS */
       SpinWait sw = new SpinWait();
       while (Interlocked.CompareExchange(ref s->IsHeld, 1, 0) == 1)
       {
         while (Interlocked.Read(ref s->IsHeld) == 1) sw.SpinOnce();
       }
       /* End: Simple TTAS */
       s->TimeMs += timeMs;
       s->Count++;
       s->MaxTimeMs = Math.Max(timeMs, s->MaxTimeMs);
       s->MinTimeMs = Math.Min(timeMs, s->MinTimeMs);
    }
    finally
    {
      s->IsHeld = 0;
      Thread.MemoryBarrier();
    }
  }
}
```

## Benchmark: TTAS Spin Lock
Let’s see how my custom TTAS spinlock does against .NET’s own implementation:

![Graph](/assets/img/lock-spinlock-ttas.png)

As can be seen, the TTAS implementation is actually _faster_ than `lock()` at low concurrency. However, this graph is
getting a little crowded. Allow me to zoom in on just the .NET `SpinLock` and TTAS Spin lock:

![Graph](/assets/img/lock-spinlock-ttas-zoom.png)

Now _that_ is interesting isn’t it? While the TTAS is faster at low contention – it completely collapses under high
contention. it is clear that the .NET `SpinLock` has been designed to be scalable under highly contended scenarios.

# Interlock/Atomics Background
Advanced synchronisation structures like `lock()`, `SpinLock`, `Events` and `Conditional Variables` would be very difficult (if
not impossible) to implement without explicit support of atomic operations on the CPU itself.

The x86/x64 instruction set contains instructions that allow the compiler to guarantee that some operations will happen
atomically – in other words: They will either happen or not. For example, the following:

| x86 instruction          | Behaviour                                                                       |
|:-------------------------|:--------------------------------------------------------------------------------|
| `MOV`                    | Atomically read a word (But can be reordered unless `MFENCE`’d)                 |
| `MOV + MFENCE` or `XCHG` | Atomically write a word sized value                                             |
| `LOCK INCL/ADDL`         | Atomically add one or a value to a word                                         | 
| `CMPXCHG`                | Compare a word against another value. If they match, swap the word with another |

Programming with atomic operations is extremely difficult and error prone. However, for those brave enough, .NET exposes
atomics through the `System.Threading.Interlocked` static class. For those of you coding C++, you can refer to 
`std::atomic`.

# Implementation: Interlock
Using atomics, it is possible to implement the class without any synchronisation primitive at all. Here is what that
looks like:

First, we make sure the struct is padded to avoid false sharing:

```csharp
unsafe private struct OperationData
{
  private fixed byte Pad0[64];
  public long TimeMs;
  public long Count;
  public long MaxTimeMs;
  public long MinTimeMs;
  private fixed byte Pad1[64];
}
```
Second, we use atomics (aka: `Interlocked` in C#) to make sure we change the struct correctly:

```csharp
public void Add(int statistics, int timeMs)
{
  fixed (OperationData* s = &_opsData[statistics])
  {
    Interlocked.Add(ref s->TimeMs, timeMs);
    Interlocked.Add(ref s->Count, 1);

    long oldMinVal = Interlocked.Read(ref s->MinTimeMs);
    while (oldMinVal > timeMs) {
      oldMinVal = Interlocked.CompareExchange(ref s->MinTimeMs
                                                  , timeMs, oldMinVal);
    }

    long oldMaxVal = Interlocked.Read(ref s->MaxTimeMs);
    while (oldMaxVal < timeMs) {
          oldMaxVal = Interlocked.CompareExchange(ref s->MaxTimeMs
                                                  , timeMs, oldMaxVal);
    }
  }
}
```
Note that the `Interlocked.CompareExchange` (CPU instruction: `CMPXCHG`) often requires a loop to guarantee correctness.
You may be able to infer that this could lead to starvation if the some cores loop faster than others (and
you would be right).

What we have created here is a true wait free implementation (see: 
[Non Block Algorithm](http://en.wikipedia.org/wiki/Non-blocking_algorithm))

## Benchmark: Atomics/Interlock Implementation
Here is the wait free algorithm in action

![Graph](/assets/img/lock-atomics.png)

… Faster than the .NET `SpinLock` at low scale and just as scalable as we approach 
64 cores. 

Not quite as fast as the TTAS at low scale though. Why? The atomic instructions require a lock of a cache line 
(so other cores don’t update it). This is not free and costs _at_ _least_ in the order of tens of  CPU cycles, even when 
the cache line is uncontested. If you think about the TTAS implementation, only a single cache line lock is needed to 
acquire the lock – the `Interlocked.CompareExchange` in the spin lock. In the case of the purely atomic implementation, 
we need at least four locks: one to update each of the fields in the struct, potentially more than one for the min/max 
depending on whether we are racing against others.

# Summary
In this third part of the series, we have seen how even lightweight locks don’t scale well beyond a single core when we
compete for cache lines. There really is no such thing as a magic when it comes to synchronisation.

We have also seen how synchronisation methods have to carefully balance the cost of acquiring the lock with the
scalability of the lock. The .NET `SpinLock` and TTAS implementation illustrates this balancing act.

It seems we are lost here. It is clear that a single CPU core can do 90K operations every millisecond if we don’t have
any contention – yet even a moderate amount of contention breaks that scale of every implementation we have seen so far.
If we were to use an instrumentation framework using the data structures we have seen so far into a high
speed system - we would be paying a significant overhead to measure the system.

These numbers are pathetic aren't they? We have to get smarter…

Which is why you will be reading:

- [Part 4: Partitioned Locks](dotnet-sync-part4.md)