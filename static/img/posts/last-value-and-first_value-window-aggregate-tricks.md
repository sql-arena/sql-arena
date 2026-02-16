---
title: "LAST_VALUE and FIRST_VALUE Window Aggregate tricks"
date: "2023-10-15"
tags: 
  - "cook-book"
  - "window-aggregates"
---

When writing code for analytical databases, there comes a point where you learn that window aggregates often allow you to express complex joins in new ways. Sometimes, they even allow you to get rid of a join entirely. In this blog, we look at a clever way to look for next and previous values in a log file stored in a SQL database table.

# The Scenario

Databases are fortunately still used for logging data. Log files normally have some kind of timestamp that keeps track of when events occurred. For the purposes of this blog and to give us something concrete to work on, let us image an imaginary log file we keep about what happens on our servers.

The data model is as simple as you can imagine:

```postgresql
CREATE TABLE ServerLog (
  server VARCHAR
  , ts TIME
  , event VARCHAR
)
```

For simplicity, let us assume all data is only stored for a single day. All the conclusion here translate into general timestamp or other ordering of data.

Our sample data is:

| server  | ts    | event            |
|---------|-------|------------------|
| Asgard  | 10:00 | Boot             |
| Asgard  | 10:30 | Crash            |
| Asgard  | 11:35 | Boot             |
| Asgard  | 11:40 | User Login       |
| Asgard  | 11:50 | User Logout      |
| Asgard  | 12:59 | User Login       |
| Asgard  | 13:00 | Reboot           |
| Asgard  | 14:00 | Replace Disk     |
| Bifrost | 14:10 | Boot             |
| Bifrost | 15:00 | Install Software |
| Bifrost | 15:15 | Reboot           |
| Bifrost | 15:20 | Boot             |

This type of data structure should hopefully be familiar to most readers. It is used widely in the industry, yet it hides some surprisingly tricky traps.

# What is the row right after the one I am looking at?

Let us answer the question:

> What is the next event the occurs after the the every event in the `ServerLog`, for the same `server`?

Imagine a world without window aggregates. To find the next event of every event, you would need to do something like this:

```postgresql
WITH CurrNext AS (
   SELECT server, ts, event, (
       /* Find the next timestamp for this server that is in my future */
       SELECT min(ts)
       FROM ServerLog MN
       WHERE MN.server = C.Server AND MN.ts > C.ts) AS ts_next
   FROM ServerLog C
)
SELECT CN.server, CN.ts, CN.event, N.event AS next_event
FROM CurrNext AS CN
/* Join me up with the actual next event so we can find the actual event  */
INNER JOIN ServerLog N
  ON N.ts = CN.ts_next AND CN.server = N.server;
```

This is a very roundabout way to express this problem. it also has several drawbacks apart from its obscurity:

- We must look at `ServerLog` at least 3 times. This may result in some nasty joins. We better have good indexes for this. With a hash join strategy, the `CurrNext` is going to end up as a cross join.
- Even with a good loop join strategy, we are going to do a lost of index accessing.
- The database needs to do some tricky decorrelation between `MN` and `C` in the `WITH` part

Why is the naive SQL solution to this simple use case so obscure? First, SQL operates on _sets_ and sets don't have any notion of ordering. Second, even when we do introduce the idea of picking a member of a set based on its `min(ts)` values it is still hard to describe how that member relates to the actual row it came from. There is no way to reference a "previous" or "next" row in a set using standard joins and aggregates.

Enter windows aggregations. This feature of SQL is designed to handle these types of problems. When you need inspect a row relative to yourself - window aggregates allow you to express what "relative to me" means.

If window aggregates are available in your database, the above query can be expressed as:

```postgresql
SELECT C.server, C.ts, C.event, LEAD(event) OVER (PARTITION BY server ORDER BY ts)
FROM ServerLog C
```

That was easy wasn't it?

Notice the interesting syntax: `OVER (PARTITION BY <expr list> ORDER BY <expr list>`) . This is called the "window frame". It describes how the row you are looking for relates to the current row from the `SELECT` statement projection. The projection in this case is: `C.server, C.ts, C.event`

`LEAD` (and its sibling function `LAG`) allows you to look at the next or previous row. By default the next row you are looking for is 1 ahead or behind (as per the `ORDER BY ts` specification). You can ask for rows any N values ahead or behind you in the window frame.

The `PARTITION BY` tells us that we want to look only at `server` expressions matching the `server` value in the current row we are looking at. If this clause was left out , we would be looking at _all_ values in the entire table ordered by the `ts` - irrespective of which server they are related to.

If you take only one thing away from our session today - let it be that if you have a problem where you need to look at rows relative to some current row - the solution to your problem is likely going to involve a window aggregate function.

## Finding the next/previous row that matches a filter

OK, you got all that? Let us up the game a bit. Answer the question:

> For every **boot** `event`, find the amount of time (as per the `ts` column until the next **reboot** or **crash** event.

Before you try to write a window aggregate, think about how you would express this in SQL if your world did not have window aggregates.

The `LEAD` and `LAG` window functions will not do you much good here. Because you don't know how _many_ events into the future we have to look to find the event we are looking for. Some databases allow you to do filtering on the window frame - but this isn't a very common feature.

But of course, there is a trick. There are two window functions: `LAST_VALUE` and `FIRST_VALUE`, which have some rather useful features for cases like this. The default behaviour of these functions is to return the first and last value of the window frame you have specified. But, most database have the option to treat our favourite value `NULL` in a very, special way. The option is called `IGNORE NULL` and it says: "Pick the first/last value in the window frame that is not a NULL value". Using the `IGNORE NULL` feature, we can express the answer to the question in a surprisingly simple way. Here is the outline of the solution:

```postgresql
SELECT C.server
     , C.ts, C.event
     , LAST_VALUE(CASE C.event
         WHEN 'Crash' THEN ts
         WHEN 'Reboot' THEN ts ELSE NULL END ) IGNORE NULLS
         OVER (PARTITION BY server ORDER BY ts DESC) AS ts_restart
FROM ServerLog C
ORDER BY server, ts ASC;
```

Run this statement and see what happens... See what we just did there?

Notice that our frame is now `PARTITION BY server ORDER BY ts DESC`. The thing to notice here is the `DESC`. Our window is the _future_ of the rows, we are looking at every row _after_ the current event. Taking the `server` = Bifrost as an example and looking at the boot event at 14:10, we have these rows following in descending (`DESC`) order of `ts`:

<table><tbody><tr><td>ts</td><td>ordered events in window frame from boot event at 14:10</td></tr><tr><td>15:20</td><td>Boot</td></tr><tr><td><strong><em>15:15</em></strong></td><td>Reboot</td></tr><tr><td>15:00</td><td>Install Software</td></tr></tbody></table>

The row we want is the the one last on the list here, the one with the **Reboot** string at 15:15. The `CASE WHEN` in the query allow us to isolate this row by null'ing out all the uninteresting rows. Consider this statement:

```postgresql
CASE C.event
         WHEN 'Crash' THEN ts
         WHEN 'Reboot' THEN ts ELSE NULL END
```

This gives us:

<table><tbody><tr><td>ts</td><td><br>ordered events in window frame from boot event at 14:10</td><td>CASE WHEN</td></tr><tr><td>15:20</td><td>Boot</td><td>NULL</td></tr><tr><td>15:15</td><td>Reboot</td><td>15:15</td></tr><tr><td>15:00</td><td>Install Software</td><td>NULL</td></tr></tbody></table>

From here, all we need to do is to ask for the `LAST_VALUE` that is not a NULL, we can do this with:

```postgresql
LAST_VALUE(CASE C.event
         WHEN 'Crash' THEN ts
         WHEN 'Reboot' THEN ts ELSE NULL END ) IGNORE NULLS
```

Which gives us the desired outline of a result...

All we now have to do is to filter out the `event` = **boot**. But, we have to be a little careful here. If we simply say: `WHERE C.event = 'boot'` the window frame we specified will now look only for rows that have `event` = **boot**. The window frame operates on the data _after_ the where filter has been applied. This isn't what we need, because we need to look for events that are **Reboot** and **Crash**.

To fully solve the problem, we must wrap the entire thing in a sub-query and do this:

```postgresql
WITH next_reboot AS (
SELECT C.server
     , C.ts, C.event
     , LAST_VALUE(CASE C.event
         WHEN 'Crash' THEN ts
         WHEN 'Reboot' THEN ts ELSE NULL END ) IGNORE NULLS
         OVER (PARTITION BY server ORDER BY ts DESC) AS ts_restart
FROM ServerLog C)
SELECT * 
FROM next_reboot
WHERE event = 'boot';
```

Eureka - there it is!

(incidentally, the above case of filtering a window aggregate is one of the few times I think `SELECT *` is not bad practise)

# Summary - Try it yourself

Here is the DDL and data for the tables, try it out:

```postgresql
DROP TABLE IF EXISTS ServerLog;
CREATE TABLE ServerLog (
  server VARCHAR(50)
  , ts TIME
  , event VARCHAR(50)
);
INSERT INTO ServerLog
VALUES ('Asgard', '10:00', 'Boot')
;

INSERT INTO ServerLog
VALUES ('Asgard', '10:30', 'Crash')
;
INSERT INTO ServerLog
VALUES ('Asgard', '11:35', 'Boot')
;
INSERT INTO ServerLog
VALUES ('Asgard', '11:40', 'User Login')
;
INSERT INTO ServerLog
VALUES ('Asgard', '11:50', 'User Logout')
;
INSERT INTO ServerLog
VALUES ('Asgard', '12:59', 'User Login')
;
INSERT INTO ServerLog
VALUES ('Asgard', '13:00', 'Reboot')
;
INSERT INTO ServerLog
VALUES ('Asgard', '14:00', 'Replace Disk')
;
INSERT INTO ServerLog
VALUES ('Bifrost', '14:10', 'Boot')
;
INSERT INTO ServerLog
VALUES ('Bifrost', '15:00', 'Install Software')
;
INSERT INTO ServerLog
VALUES ('Bifrost', '15:15', 'Reboot');
;
INSERT INTO ServerLog
VALUES ('Bifrost', '15:20', 'Boot');
```
