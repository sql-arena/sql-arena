---
title: First DataFusion in the Arena
publish_date: 2026-05-12
---

Today, I have put [Apache Datafusion](https://datafusion.apache.org/) in the SQL Arena.

The exact implementation under test is a vanialla
DataFusion operating directly on top of Parquet files.
People interested in running queries on it can use the Docker container supplied in the [DBProve](https://github.com/sql-arena/dbprove) repo.

At first glace, the DataFusion planner appears quite 
simplisitic. It scores low on nearly all compares with other query planners.

Note that because this DataFusion runs on top of pure
Parquet files - it only has access to the statistics 
embedded in those files.

