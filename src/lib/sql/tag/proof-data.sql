WITH raw AS (
    SELECT theorem
         , engine
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
    JOIN component CO USING (component_id)
    WHERE TG.slug = '%%tag%%'
      AND CO.slug = '%%component%%'
), normalized AS (
    SELECT theorem, engine, version, proof, numeric_value, value, unit
    FROM raw
    UNION ALL
    SELECT theorem, engine, version, 'Scan' AS proof, numeric_value, value, unit
    FROM raw
    WHERE proof = 'Seek'
      AND unit = 'Rows'
), rows_aggregated AS (
    SELECT engine
         , version
         , theorem
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
         , theorem
         , proof
         , NULL AS numeric_value
         , MAX(TRY_CAST(value AS BIGINT)) AS value
         , unit
    FROM normalized
    WHERE unit <> 'Rows'
    GROUP BY ALL
), aggregated AS (
    SELECT * FROM rows_aggregated
    UNION ALL
    SELECT * FROM non_rows
)
SELECT engine
     , version
     , theorem
     , proof
     , value
     , unit
     , CASE WHEN unit = 'Rows'
            THEN DENSE_RANK() OVER (PARTITION BY theorem, proof ORDER BY numeric_value)
            ELSE NULL
        END AS rank
FROM aggregated
WHERE NOT (proof = 'Seek' AND unit = 'Rows' AND COALESCE(numeric_value, 0) = 0)
;
