---
title: "Join Elimination in Query Planners"
date: "2021-11-17"
tags: 
  - "join"
  - "query-optimisation"
coverImage: "PixelSnap-2021-11-17-at-17.05.14.png"
---

Most relational databases are both by human SQL query writers and tools that automatically generate queries. Query tools frequently add joins into the queries, even when those joins are not needed. This results in unnecessary query slowdowns and increase CPU usage.

For example, consider the classic Star Schema model with a fact table in the middle and dimension tables surrounding it. From a reporting tool perspective, it is useful to have a view on top of that schema which joins all the tables and presents the user with the illusion of a single table. This approach of creating large join views has some drawbacks that can only be offset by query optimisers if the database designer has correctly declared key constraints in the data model.

# Understanding the Problem

Consider this example, toy problem :

```postgresql
CREATE TABLE DimCustomer (
    customer_id INT NOT NULL PRIMARY KEY
  , country VARCHAR
  , city VARCHAR
)

CREATE TABLE DimDate (
    date_id INT NOT NULL PRIMARY KEY
  , year INT
  , month INT
  , day INT
  , day_of_week INT
)

CREATE TABLE DimChannelWeb (
   channel_id NOT NULL PRIMARY KEY
   , web_site VARCHAR NOT NULL
)

CREATE TABLE DimChannelStore (
   channel_id NOT NULL PRIMARY KEY
   , floor_space VARCHAR
)

CREATE TABLE FactSales (
    /* Keep an eye on the NULL'ness of the keys here */
    customer_id INT NULL FOREIGN KEY REFERENCES DimCustomer(customer_id)
  , date_id INT NOT NULL FOREIGN KEY REFERENCES DimDate(date_id)
  , channel_id NOT NULL
  , amount DECIMAL(18,4)
)
```

A database designer, or a reporting tool, might decide to create the following, useful view:

```postgresql
CREATE VIEW Sales AS
SELECT 
    C.country
  , C.city
  , D.year
  , D.month
  , D.day
  , D.day_of_week
  , F.amount
FROM FactSales F
INNER JOIN DimCustomer C USING (customer_id)
INNER JOIN DimDate D USING (date_id)
```

This view makes it very easy to write queries that reference any of the dimension tables without needing to express the join explicitly.

However, this common method comes with a drawback. Consider the following query, asking for the sales per weekday

```postgresql
SELECT 
    day_of_week
  , SUM(amount)
FROM Sales
GROUP BY day_of_week
```

Let us expand this this query using the underlying view. We can see that the query asks for this expression to be evaluated:

```postgresql
SELECT 
    day_of_week
  , SUM(amount)
FROM (
   SELECT 
     C.country
   , C.city
   , D.year
   , D.month
   , D.day
   , D.day_of_week
   , F.amount
  FROM FactSales F
  INNER JOIN DimCustomer C USING (customer_id)
  INNER JOIN DimDate D USING (date_id)
)
GROUP BY day_of_week
```

The query involves joins to both **DimDate** and **DimCustomer**. But, what the user really wanted was just to sum up the data by the **day\_of\_week**, which does _not_ involve the **DimCustomer** table at all. The optimal form of this query is this simplification:

```postgresql
SELECT 
   , D.day_of_week
  , SUM(amount)
FROM FactSales F
INNER JOIN DimDate D USING (date_id)
  AND F.customer_id IS NOT NULL
GROUP BY day_of_week
```

But, there isn't any way for the query optimiser to know that. The database engine will faithfully join to **DimCustomer** even though it has no effect. This will throw away CPU that you end up paying for. But, there is a way to avoid this.

If you have done your homework and declared Primary (PK) and Foreign Keys (FK) in the data model. The SQL query optimiser can perform a process known as join elimination. This process automatically removes joins that are not needed from queries.

# The INNER FK/FK elimination

The simplest elimination to understand is the case where the join in the query is on a table that has

1. No other reference in any other part of the query, except in a join criteria on its PK to the FK of another table in the query
2. The FK of the table in 1 declared as a NOT NULL column (if it wasn't, the join to a PK would remove the NULL values)
3. The same data type of its PK as the FK it joins to (for the databases that allow such FK/PK relations)

For example, consider this join:

```postgresql
SELECT F.amount
FROM FactSales F
JOIN DimDate D ON D.date_id = F.date_id
```

Here, you can see that **DimDate** is not referenced anywhere, except in the join key. This join is also on the FK/PK relation between **FactSales** and **DimDate** (on the **date\_id** key). Finally, we also see the the FK of DimDate is NOT NULL. Together, these restrictions allow the query optimiser to infer that the join to **DimDate** can't possibly change the result of the query. We can rewrite to:

```postgresql
SELECT F.amount
FROM FactSales F
```

## Implied equalities

Note that we loosen the restrictions a bit. At least if the values you referenced in the query are known to be interchangeable with other values.

An INNER JOIN between an FK and PK also implies that the keys referenced values are interchangeable in the query - this query would _also_ qualify for join elimination

```postgresql
SELECT F.amount, D.date_id /* This must be the the same as F.date_id*/
FROM FactSales F
JOIN DimDate D ON D.date_id = F.date_id
```

And the optimiser can rewrite to:

```postgresql
SELECT F.amount, F.date_id
FROM FactSales F
```

## Dealing with NOT NULL Foreign Keys

We can also remove the restriction that the FK in the query must be NOT NULL. If the FK is NULL, we must add an additional filter to the query before removing the join. For example, consider this join:

```postgresql
SELECT F.amount
FROM FactSales F
JOIN DimCustomer C ON C.customer_id = F.customer_id
```

Recall that **customer\_id** is NULL'able in **DimCustomer**. We can't just eliminate the join here, because it _does_ have an effect on the result: Namely that it will remove all null values in **F.customer\_id**. But we _can_ remove it if we add an additional filter to **FactSales**. This does the trick:

```postgresql
SELECT F.amount
FROM FactSales F
WHERE F.customer_id IS NOT NULL
```

# The LEFT OUTER to PK elimination

Even without foreign keys declared, there are still cases where we can eliminate a join purely by looking at PK information. These happens on tables in the query that

- Has no references except in join criteria to a PK in another table in the query
- Are on the LEFT side of a LEFT OUTER join to the PK on the right side

For example, consider:

```postgresql
SELECT F.amount
FROM FactSales F
LEFT JOIN DimChannelWeb CW ON CW.channel_id = F.channel_id
LEFT JOIN DimChannelStore CS ON CS.channel_id = F.channel_id
```

Here, we can infer that there is no point in joining to **DimChannelWeb** or **DimChannelStore**, because by definition a LEFT OUTER join to a primary key cannot change the number of rows, and we don't need any values from either of those tables. We can rewrite to:

```postgresql
SELECT F.amount
FROM FactSales F
```

# The ANTI JOIN elimination

Finally (but not exhaustively) let us look at another special case: the ANTI JOIN elimination. ANTI JOINs typically occur when you have a NOT IN or NOT EXISTS in the query.

Consider this case:

```postgresql
SELECT SUM(F.amount)
FROM FactSales F
WHERE F.channel_id NOT IN (SELECT channel_id FROM DimChannelWeb WHERE web_site IS NULL)
```

This is the kind of query an ETL tool might generate to check validity of data. In this case, we can know that there are ZERO **channel\_id** in **DimChannelWeb** where the **web\_site** **IS NULL**. Because **web\_site** is in fact declared NOT NULL in the DDL. IN other words, the sub-query returns an empty set. That in turn means that **F.channel\_id NOT IN (<empty set>)** must always be true. It must therefore be the case that the query can be rewritten to:

```postgresql
SELECT SUM(F.amount)
FROM FactSales
```

# Summary

We have shown you how query optimisers use primary, foreign key and NULL declarations to get rid of joins that are not needed in a query. A human query writer can often remove these joins via manual inspection. However, many SQL queries are not written by humans but are instead generated by reporting or ETL tools.

Joins often consume a significant fraction of the total CPU usage in a database. Getting rid of needless joins is therefore a powerful optimisation. To unlock such an optimisation the database designers must do their homework. They must properly declare keys and constraints on the tables in the schema. In other words: Good database design pays off!
