WITH raw AS (
    SELECT TRY_CAST(value AS BIGINT) AS numeric_value
         , value
         , unit
         , proof
         , T.description
         , engine
         , version
    FROM fact_proof
    JOIN theorem T USING (theorem_id)
    JOIN engine E USING (engine_id)
    JOIN proof P USING (proof_id)
    WHERE T.slug = '%%theorem%%'
), normalized AS (
    SELECT numeric_value, value, unit, proof, description, engine, version
    FROM raw
    UNION ALL
    SELECT numeric_value, value, unit, 'Scan' AS proof, description, engine, version
    FROM raw
    WHERE proof = 'Seek'
      AND unit = 'Rows'
), rows_aggregated AS (
    SELECT CAST(SUM(COALESCE(numeric_value, 0)) AS VARCHAR) AS value
         , SUM(COALESCE(numeric_value, 0)) AS numeric_value
         , unit
         , proof
         , description
         , engine
         , version
    FROM normalized
    WHERE unit = 'Rows'
    GROUP BY ALL
), non_rows AS (
    SELECT MAX(value) AS value
         , NULL AS numeric_value
         , unit
         , proof
         , description
         , engine
         , version
    FROM normalized
    WHERE unit <> 'Rows'
    GROUP BY ALL
), aggregated AS (
    SELECT * FROM rows_aggregated
    UNION ALL
    SELECT * FROM non_rows
)
SELECT value
    , unit
    , proof
    , description
    , engine
    , version
    , CASE WHEN unit = 'Rows'
           THEN DENSE_RANK() OVER (PARTITION BY proof ORDER BY numeric_value)
           ELSE NULL
       END AS rank
FROM aggregated
WHERE NOT (proof = 'Seek' AND unit = 'Rows' AND COALESCE(numeric_value, 0) = 0)
;
