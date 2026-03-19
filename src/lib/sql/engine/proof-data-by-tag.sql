WITH raw AS (
    SELECT theorem_id
         , theorem.description
         , theorem
         , engine_id
         , E.slug AS engine_slug
         , proof
         , unit
         , TRY_CAST(value AS BIGINT) AS numeric_value
         , value
    FROM fact_proof
    JOIN theorem USING (theorem_id)
    JOIN engine E USING (engine_id)
    JOIN proof P USING (proof_id)
    JOIN tag T USING (tag_id)
    WHERE T.slug = '%%tag%%'
), normalized AS (
    SELECT theorem_id, description, theorem, engine_id, engine_slug, proof, unit, numeric_value, value
    FROM raw
    UNION ALL
    SELECT theorem_id, description, theorem, engine_id, engine_slug, 'Scan' AS proof, unit, numeric_value, value
    FROM raw
    WHERE proof = 'Seek'
      AND unit = 'Rows'
), rows_aggregated AS (
    SELECT theorem_id
         , description
         , theorem
         , engine_id
         , engine_slug
         , proof
         , unit
         , SUM(COALESCE(numeric_value, 0)) AS numeric_value
         , CAST(SUM(COALESCE(numeric_value, 0)) AS VARCHAR) AS value
    FROM normalized
    WHERE unit = 'Rows'
    GROUP BY ALL
), non_rows AS (
    SELECT theorem_id
         , description
         , theorem
         , engine_id
         , engine_slug
         , proof
         , unit
         , NULL AS numeric_value
         , MAX(value) AS value
    FROM normalized
    WHERE unit <> 'Rows'
    GROUP BY ALL
), aggregated AS (
    SELECT * FROM rows_aggregated
    UNION ALL
    SELECT * FROM non_rows
), ranked AS (
    SELECT value
         , unit
         , proof
         , description
         , theorem
         , engine_slug
         , CASE WHEN unit = 'Rows'
                THEN DENSE_RANK() OVER (PARTITION BY theorem, proof ORDER BY numeric_value)
                ELSE NULL
            END AS rank
    FROM aggregated
)
SELECT value
     , unit
     , proof
     , description
     , theorem
     , rank
FROM ranked
WHERE engine_slug = '%%engine%%'
;
