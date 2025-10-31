/* Score all queries rewarding 3 points for being best, 2 for second best and 1 for third best
   The aggregate of each score in each category determines the winnners.
   */
WITH scoring AS (SELECT engine
                      , proof AS operation
                      , SUM(TRY_CAST(value AS BIGINT)) AS rows
                 FROM fact_proof
                          JOIN engine USING (engine_id)
                          JOIN component USING (component_id)
                          JOIN proof USING (proof_id)
                 WHERE component.slug = 'plan'
                   AND unit = 'Rows'
                 GROUP BY ALL)

SELECT engine, operation, RANK() OVER (PARTITION BY operation ORDER BY rows) AS rank
FROM scoring
ORDER BY operation, rank ASC