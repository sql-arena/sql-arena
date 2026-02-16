---
title: "Iceberg, The Right Idea - The Wrong Spec - Part 1 of 2: History"
date: "2025-7-6"
tags:
- "database"
- "iceberg"
- "data-structures"
- "se"
---

Iceberg: The great unifying vision finally allowing us to escape the vendor lock-in of our database engines. One
table and metadata format to find them ... And in the darkness bind them!

I love the idea! But I loathe the spec. 

In this post, I’ll explain why you should be deeply skeptical of Iceberg as it exists today. I’ll argue that its design 
flaws are so severe, we're watching a new HADOOP-style disaster unfold in real time.

My reaction is visceral, but not simple. It requires a historical lens, which is why we must split this into a historical
and a current day part. (Also, splitting it gives LinkedIn followers time to bring out their pitchforks)

# Standardisation is Great
Agreed upon standards, is one of the most powerful ideas in our industry. Back when computers
were still young - everyone invented their own file and storage formats. Travel with me to the early days of the 
internet, the late 1980s. I hope we will learn from history together.

It's 1980: Nobody can agree on what character set encoding to use, Windows uses DOS Codepages, Unix 
uses a mixture of ASCII and ISO-8859. Mainframes are still around and use EBCDIC. Macs are using MacRoman. It's madness! 
UTF-8 is yet to be invented - but when it does - Windows will not adapt it (and does not to this day).

And that's just how we encode characters. Don't get me started on date/time (Unix Epoch anyone?). We still have not 
agreed on what a newline should look like. The human effort lost dealing with these incompatibilities blows you mind away.

Did we learn our lesson? Oh no, very recently we re-invented Yet Another Markup Language to replace the gazillion ones 
we already have. 

At least these standards are documented. We can, with some effort, learn how to read them and translate from one to 
the other. It is the vendor specific stuff that really nags at us.

Of course, all this encoded data had to be stored somewhere - enter filesystems.

# The Problem with File systems
Despite there being lots of file systems to choose from - they all share a common structure. The file system itself is 
a tree, it has files and directories. Files can be written, read at offsets, appended, deleted, truncated 
and renamed. Until Object Stores come around - we take it for granted that this is the way computers represent storage.

But apart from the POSIX standard, which was never fully followed by anyone, we never standardised 
on file systems. 

It's around 1990: Windows is using FAT file systems, Unix is on FFS, Mac on MFS and HFS. Everyone is reinventing the wheel.
None of these file systems survive, but they establish the basic terminology.

Pretty much every database you have ever used - and all the ones you have not - use a few files to store all the 
data inside the database. In a way, databases ignore the filesystem. Why is that? Why are they not just using one file per 
row of each table? Are all these old programmers who built the databases that run our civilisation just idiots who 
have not seen the light?

## Lots of files = lots of metadata
First of all, file systems are not designed to store millions or billions of files. The metadata overhead of traversing 
the files is gigantic if you do. Some of this can be circumvented by being clever about the directory hierarchy you use.

A balance has to be struck between the number of files and the metadata overhead of keeping track of them. This is 
why databases pack multiple rows, even multiple tables, into a single file. Databases also need more metadata than the 
usual attributes available in file systems - because we are tracking history of data, not just the current state of it.

## Rows vs Blocks - The Impedance Mismatch
Second, in a database you are presented with an abstraction of rows, not files. Rows represent measurements of the world 
around us. They are *not* bound by any rule that says they must have sizes which are nice powers of two. File systems, 
on the other hand, nearly always address storage in powers of two "chunks". They do this because it reduces the metadata overhead
of tracking what space is in use. Most disks (including SSD and NVMe storage) organise their internal storage in very much
the same, block based layout. There is a built-in, impedance mismatch between real world data and how storage
actually works. 

Writing and reading in powers of two is significantly faster - and makes storage media significantly longer than if you
access data in in arbitrary sizes. Aggregating writes of many rows to a few disk block also improves the speed you
get from your expensive disk system. Databases have extensive algorithms optimising disk reads to be powers of two, 
while still presenting the illusion to the user of rows being of arbitrary size.

## Fragmentation 
Third, when you delete a file in a file system, that space must be reclaimed and given back to the operating system. 
This space reclaim either has to happen on the hot path - which makes delete operations expensive - or it has to be done
as a background task - which makes it difficult to predict what the overall system performance will be. If data changes 
fast (for example by reloading or replacing tables), we must also make sure the cleanup of free space can keep up with 
the creation of new space. This is exactly the same problem you have to solve if you do garbage collection in Java/C#.
It is also the reason memory allocators are so difficult to write. 

Fragmentation is the general term for this. As fragmentation grows, performance falls apart. 

## Concurrency and locking
Fourth, file system are not good at handling concurrent access to files. If two people want to write to the same
data - you need some kind of coordination mechanism that isn't provided by the file system. Some files systems 
(For example NTFS) allow you to lock entire files - but that granularity is insufficient for high concurrency writing. 

We often want to change individual rows, not entire files. Additional locking semantics, shared read/write locks 
and snapshots, are required when we run at high concurrency. A database will provide a fine granularity abstraction that
will maximise concurrency and minimise contention.

There are ways to work around this lack of locking by creating *new* files instead of changing existing files. 
But this comes with two drawbacks:

1) If two processes want to make the change the same data at the same time, they will both create new files. 
   But, one of them has to *win* and become the writer. This means the other process with have to retry
2) Creating new files only to merge them into the existing files creates fragmentation - 
   

Ad 1) Databases solve the conflict problem by using snapshots and locks. Often, these snapshots are present in memory, 
which means that we can consolidate the changes in memory before writing. We can also use locks to nicely queue up 
changes, which is vastly superior to asking one writer to retry, particularly if the write is large or contention is high.

Ad 2) As concurrency and contention on files grows, the amount of new files created quickly spirals out of control
sending you into infinite fragmentation hell. Note that the fragmentation problem occurs both for the one who won 
the write and the ones who lost it and is now retrying.

Retrying writes is a terrible design decision that databases try to avoid whenever they can.

-  "Retry as a coordination mechanism is bad!" 

This is is true for computer science in general - it is not a database specific observation.

## Atomicity
Fifth, file system are very poor at atomic operations. Let us say I wanted to perform this very, common operation: 

"Change file `bank_balance` and `bank_transaction` at the same time. And make sure either *both* changes occur 
or *neither* change occurs."

File system are *terrible* at atomic operation between files. Databases barely blink to solve it - it's routine and 
has been solved since 1970, using hardened and battle tested algorithms. Interestingly, Object Stores 
are even *worse* at solving this than traditional file systems at this.

## Temp Space write and Quick Deletion
Sixth, the operating system on your device uses something called a "page file" or "swap file". This file exists to 
provide an abstraction of nearly infinite memory. It's worth noting that the operating system typically uses a 
single file for this purpose. Isn't that strange, if having lots of files on object store is so great?

The page file is temporary in nature - large chunks of space have to be freeable quickly when applications shut down. 
Large allocations have to be fast too, when space is suddenly needed (For example, when your Outlook client starts). 

Databases need to solve a similar problem: They need temporary space to handle large joins, sorts or aggregates that 
don't fit in memory. Interestingly, databases do *not* use a lots of files to do this - they instead rely on specially 
optimised abstractions that provide high speed, temporary space. Again, the file system just isn't good enough for this
purpose.

## Custom, highly optimised, Compression
Seventh, There is no such thing as compression algorithm to rule them all. While most filesystems support some generic
algorithms - that compression is often expensive and not particularly efficient when you read the data.

Databases, on the other hand, can tailor their compression to the data they store. Most databases have multiple compression
algorithms available to them. For example, they may use bit-packing for integers and LZ4 for strings. For data stored
in columnar format - they can use run length encoding. 

The compression algorithms are often highly optimised and carefully balance speed with compression ratio. Database 
compression also allow you to "sneak peek" at the contents of compressed rows (via metadata) before paying the cost 
required to decompress them.

## Check Summing and bit-rot
Eighth, file systems are not very good at detecting bit-rot. When you have enough data, it is almost inevitable that
some of that data will be corrupted. Storage media is very reliable, but not so reliable that you can store petabytes
of data and just expect it to always be in the same state you saved it.

Database storage engines knows this - and most of them have features built exactly to counter this effect. Periodically
revisiting data and using checksums and reed-solomon codes to detect and fix bit-rot

## The Space Management Problem
To summarise what we have learned so far: Databases are not just SQL engines, they are storage engines that go to
great lengths to solve a series of problems that file system do not have good solutions to. They keep fragmentation 
under control, implement abstractions that fix the impedance mismatch between rows and blocks, they provide 
concurrency, atomicity and high speed temporary storage. 

For convenience, let us refer to this as solving "The Space Management Problem". 

### Footnote: Btrfs and ZFS
It is worth noting that some file system have attempted to imitate databases and learn tricka from them. 
Like database developers, file system developers understand that these are real world issues that has to be addressed - 
if you want to move beyond the status of toy systems. `Btrfs` and `ZFS` are two good examples of attempting to deal 
with fragmentation in a more predictable way. Unfortunately, these initiatives never entered the mainstream.

## None of this is New and None of this is Solved by the Cloud
The problems I have outlined above are not new. They have been known for decades. They have known solutions, hard 
solutions that have taken millions of hours of human effort to get right. Relational databases represent the solution 
to these problems and it's one of the reasons they are still around. Human civilisation runs on relational databases, 
not just because they speak SQL, but because they are better abstractions than file system for storing data from the 
real world.

None of that has changed with the advent of the cloud - it has gotten harder - not easier to deal with this.

## Locking you into Object Storage
Have you ever wondered why your laptop does not have an HTTP interface for storing the files you use to run the operating
system? You know, just like the cloud? Why are we not all running object storage on our phone and every device in the house?

First, let's ponder why object stores exist in the first place. 

As we talked about earlier - there are a great many  file systems to choose from. All of them very similar, yet with 
their own quirks and features. Underneath the file system you have a block device - the abstraction your SSD or hard 
drive presents to your operating system. Block devices have protocols too, and those protocols have been 
around for decades: SCSI, ATA, IDE, NVMe, SAS. Standards for sharing these devices over the network, essentially 
creating remote file systems, have been around almost as long: NFS, SMB, CIFS, iSCSI to name but a few.

In other words, block level storage - the stuff you are familiar with from your laptop and every device in your house 
... is a solved problem. The actual protocol for talking to remote storage can be tricky to implement. But once it has 
been implemented, it provides a great deal of convenience and flexibility.

Why on earth did cloud vendors then switch to Object Storage with an HTTP interface? And if it is such a good idea, why
isn't everyone using it? I have two facts, and two theories.

**Fact 1**: Object Storage *sucks*! Like the fax machine, it is a civilisational step backwards - a sort of "dis-invention". 
Everything can speak HTTP - the protocol Object Storage uses. But everyone can speak block storage too! HTTP is
not a very good protocol for high speed modification of data. It is particularly bad if you must 
change a lot of small things quickly. HTTP adds latency, it adds overhead, it makes clients really
complicated when you desire speed and concurrency.  HTTP over TCP is also very hard to scale when you need lots and 
high read speed - because a single TCP pipe just isn't fast enough on most implementations. And once you start to multiplexing
over HTTP and having to deal with retries - you are in for a world of pain ...

**Fact 2**: You can get away with being pretty stupid if you only implement scalable object storage. Implemeting
large, distributed file systems takes real brains and effort. Even at scale, Object Storage, because it is so overly 
simple - is just easier to run and maintain than a block based file system. Unfortunately, you are shifting the 
complexity burden to the clients consuming it: It is a *lot* harder to talk to Object Stores in any serious manner than 
it is to talk to block based file system. Dealing with the connection management, backoffs and retries required to get 
good speed out of S3 is needlessly complex. But who cares, it's the customer who pays the price - not the cloud vendor!

**Theory 1**: Cloud vendors embraced Object Storage because it allows them to overcharge customers for block based storage.
EBS is stupidly expensive compared to S3. Not because it has to be, but because Amazon wants to charge you for convenience
and simplicity - or lock you into their S3 ecosystem if you don't pay up.

**Theory 2**: Cloud vendors further advanced the Object Storage model because it allowed them to derail the conversation 
customers were already having with SAN vendors. SAN, for those of you who don't remember, is block based, networked storage.
The SAN market was dominated by a few vendors: HP, EMC, IBM and Hitachi. These companies were inflexible, expensive
and terrible implementors of block based storage. But like so many old IT vendors, they were deeply embedded into 
the C-level at their customers. By introducing Object Storage, cloud vendors (back then, the incumbents) could say: 
"It's the technology that is wrong and these vendors are dinosaurs.". The latter was true, the former was not. By 
telling a big lie embedded in a truth, the cloud vendors channelled an old saying by another wannabe word dominator (whose
name doesn't deserve quoting):

> "In the big lie there is always a certain force of credibility"

Whether you like it or not - if you bought the big, fat lie of the cloud - you are now stuck with Object Storage

# The Problem with Databases and their Storage Engines
Our historical journey has now taken us somewhere around the late 1990s to early 2000s. A crude summary of the 
world at this point of history is:

- Linux and Windows are emerging as the dominant operating systems with `NTFS`, `XFS` and `EXT` as their file system
- Steve Jobs has returned to Apple and his reality distortion field and incredible drive is giving birth to OSX
- Storage at scale is largely dominated by the SAN vendors (IBM, HP, EMC, Hitachi)
- Databases have largely solved the "Space Management Problem" and the large vendors are dominating the market (Oracle, 
  DB2, SQL Server, Teradata)
- The open source databases are still struggling to compete and are not considered "serious" alternatives to enterprise
  offerings from the big players.
- The cloud is still an experimental dream and Bezos is still not able to buy entire countries with his wealth
- If you want a server, you buy it from HP, Dell or IBM. And if you are poor, you buy it from SuperMicro
- HTTP and HTML is already the de-facto standard for web and XML is the most commonly used interchange format

Something quite terrible is going on in the world of databases at this time in history. Because "The Space Management 
Problem" is now solved by the large vendors - they are charging their customers a lot of money for that solution. Oracle
in particular are really squeezing customers on cost. And Microsoft, always the ones to copy the trailblazers, are learning 
how to squeeze too.

There is nowhere to run! Once your data is inside Oracle, you need special tools to get it out again. Oracle's
client driver is terrible at extracting data OUT of the database (does this remind you of something in your cloud?).

If you are one of the poor soul who bought SAP - your C-staff is in a permanent state of Stockholm Syndrome. 
You are locked in, and you are paying a lot of money for the privilege.

This is a highly undesirable state of affairs if you are a customer. And the customers will remember this time in history.

## ODBC Emerges
Around the mid 90'ies, the idea of having an open standard for talking with databases emerge. ODBC is born, and it becomes
the de-facto API provided by all database vendors. It is now possible to write applications that can talk to *any* 
database (if you are careful with your code). 

Unfortunately, ODBC is not a storage format, it is client protocol. It's also a protocol designed by committee and 
therefore too generic, overly complicated and just plain clunky. It also has terrible performance. 
Take a note of this observation and remember it when you read the second part of this blog.

You can do wonderful things with ODBC, merging data from multiple sources into a single database. That means you
can centralise your reporting and analytics. You can copy data into special, optimised databases engines who make 
different tradeoffs when solving "The Space Management Problem". 

It's 2005 and the age of Data Warehousing is upon us. An entire industry is born around merging all your 
data into a single place, then running analytics on it. Vendors like Cognos, Vertica, Netezza, Greenplum, ParAccel 
and others find a market. Meanwhile, the big old database vendors have no idea what is about to hit them.

From the customer's perspective, is this real progress? Are we just shifting the lock-in to new places? Data is 
still inside vendor specific storage formats. It has gotten a little easier to get it out again (via ODBC). 
But, the fundamental problem remains: If you are a vendor who has solved the "Space Management Problem" - you get to 
hold your customer's data hostage in your storage format.

### Footnote: JDBC and ADO
Of course, Java programmers, pity their soul, have to be special. They had to invent JDBC.

Microsoft, ever the opportunist and (like me) haters of Java, made its own version of ODBC called ADO.NET. But all of 
these were variations on the theme: Let us open up the client side, but keep the server side closed.

# The Cloud and Cloud Analytics
Around 2005, the database market reached a stalemate. Getting servers up and running takes months, because HP and 
Dell have convinced C-staff that they need to buy expensive, custom hardware to run databases. ITIL and other processes 
completely kills the agility of programmers - who are now trapped in endless meetings and change requests. You need to talk 
to a network specialist, a storage specialist, some dude racking servers, an operating system specialist and a firewall 
person *just* to get your application up an running. And then there are those pesky DBA types who "knows stuff" 
about databases that you also have to deal with (thank goodness we have ORMs so we can defer that problem until it is
too late to solve it).

There are so many checks and balances that it's very hard to get anything done. Is infrastructure really *that*
hard? Do we *really* need specialists for every single layer of the stack? This hyper specialisations into silos of
competence is killing the industry.

The cloud, in the meantime, has been slowly emerging, silently building out its infrastructure - craving dominance 
over all life. 

One of the most brilliant marketing campaigns in the history of IT becomes mainstream around 2010. Best exemplified
by this idea:

> "When electricity first came to factories, every factory had its own generator. 
> But eventually that didn't make any sense, because everyone could draw electricity off the grid"
>
> [Mark Adreessen in Wired Magazine, 2012](https://www.wired.com/2012/04/ff-andreessen/)
> 

Can we just reflect on the sheer hubris of that statement for a moment? 

We live in a world where Germany is addicted to Russian gas, Hungary needs spare part for their nuclear power plants 
from Putin, Oil comes from a war torn Middle East. The US is run by a raging narcissist who has the cloud vendors 
in his pocket and whose current idea of geopolitical strategy is determined by what information diet he had for breakfast 
this morning. 

Perhaps have some autonomy over your own power grid and infrastructure isn't that bad after all?

## Cloud Analytics and Caching
We already spoke about the motivations cloud vendors have for pushing Object Storage. 

Creativity is often midwifed by scarcity. Since we are all stuck with cloud storage that sucks, we need to find ways to
make it work. There is a silver lining here...

Fortunately for us, The Cloud Gods, in their infinite generosity, have provided us mortals with ephemeral storage at a 
price that is only slightly higher than if you racked it ourselves. Of course, for such great privilege - you *do* have 
to live with the fact that when power is lost - so is your ephemeral storage (hint in the name). Of course, this
also happens if your EC2 instance randomly reboots - but that's now *your* problem - not Amazon's (did you read EULA?). 

With a generous helping of caches we can provide the illusion of high speed data access (As long as we only read). In fact,
with heroic engineering we can *almost* make the cloud look like a real database. The cloud vendors themselves proved 
that this was possible with BigQuery, RedShift and whatever cloud analytics platform Microsoft currently is reinventing. 
Fortunately, the cloud vendors had gotten fat and lazy from their big, dirty profits. They dropped the ball on this one. 
We now have DataBricks and Snowflake largely dominating the cloud analytics market using the "ephemeral storage on top 
of Object Storage" database architecture. Several other vendors have risen to challenge them: Starburst, Yellowbrick, 
Dremio and recently Clickhouse with their cloud offering, to name a few. Our journey has taken us to the recent past, 
somewhere around 2018.

And everyone is now being forced down a new road...

## Parquet: The Open and standardised Data Format
The year of our Facebook overload 2013: From the dumpster fire that is HADOOP, a new data format
rose as a phoenix from the ashes: Parquet. Previously, we had CSV (which never got fully standardised, 
see: [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) and AVRO. But Parquet arrived at the right time when our need was greatest.

Parquet is not perfect. Its compression sometimes leaves a bit to be desired. But it *is* a standard and it *is* open. More
importantly, it is good enough for the use case we care about: Storing analytical data.

Since Parquet is just "files on storage" and not a closed source database engine, you can have multiple vendors reading 
the same data - without having to copy it (except of course, the copy you store in those pesky caches). There is this 
problem about lots of files not working very well at scale - more about that later.

## Metadata - That really hard, Small Data Problem 
Remember how we talked about keeping track of where data is, and what state it is currently in? 

Solving "Space Management Problem" requires us to keeping track of *where* stuff is, *what* it is (DDL basically)
and whether it needs some defragmentation soon. Of course, you also need to run that defragmentation, which again 
changes where the data is.

Data becomes big by changing - it wouldn't be big data if it didn't. This sounds so trivial that it should not 
need saying. But observing the nonsense going on at LinkedIn these days, it is probably good to ground ourselves in this 
truth.

If data changes, even if you only append new rows, metadata must change too. And whenever we access data, we must
do so via metadata (if not, we can't find the data). That means we need metadata to be:

- Fast to read, write and overwrite
- Predictable under sustained load
- Atomically consistent so we can implement transactions across tables
- Scalable, so metadata data does not become the bottleneck as we change data
- Easy to defragment continuously, so its performance does not degrade over time
- Very good at handling lots of small changes (since each metadata change is tiny compared to the data it points at)
- Queryable, even with complex queries. So you can find your data again if you have the metadata. Its almost as if we 
  need it be... "indexed"?

You will notice that Object Storage is unique *unsuited* for this use case. If only we had a technology that could 
handle this use case?

### How Big is Metadata?
It is also worth noting that metadata is several orders of magnitude smaller than the data it points at. Particularly if
we are talking about analytical data.

A single Parquet file, in a big data system, is typically hundreds of MB. The metadata pointing at that file
is in the order of 100 Bytes. We are talking about 6 orders of magnitude difference!

Example: Imagine a moderately large Data Lake - 10PB of real data. If we use our "6 orders of magnitude" 
rule of thumb, the metadata for such a Data Lake is:

```
Data: 
10PB = 10_000_000_000_000_000B

Metadata:
10TB =         10_000_000_000B

```
A 10TB database, while not trivial to manage, is doable with a single server. You don't even need
to scale out. You could, if you wanted to - there are open source database for that too.

A 100TB data lake (requiring 100GB of metadata) could probably have it metadata served up by an iPad. That pays for 
itself after about 2-3 days of running with current cloud prices.

Metadata, even in gigantic systems, is small.

## The Rise of Open Databases
We have been talking about the various ways Cloud Vendors have disrupted the industry (and I don't mean that in the
complimentary way it is normally used). But good things happened while this was going on.

PostgreSQL had been around for a while. But it had, until around 2010, been considered a "toy" database. Sure, it has 
its problems (many of which I have complained about on this site). But it is undeniably "open" in every sense of that 
word.

Around 2015, probably helped by Oracle's amateur takeover of MySQL, Postgres shed its "toy" label and became a serious
contender to the big players. If you put data into PostgreSQL, you can *always* get it out - 
without having to talk to a vendor. Nobody can prevent you from running your own PostgreSQL server, modifying its source 
code, or just reading its binary data directly. You can deploy as many PostgreSQL as you like without some database
vendor calling an audit on you... Truly open software ...


# Summary
It is time to take a break before the millennials lose their patience. This blog is already too long.

What have we learned from history at this point?

- Lock-in at any layer of the stack is bad. Openness is table stakes
- Object Storage is technically terrible - but is in entrenched
- The Space Management Problem is solved - just not by object storage
- Parquet is an open, viable format for analytical data
- Truly open databases exist, are viable and practically free to run
- Metadata must not become the bottleneck in a large systems - we *must* create designs that make sure it is not

In the next part of this blog, I will finally talk about why Iceberg isn't a serious solution to the metadata problem. 

See you soon... Commentary on LinkedIn welcome!

Now go read the [second part](iceberg-is-wrong-2.md)
