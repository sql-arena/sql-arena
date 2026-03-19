/* Score all queries rewarding 3 points for being best, 2 for second best and 1 for third best
   The aggregate of each score in each category determines the winnners.
   */
WITH raw AS (
    SELECT engine
         , proof
         , theorem_id
         , TRY_CAST(value AS BIGINT) AS rows
    FROM fact_proof
    JOIN engine USING (engine_id)
    JOIN component USING (component_id)
    JOIN proof USING (proof_id)
    WHERE component.slug = 'plan'
      AND unit = 'Rows'
), normalized AS (
    SELECT engine, proof AS operation, theorem_id, rows
    FROM raw
    UNION ALL
    SELECT engine, 'Scan' AS operation, theorem_id, rows
    FROM raw
    WHERE proof = 'Seek'
), scoring AS (
    SELECT engine
         , operation
         , theorem_id
         , SUM(COALESCE(rows, 0)) AS rows
    FROM normalized
    GROUP BY ALL
), filtered AS (
    SELECT *
    FROM scoring
    WHERE NOT (operation = 'Seek' AND rows = 0)
), ranked AS (
    SELECT engine
         , operation
         , theorem_id
         , DENSE_RANK() OVER (PARTITION BY theorem_id, operation ORDER BY rows) AS theorem_rank
    FROM filtered
)
SELECT engine
     , operation
     , SUM(CASE theorem_rank
           WHEN 1 THEN 5
           WHEN 2 THEN 4
           WHEN 3 THEN 3
           WHEN 4 THEN 2
           WHEN 5 THEN 1
           ELSE 0
       END) AS score
     , DENSE_RANK() OVER (
         PARTITION BY operation
         ORDER BY SUM(CASE theorem_rank
                      WHEN 1 THEN 5
                      WHEN 2 THEN 4
                      WHEN 3 THEN 3
                      WHEN 4 THEN 2
                      WHEN 5 THEN 1
                      ELSE 0
                  END) DESC
       ) AS rank
FROM ranked
GROUP BY engine, operation
ORDER BY operation, rank ASC, engine ASC
