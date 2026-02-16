---
title: "Why are Databases so Hard to Make? - Logging to Disk"
date: "2024-06-23"
description: "Transaction logs. Why are they so important and why are they so hard to make?"
tags: 
  - "database"
  - "data-structure"
  - "performance"
  - "transaction-log"
---

We have previously seen that optimising database CPU usage requires a solid foundation in computer science and algorithms. To properly scale queries - you must master single threaded, classical algorithms as well as modern concurrency and high speed locking.

Today, we take a break from the heavy computer science algorithms and zoom into transaction logs - a crucial component of every database. Our journey is to the land of I/O and hardware knowledge.

On the surface, the problem we try to solve appears simple and straightforward. But at this point, you know that this isn't how we travel together.

# What is a Transaction Log used for?

A database, at least one you can trust with your data, provides the following guarantee (sorry NoSQL people):

> "If you send me a statement that changes data and I acknowledge that statement, whatever data you changed is now _safely on disk_"

The transaction log is the mechanism used to implement this guarantee. It is the data structure that has to safely write data to disk before we can say: "I acknowledge".

Once again, we return to Python as our instructional language. The interface we are interested in looks roughly like this:

```python
class LogEntry:
   def __init__(row_id: int, table: str, data: tuple):
      self.table = table
      self.row_id = row_id
      self.data = data

class TransactionLog:
  def __init__():
     self.log: list[LogEntry] = []

   def write(data: LogEntry):
      self.log.append(data)
```

What exactly goes into `data` depends on the operation you perform. For example, consider this `INSERT` statement:

```postgresql
INSERT INTO artist (k, first_name, last_name) 
VALUES (1, 'Nick', 'Cave')
```

If `k` was a `PRIMARY KEY` of `artist` the call to the log could be:

```python
the_log = TransactionLog()

the_log.write(LogEntry(1, "artist", ("Nick", "Cave")))
```

This should all be trivial so far - because we have not yet dealt with the "safely on disk" guarantee.

## Naive Safety

Let us modify the `TransactionLog` class to use a file for storing the data. For simplicity, let us assume our on-disk format of `LogEntry` is a comma separated file. In a high speed system, we would of course prefer something less "pythonic" (read: not as brain-dead).

```python
class LogEntry:
   def __init__(row_id: int, table: str, data: tuple):
      self.table = table
      self.row_id = row_id
      self.data = data
        
   def __str__():
      """On disk format"""
      return f"{self.table},{self.id},{self.data}"
       

class TransactionLog:
  def __init__():
     self.log: BufferedWriter = os.open("log_file.txt", "ab")

   def write(data: LogEntry):
      self.log.write(str(data))
```

The code we have written here appears so trivial that we should be able to reason about it.

Does this code guarantee that when I return from calling `write`, my data is safely on disk?

The answer is "no". To understand why, consider the type of `self.log`. It is a `BufferedWriter`. What does that buffer do?

The pioneers of operating system designs quickly realised that most programmers don't know how to reason about I/O. This is not surprising, because I/O nothing like CPU and RAM:

- The time it takes for I/O to return a result is huge compared to any CPU instruction
    - In the old days, I/O operations could 1000x that: 100ms for a single operation (and still do, if you dumb enough to use SAN)
    - That's hundred million CPU instructions waiting for a write. DRAM on the other hand, writes in about 100 cycles
    - Today, one I/O operation can take 100us, even 1000us. That is still millions of instructions
- Disks, unlike memory, are very bad at handling small writes
    - Data is typically written to disk in chunks of 4K or more.
    - DRAM uses 64B chunks
    - Today, a modern SSD prefers 256K - so the problem has gotten worse
- Doing I/O involves kernel time, interrupts, queue polling, context switching and interacting with filthy drivers written by esoteric wizards
    - This type of knowledge is out of reach to most junior programmers
    - The observable effect is that I/O, even when done asynchronously, costs a lot of CPU cycles
- In the 1990 steampunk universe, before TikTok rotted away the brains of programmers, we had something called "hard drives"
    - These devices were made of spinning metal platters containing magnetic charges - mechanical stuff
    - On these devices, if you wrote the next I/O adjacent to the previous one quickly enough - you could often gain 10x or even 100x faster write speeds
    - Optimising for this special write pattern (called "sequential I/O") is hard

The buffered write mechanism was put in place to hide all these complexities from programmers. What the mechanism does is to gather writes in memory until it has a enough data (typically >4K) to flush that write to disk in a single I/O operation. That way, you can write a tight Python loop appending a few bytes to a file in every iteration - and that write operation will be magically aggregated into fewer, much bigger writes. There is also a double buffer in place, so even when the disk is busy writing - you can still continue to append to the fiction that is the file... This makes files look a lot like memory - even though they are nothing like memory. Buffered writes are a useful fiction.

But what do you think happens if you get a power cut before that write buffer is flushed to disk?

Answer: The write you were supposed to guarantee is on disk... is gone... forever...

This is the point where junior programmers, and programmers who are senior but never had to think, will say things like: "But that event is very unlikely, because we have a uninterruptible power supply and the OS will have enough time to flush the buffer before it is gracefully shut down". They will then go on to declare that a total power cut situation (like someone tripping over a cable in the server room) is so unlikely that it is not "worth enough money to the business". Next they will be using an ORM and arguing for "eventual consistency" databases. They will add Kafka queues to their microservice architecture because "it makes things easier" - using the same line of reasoning about "lost transactions being unlikely". This is the kind of nonsense you learn on the internet, because you think that your CRUD application has to solve the same problems that FAANG companies have.

To those people I say: Would you like to take this risk if your medical database crashes just as your doctor added your fatal allergy to Penicillin into the medical record? How about that power loss event causing your bank to lose the transaction for the sweet, 100K USD bonus that was on the way into your account? What about the database in the control tower of your airport losing the records of an incoming plane queuing for its landing slot?

The guarantee matters - because it makes it simpler to reason about the actual state of the system.

SAN, Object Store and other idiotic ideas

Nothing ever changes in IT! Large fractions of our industry are no wiser than we were in 1970. We now have SSD on NVMe - and SSD is really, really fast. Almost as fast as memory. SSD is an incredible technology. But still, people insist on putting a network in between the disk and the machine that needs the disk. All in the name of "manageability". The result: slower I/O with bigger latency that is harder to reason about.

Remember SAN? The pain corporate drones inflict, echoes through eternity (EBS, EBS, EBS...)

## Actually implementing the Guarantee - First Attempt

The bright people who made buffered writes were smart enough to know that sometimes - you really need to know that write is on disk.

That is why file systems have a method called `flush()`. Flush will tell the buffered writer: "Don't return from `flush()` until the data in the buffer is _really_ on disk - even if that means you have to write a very small chunk".

This interface is available to us in Python. Our modified code is:

```python
class TransactionLog:
  def __init__():
     self.log: BufferedWriter = os.open("log_file.txt", "ab")

   def write(data: LogEntry):
      self.log.write(str(data))
      self.log.flush()  # I mean it, write that stuff!
```

This solves the problem (almost - read on) but it introduces a new one.

Remember I told you that disk writes takes hundreds of microseconds?

Consider a sample loop that we might find in some message queue based system (assume the existence of some `execute_sql` function below):

```python
q = Queue()
while not q.empty():
   item = q.pop()
   first_name = item["first_name"]
   last_name = item["last_name"]
   execute_sql(f"INSERT INTO artist (first_name, last_name) VALUES ('{first_name}', '{last_name')" 
```

The programmer of this loop actually uses a database to store data (kudos), which provides the guarantee we are trying to implement. Every single roundtrip to the database in the `execute_sql` function must go through a `flush` operation. This will cause a disk write - and we can assume this disk write takes 100 microseconds.

How fast can this loop go?

Assuming, for a laugh, that Python is infinitely fast and that running the Python codes takes zero time. Under that assumption, the fastest this loop can possibly go is:

- INSERTS / sec = 0.0001s / IO \* 1 IO / INSERT = 10000 INSERT/sec

That's not very fast is it? The CPU running this client should be able to pull off 10-100M iterations/sec - even in Python. By requiring a flush on every write - we have slowed down this consumer of the database. This is the point where junior Kafka "architects" open their mouth and spew their nonsense.

Why double quoted strings in Python are best!

Python is an interesting language. It allows you to do stupid things, ineffectively, in _many_ different ways. It is a diverse and inclusive language!

One of the the things Python does it to allow _both_ single quotes (`'`) and double quotes (`"`) for strings. Why does Python do this? Why do the gods punish us in this way and give two ways to do the same thing for no good reason? All we mortals can do is make use of this fickle nature of the evil gods.

You should prefer double quotes for your Python strings if you plan to do anything with databases. Why? Because all databases use single quotes for strings - which means that the database quoting will _not_ be your Python quoting. This makes f-strings easier to read because you don't have to escape quotes all the time.

I am not sure if SQLs choice of single quoted string is intentional or an accident. Most contemporary languages from those times (COBOL, Basic, Ada, Fortran) used double quoted strings. The designers of SQL must have known that languages would have to generate strings to interact with database and picking a quoting that is different from the languages consuming the databases must have made sense.

## Batching and Transactions - Have users help with the Guarantee

It turns out that we can still provide "the guarantee" while going much, much faster.

The first options open to us is to extend the interface of the log. Databases provide guarantees at the transaction level - not at the statement level.

We can introduce the idea of a transaction like this:

```python
class TransactionLog:
  def __init__():
     self.log: BufferedWriter = os.open("log_file.txt", "ab")
     self.transactions: dict(int, list[LogEntry]) = {}
  
  current_tx: int = 0

  def begin_transaction() -> int:
     self.current_tx += 1
     self.transactions[current_tx] = []
 
  def append_insert(tx_handle: int, data: LogEntry):
     self.transactions[tx_handle].append(str(data))
  
  def commit_transaction(tx_handle: int):
     for data in self.transactions[tx_handle]:
          self.log.write(data)
     self.log.flush()
     del self.transactions[handle] 
     
  def write(data:LogEntry):
     self.log.write(str(data))
     self.log.flush()  # I mean it, write that stuff!
```

This construct allows the consumer of the database (and by implication, the log) to do stuff like this:

```postgresql
BEGIN TRANSACTION;
INSERT INTO artits (first_name, last_name) VALUES ('Nick', 'Cave');
INSERT INTO artits (first_name, last_name) VALUES ('Leonard', 'Cohen');
INSERT INTO artits (first_name, last_name) VALUES ('Tom', 'Waits');
COMMIT TRANSACTION;
```

This says to the database: You are allowed to buffer up all the data modifications inside the block demarcated by `BEGIN TRANSACTION` / `COMMIT TRANSACTION` as long as all the writes either happen - or they don't.

Notice how this reduces the amount of times we must call `flush()`

I leave it as an exercise for the reader to perform the trivial task of making your message queue or ETL job go 1000x faster with this little trick.

## Concurrency and Delaying - Super-scaling the Guarantee

We have so far been trying to reduce `flush()` operations by relying on the single threaded consumers of the database to batch operations for us. However, database play another trick when concurrency is available.

Consider two clients of the database both running this loop:

```python
while True:
   execute_sql(f"INSERT INTO artist (first_name, last_name) VALUES ('{v1}', '{v2}')" 
```

These inserts eventually have to hit the `write()` call in `TransactionLog`. Each of them will incur the cost of a `flush()`.

Database are good at concurrency (well, unless you use Postgres). Highly concurrent `INSERT` activity unlocks a certain kind super-scale. Consider this alternative implementation of the `write` method

```python
class TransactionLog:
  def __init__():
     self.log: BufferedWriter = os.open("log_file.txt", "ab")
  
  gather_buffer: list[LogEntry] = []
  
  lock = threading.Lock()
  
  def flush_buffer()
    for data in self.gather_buffer:   
      self.log.write(data)
    self.gather_buffer = [] # reset the buffer
    self.log.flush()


   def write(data: LogEntry):
     entry = str(data)
     target_flush_size = 8 # Some number we consider optimal for the disk
     with self.lock:
       self.gather_buffer.append(entry)
       if len(gather_buffer) == target_flush_size:
           # I filled the buffer
         self.flush_buffer()
         return
       # I didn't fill the buffer, wait and then force it
     time.sleep(0.5)
     with self.lock:
       self.flush_buffer()
```

This is not a particularly good implementation of this idea (async programming comes to mind, so does smarter log usage). But hopefully, this simplified version will be easy to understand.

If enough insert activity happens in a 500ms interval - we can save 8x on the number of calls to `flush`. This is massive in terms of performance.

It also has a downside. Namely that if you are the only one writing to the buffer - 7 out of 8 times, you will hit that `time.sleep` and your insert will now take longer than it would have, if we didn't optimise for concurrency. Clever use of concurrent programming can minimise this effect.

At this point, I hope you can see an apparently trivial problem like a transaction log is actually an interesting concurrency and throughput problem to solve.

## Actually implementing the Guarantee - I/O atomicity

Readers familiar with how I/O system _really_ work will have noticed a hand waving, implicit assumption I have been making. Sorry!

Consider again the two optimisation loops we have seen:

```python
# Transaction commit loop
def commit_transaction(tx_handle: int):
   for data in self.transactions[tx_handle]:
      self.log.write(data)
   self.log.flush()
   del self.transactions[handle]

# Concurrency loop
def flush_buffer()
  for data in self.gather_buffer:   
    self.log.write(data)
  self.gather_buffer = []
  self.log.flush()
```

Remember I told you that power loss can happen at any time? That includes the exact time the operating system was in the the `flush()` code.

What must happen inside the OS when we call `flush()`? Let us engage our machine empathy.

1) We have provided some memory to the OS in the buffered I/O interface
2) That memory must be written to disk
3) Disks present themselves as a large array of blocks (typically in the range of 4K to 256K) - adding up to the the total size of the disk
4) The OS must take the memory we provided, break it into blocks suitable for the disk and then write each of these blocks 
5) The disk must accept this block and either write it or not write it (failing the I/O and telling the OS to retry if the write did not succeed)
6) Once all writes is done, the OS must return control to us - effectively ending the `flush()` call

What happens if we lose power in the middle of step 4? What is state of the disk if we are half way through writing the buffer when we crash? Will we have a partial transaction written to disk? Which transaction end sup on disk will also depend on how large each transaction is. And on the _order_ the blocks were written in.

We are faced with an implicit question: What is the maximum block size a disk will handle where that block is either fully written or not written at all? What is the resulting block if a disk loses power in the middle of writing a block? Such a partially written disk blocks (which do occur in real life) are called "torn writes". Good transaction log implementation must deal with this anomaly.

Because of the above, relying on `flush()` to guarantee consistency on disk is normally a bad idea. High speed database typically call the I/O async interface directly and manage the buffering themselves in a way that truly provides the guarantee.

The exact details of these advanced implementations are out of scope for what I can type up today. There is a really good hobby project to implement a high speed transaction log for me - once I find some spare time.

# Summary

I could keep going, but it is midsummer here. There is beer to be drunk and cigars to be smoked. What have we learned today?

- Transaction logs are central to the strong, easy to reason about, guarantees that databases provide to their consumers
- While they appear simple on the surface, they are in fact a complicated data structures with many opportunities for optimisation
- Complex tradeoffs must made requiring understanding of OS and hardware internals:
    - Concurrency vs Latency of single threaded writers
    - Batching of transactions 
    - Atomicity of disk writes
    - Reducing the number of calls to `flush()` while still providing strong guarantees of consistency

Happy midsummer everyone!
