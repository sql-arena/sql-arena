---
title: "SQL Deficiency Syndrome: Born without Joins"
date: "2025-09-25"
tags: 
  - "SDS"
  - "sql"
---

There are some in our industry who can read a schema and instantly see the joins. 
They dream in sets, write SQL queries routinely and reach for window functions without hesitation.

And then, there are the others...

For them, the problem isn’t laziness, or stubbornness, or lack of training. 
Tragically, they were born this way.

They suffer from SQL Deficiency Syndrome.

# SQL Deficiency Syndrome
SQL Deficiency Syndrome (SDS) is a genetic, inherited condition.
It robs otherwise capable minds of the ability to think in sets.

SDS Sufferers will:

- Write loops where a `JOIN` would suffice.
- Sort arrays manually instead of trusting `ORDER BY`.
- Build “pipelines” of Python code that read like treatment plans — symptomatic relief at best.
- Obsessively create repository patterns and cause code duplication for others — when a simple SQL statement would suffice.
- Deny the need for databases and think JSON is a storage format 

These unfortunate souls are not to blame. 
Their DNA lacks the sequences that encode relational logic.

The recently updated [DRM-SQL-5 diagnostic criteria](/about/dsm-sds.html) has spread awareness of this debilitating 
condition.

## The Denial of SDS: "We Don't Need SQL Any more"
One of the cruelest aspects of SQL Deficiency Syndrome is the denial. 
Many sufferers are unaware of their condition. 
They lash out — not at their tools, but at the very concept of databases.

They say things like:

- “We don’t use databases, we just stream everything into Kafka and write Python and Java.”
- “ORMs make SQL obsolete and allows me to change databases when I want to.”
- “We store our data in Parquet files on S3 and use Iceberg to handle concurrency.”
- “Who needs schemas when you have JSON?”
- "We should just use a vast, pre-joined table."
- "Eventual consistency is good enough"

These are cries for help! 

They’ve seen `SELECT` before. 
They once copied a `JOIN` from a ChatGPT prompt.
But hand them a schema diagram or ask for a correlated subquery?
Watch the panic set in. 
They can't write, nor comprehend SQL!

They build dashboards using ten nested `.filter()` calls and wonder why it is slow.
They hand-craft data pipelines like medieval scribes copying scrolls — and call it “modern data engineering.”

While they're innocent in their affliction, the queries and data models they leave behind aren't.
The damage they do to themselves and our industry is real.

# Join us in the Fight Against SDS

While SDS is in your genes - we believe that sufferers can overcome the condition through education. There is hope!

That’s why we have founded **Joins Without Borders** - a charitable initiative dedicated to translating SQL and 
databases into terms the afflicted can understand.

Your donations on [Patreon](https://patreon.com/cw/databasedoctor) will go towards curing SDS through education,
one blog post at a time. 
We aspire to bring about a world where no child will ever have to hear the term "NoSQL" again.

Your funds help support the creation of:

- Annotated query breakdowns.
- Explanations of databases in a language that SDS sufferers can understand (Python, if we have to).
- Real-world join order investigations.
- Query plan Rehabilitation.
- Exposure and desensitisation to complex queries under supervised conditions.

This is not mockery — it is mercy.

Every coin you offer brings a junior analyst one step closer to understanding why that `JOIN` is returning 
duplicates. 
It helps sufferers overcome fear of normalising data and teach them coping mechanisms while learning SQL.
Eventually, it will free their minds to fully understand that they don't have to suffer complex Python pipelines — that
SQL can be their redemption. 
Our help allows them to once again become productive members of the IT community.

Through your generous support on Patreon, we can bring clarity to those whom genetics has failed.

## Your Donation can Change a Query Plan - Support Tiers
SQL Deficiency Syndrome is tragic, but it is not hopeless.
Those born without the ability to think in joins and sets aren't guilty of their affliction. 
They simply drew the short straw in the genetic lottery.

But you — yes, you — can help.

We provide four support tiers:

- **`SELECT` Scribe**: Every query begins with `SELECT`. You help provide the first building blocks of hope.
- **`WHERE` Warrior**: Help filter out the confusion for the afflicted.
- **`JOIN` Journeyman**: Bring people together. 
  Support diagrams and working examples that gently introduce the concept of relational thinking to SDS sufferers.
- **`WINDOW` Wizard**: You open new perspectives.
  By funding detailed explanations of window functions, you give the afflicted their first glimpse of life beyond Excel 
  and Python.

Please give generously at our [Patreon Page](https://patreon.com/cw/databasedoctor)

