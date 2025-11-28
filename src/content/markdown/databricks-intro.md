I have generously been given some DataBricks compute credits which should allow me to add this very popular engine
to the SQL Arena. In particular DataBricks SQL (I hope I am using that name right) with Photon execution engine.

## `EXPLAIN` output

After a bit of studying of DataBricks documentation and playing with their interfaces it is clear to me that two 
different types of EXPLAIN output exists:

1) The EXPLAIN directly from the SQL Command Line
2) An EXPLAIN from the underlying Spark like cluster - which appears to be the data used to render the DataBricks UX.

I was hoping to get all I need directly from SQL Command line - but there isn't enough information there.
That means I need to go after the underlying Spark `EXPLAIN`.
Hopefully, ChatGPT willing and not too hallucinating, I should be able to prototype this in the coming week.
I may need to play around with configuration a bit to get the right access levels.
There also appears to be a need to "find" the query_id you just executed and then fetch the query plan via the Spark 
API. 

These are all things doable from `dbprove` and I have some basic code scaffolding in place already.

## Loading data

DataBricks is the first pure cloud engine to join the arena. It does not have a traditional, "front door" loading API
where I can just stream data from my laptop into DataBricks.

However, it does have the nice `read_files` [function](https://docs.databricks.com/aws/en/query/formats/csv) that can be 
called from SQL.

I am thinking I should probably create a public S3 bucket with all TPC-H data in CSV format, and then use that bucket
as the source for all the cloud database testing in SQL Arena.

If anyone is deeply familiar with DataBricks and has better ideas, please reach out to me.

## Turning DataBricks EXPLAIN into the canonical form

This is the last, and typipically the hardest step when introducing a new engine into SQL Arena.

However, from looking at Spark execution plan - they appear to be much easier to parse than ClickHouse plans.
This will be a relief - I could use a quick win.

## Generating Stats

As with all the tests, I try to be fair to the engine by generating all the statistics it needs to make the best plan.
If anyone is already familiar with DataBricks statistics generation for TPC-H, please reach out to me.
