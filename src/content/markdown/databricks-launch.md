---
title: First Databricks in the Arena and more updates
publish_date: 2026-03-04
---

Today I am putting Databricks in the Arena.

Getting there has been... difficult... 

I finally found a way to get estimates and actual row counts out
of Databricks. 
Since Databricks uses Spark for planning, we can also view this
the results as a proxy for what Spark can do.

A blog will go out on [Floe](https://www.floedb.ai) about the 
technical details of how to get these query plans out of Databricks.

And that's not all for today...

## LLM assistance and contributing

I have been adding various context documents to `dbprove` to
help LLMs do a better job writing drivers and improving the
tool.

Codex does quite well with the repo now.

It is now easier than ever to contribute to `dbprove`.
With the drivers available, there is enough information for the LLM
to do a decent job at writing new drivers (with a bit of adult supervision).
If you want to contribute a driver or just provide a tuned docker
image you would like to see tested: get in touch! 
You know where to find me.


## Docker Containers for `dbprove`

The engines that can be run locally now have docker containers
in the `<root>/docker` folder in `dbprove`.

There is a launch script that simplifies rerunning `dbprove`
if you want to do your own testing.


## General Fixes and Improvement

- Q15 was accidentally a copy of Q14. 
- Split table scan into scan and seek component (columnstore access counts as scan)
- Major updates to various README.md files to assist the agents if you want to use them

## Postgres 18

- Postgres runs have been updated to Postgres 18
- Fixed some parsing issues with the handling of subplans
- Added some supporting indexes on foreign keys that are still inside the rules of what TPC-H allows.

## SQL Server 2022

- I have tweaked column stores indexes so we get better bloom filtering. 
  - This causes a series of plan changes and is still within the rules of what you can do with TPC-H.
- SQL Server runs have been updated to SQL Server 2022 Developer Edition
- MSODBC and the Bulk Api now compiles on OSX ARM (and is MUCH faster)
- Added a docker container with Linux based SQL Server so you can do your own benchmarking with it.


## ClickHouse

ClickHouse remains the ugly child in the EXPLAIN plan family.
The parsing code is seriously messy even after a bit of cleaning.

But the real challenge is getting actual/expected row values out of the plan. 
Once ClickHouse supports this, I will update the parser.

- Added docker container for ClickHouse.
- Greatly improved the plan parser handling subplans better (they are a mess)
- Upgraded ClickHouse runs to version 26
- Notice that Clickhouse actually returns a different result for Q13  
  due to the way it handles NULL (see: `join_use_null`) in the [Docs](https://clickhouse.com/docs/operations/settings/settings)
  - In a future run, I may set the flag to make sure correct results are
    returned

## Trino

- Added Trino Container (make a guess on what I am working on)

## TPC-H Query Analysis

The TPC-H query analysis will first be published on the 
[Database Doctor](https://www.database-doctor.com) site and then a summary
will be added here to help you interpret plans (without my grumpy ravings).

- Added queries up to Q11 analysis to this site
