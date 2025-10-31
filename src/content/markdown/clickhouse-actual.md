SQL Arena is rapidly progressing. This week I added SQL Server to the scoreboards. Feedback has been really good,
thank you to all who are now participating in the discussions.

A volunteer has offered to work on a TiDB driver - which I am looking very much forward to. If this person is happy
to come forward on the group - I am sure we will hear from him soon.

There is so much that can be done with this tool. If you are interested in contributing - just shoot me a message
and I will happily guide you. Lots of mini projects to be done.

This week, I need to return to some other duties - but I will have a bit of time to work on the ClickHouse driver.

And here are my notes...

## Actual Values
ClickHouse `EXPLAIN` does not render actual values for rows in the query plan. Even though it obviously knows these.

Consider the example of running `EXPLAIN PLAN json = 1, actions = 1, header = 1, indexes = 1` on TPC-H Q3.

As a reminder, the query looks like this:

```sql
SELECT l_orderkey,
       SUM(l_extendedprice * (1 - l_discount)) AS revenue,
       o_orderdate,
       o_shippriority
FROM tpch.lineitem
INNER JOIN tpch.orders
    ON l_orderkey = o_orderkey
INNER JOIN tpch.customer
    ON o_custkey = c_custkey
WHERE c_mktsegment = 'MACHINERY'
  AND o_orderdate < '1995-03-15'
  AND l_shipdate > '1995-03-15'
GROUP BY l_orderkey,
         o_orderdate,
         o_shippriority
ORDER BY revenue DESC,
         o_orderdate
LIMIT 10
```

Here is what we get for the `orders` part of the table:

```
"Plans": [
    {
      "Node Type": "ReadFromMergeTree",
      "Node Id": "ReadFromMergeTree_2",
      "Description": "tpch.orders",
      "Header": [
        {
          "Name": "o_orderdate",
          "Type": "Date"
        },
        ... etc...
        {
          "Name": "o_custkey",
          "Type": "Int32"
        }
      ],
      "Read Type": "Default",
      "Parts": 1,
      "Granules": 184,
      "Prewhere info": {
        "Need filter": true,
        "Prewhere filter": {
          "Prewhere filter column": "less(__table2.o_orderdate, '1995-03-15'_String)",
          "Prewhere filter remove filter column": true,
          "Prewhere filter expression": {
            "Inputs": [
              {
                "Name": "o_orderdate",
                "Type": "Date"
              }
            ],
            "Actions": [
                ... blah blah...
            ],
            "Outputs": [
              {
                "Name": "o_orderdate",
                "Type": "Date"
              },
              {
                "Name": "less(__table2.o_orderdate, '1995-03-15'_String)",
                "Type": "UInt8"
              }
            ],
            "Positions": [0, 2]
          }
        }
      },
      "Indexes": [
        {
          "Type": "PrimaryKey",
          "Condition": "true",
          "Initial Parts": 1,
          "Selected Parts": 1,
          "Initial Granules": 184,
          "Selected Granules": 184
        }
      ]
```

I referred to these pieces of ClickHouse documentation:

- [MergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)
- [A practical introduction to primary indexes in ClickHouse](https://clickhouse.com/docs/guides/best-practices/sparse-primary-indexes)

From there, I can derive that a "granule" is something that roughly corresponds to a number of rows on disk. 
I was able to infer that in my ClickHouse setup - one granule is 8192 rows. 

But of course, none of that helps us with the rest of `EXPLAIN` - because there are no row counts in the join nodes.

Here is a sample of the kind of output ClickHouse makes for a `JOIN`:


```json
"Plans": [
    {
    "Node Type": "Join",
    "Node Id": "Join_30",
    "Header": [
    {
    "Name": "__table1.l_orderkey",
    "Type": "Int32"
    },
    ...
    {
    "Name": "__table3.c_mktsegment",
    "Type": "String"
    }
    ],
    "Type": "INNER",
    "Strictness": "ALL",
    "Algorithm": "ConcurrentHashJoin",
    "Clauses": "[(__table2.o_custkey) = (__table3.c_custkey)]",

```
It is nice enough that we at least get the join algorithm (and very refreshing that they don't call it the "physical operator").

But the two numbers we want the most are not there, namely:

- How many rows did the join produce? - i.e. the "actual" row count
- How many rows did the query optimiser *think* the join would produce? - i.e. the "estimated" row count

How is anyone supposed to make sense of a query plan without these two numbers?

## ClickHouse Operators are functions behind the scenes
Consider this example from TPC-H Q3:

```sql
/* TPC-H Q03 */
SELECT l_orderkey,
       SUM(l_extendedprice * (1 - l_discount)) AS revenue,
       o_orderdate,
       ... etc...
```

ClickHouse `EXPLAIN` renders this
```
      "Expression": {
        "Inputs": [
          {
            "Name": "sum(multiply(__table1.l_extendedprice, minus(1_UInt8, __table1.l_discount)))",
            "Type": "Decimal(38, 4)"
          },
          {
            "Name": "__table1.l_orderkey",
            "Type": "Int32"
          },
```

Why on earth create a user facing interface that renders like this? The abstraction between the user query
and the query plan leaks here. What is this internal representation:

```
sum(multiply(__table1.l_extendedprice, minus(1_UInt8, __table1.l_discount)))
```

`table1` must be `lineitem` here. And the expression must map to this:

```
l_extendedprice * (1 - l_discount)
```

We can infer that Clickhouse internally treats operators like `-` and `*` as functions (which makes a lot of sense
in a columnar, SIMD boosted engine). But it would have been nice if these would be rendered in a form the end user can 
read and which correspond to the query that was actually typed by the user.

In `dbprove` - there is a function in `src/sql/Expression.cpp` which tokenises expressions and tries to turn them into
a canonical form. I will have to extend this to handle the case of turning `minus` into `'-'` again.

## The Verdict

ClickHouse `EXPLAIN` allows me to get the shape of the query tree it executes and the algorithms it uses. This is
useful and at least better than database that barely expose query plans at all.

But it does *not* provide the estimates and actual of row counts in the tree. Because of this, I score it an **D** in
the [EXPLAIN instrumentation](/components/plan/tags/instrumentation) tier list. 

This is not a proper `EXPLAIN` output, and I hope ClickHouse improves the interface in the future. 
Bluntly put, I say that unless ClickHouse fixes this, they should not expect
to be taken serious by people who care about query plans (which should be anyone using the database).

And this is a real shame, because ClickHouse is otherwise a very interesting database.

I could be wrong about this instrumentation interface. 
Maybe there is a way to get these numbers that I have failed to find and which the documentation is vague about. 
If there is, I will happily stand corrected,  bump up ClickHouse's score and publicly take back these words.

For reference, the version of ClickHouse used for this article is: 25.9.1.679

ClickHouse - please tell me it isn't so. I want to be wrong about this...

## The Hack

I want to get ClickHouse on the score-board of SQL Arena - no matter what instrumentation it has.
Likely, ClickHouse is not the last gladiator who needs some extra help like this.

While I cannot measure estimate vs actual values. I *can* measure the actual values going into and out of each query 
plan node.

The `dbprove` tool turns the plan into a canonical form. A tree of nodes that all inherit `src/sql/explain/Node.h`.
Once the query is in this form, it is possible to reconstruct the query fragments that correspond to each node.

By reconstructing these fragments, I can then execute just the fragment and measure its actual row count with `COUNT(*)`.

For example, consider this fragment from TPC-H Q3 in canonical form:

```sql
INNER JOIN HASH ON l_orderkey = o_orderkey
│└TABLE SCAN orders WHERE o_orderdate < '1995-03-15'
TABLE SCAN lineitem WHERE l_shipdate > '1995-03-15'
```

We can get the actual value of that join by executing:

```sql
SELECT COUNT(*)
FROM orders
JOIN lineitem ON l_orderkey = o_orderkey
WHERE l_shipdate > '1995-03-15' 
  AND o_orderdate < '1995-03-15'
```

By traversing each `JOIN` and `GROUP BY` node in the tree this way, we can discover the actual row counts by 
post-processing.

### Bloom filter Transfer

Observant readers will note that the actual value may in fact be lower than what we measure here. 
Because there could be bloom filters and predicate transfers in play. These lower values (if they exist) would work 
in ClickHouse's favour when putting them on the scoreboard.
But this is as close as we can get... Unless ClickHouse instruments their `EXPLAIN` better.



