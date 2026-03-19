WITH raw AS (
    SELECT engine
         , version
         , proof
         , TRY_CAST(value AS BIGINT) AS numeric_value
         , value
         , unit
    FROM fact_proof
    JOIN theorem T USING (theorem_id)
    JOIN engine E USING (engine_id)
    JOIN proof P USING (proof_id)
    JOIN tag TG USING (tag_id)
    JOIN component C USING (component_id)
    WHERE TG.slug = '%%tag%%'
      AND C.slug = '%%component%%'
      AND (E.slug = '%%engine%%'
       OR '%%engine%%' = 'ALL')
), normalized AS (
    SELECT engine, version, proof, numeric_value, value, unit
    FROM raw
    UNION ALL
    SELECT engine, version, 'Scan' AS proof, numeric_value, value, unit
    FROM raw
    WHERE proof = 'Seek'
      AND unit = 'Rows'
), rows_by_engine AS (
    SELECT engine
         , version
         , proof
         , SUM(COALESCE(numeric_value, 0)) AS numeric_value
         , CAST(SUM(COALESCE(numeric_value, 0)) AS BIGINT) AS value
         , unit
    FROM normalized
    WHERE unit = 'Rows'
    GROUP BY ALL
), non_rows AS (
    SELECT engine
         , version
         , proof
         , NULL AS numeric_value
         , MAX(TRY_CAST(value AS BIGINT)) AS value
         , unit
    FROM normalized
    WHERE unit <> 'Rows'
    GROUP BY ALL
), by_engine AS (
    SELECT * FROM rows_by_engine
    UNION ALL
    SELECT * FROM non_rows
)
SELECT *
     , CASE WHEN unit = 'Rows'
            THEN DENSE_RANK() OVER (PARTITION BY proof ORDER BY numeric_value)
            ELSE NULL
        END AS rank
FROM by_engine
;
