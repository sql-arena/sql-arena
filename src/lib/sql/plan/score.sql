/* Score each query by row count from each operator. The one with the lowest row count is the best
   If you are not in the top 5, you get 0 points. 10 points for first, 9 for second, etc.
   */
WITH scoring AS (SELECT TRY_CAST(value AS BIGINT) AS rows
   , proof AS operation
   , theorem
   , engine
   , greatest(0, 5 - ROW_NUMBER() OVER (PARTITION BY theorem, proof ORDER BY TRY_CAST(value AS BIGINT) DESC)) AS score
FROM fact_proof
    JOIN theorem  USING (theorem_id)
    JOIN engine  USING (engine_id)
    JOIN proof  USING (proof_id)
    JOIN component  USING (component_id)
WHERE component = UPPER('plan')
  AND unit = 'Rows')
    , agg_scoring AS (
SELECT engine, operation, SUM(score) as score
FROM scoring
GROUP BY ALL
    )
SELECT engine, operation, RANK() OVER (PARTITION BY operation ORDER BY score DESC) AS rank, score
FROM agg_scoring
ORDER BY operation, rank ASC