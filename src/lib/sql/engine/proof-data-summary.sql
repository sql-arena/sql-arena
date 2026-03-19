WITH raw AS (
    SELECT engine_id
         , tag_id
         , proof
         , unit
         , TRY_CAST(value AS BIGINT) AS numeric_value
         , value
    FROM fact_proof
    JOIN component CO USING (component_id)
    JOIN proof P USING (proof_id)
    WHERE CO.slug = '%%component%%'
), normalized AS (
    SELECT engine_id, tag_id, proof, unit, numeric_value, value
    FROM raw
    UNION ALL
    SELECT engine_id, tag_id, 'Scan' AS proof, unit, numeric_value, value
    FROM raw
    WHERE proof = 'Seek'
      AND unit = 'Rows'
), rows_rank_compare AS (
    SELECT engine_id
         , tag_id
         , proof
         , unit
         , SUM(COALESCE(numeric_value, 0)) AS numeric_value
         , CAST(SUM(COALESCE(numeric_value, 0)) AS BIGINT) AS value
    FROM normalized
    WHERE unit = 'Rows'
    GROUP BY ALL
), non_rows AS (
    SELECT engine_id
         , tag_id
         , proof
         , unit
         , NULL AS numeric_value
         , MAX(TRY_CAST(value AS BIGINT)) AS value
    FROM normalized
    WHERE unit <> 'Rows'
    GROUP BY ALL
), rank_compare AS (
    SELECT * FROM rows_rank_compare
    UNION ALL
    SELECT * FROM non_rows
), ranked AS (
    SELECT *
         , CASE WHEN unit = 'Rows'
                THEN DENSE_RANK() OVER (PARTITION BY tag_id, proof ORDER BY numeric_value DESC)
                ELSE NULL
            END AS rank
    FROM rank_compare
)
SELECT tag, proof, value, rank, unit
FROM ranked
JOIN engine E USING (engine_id)
JOIN tag T USING (tag_id)
WHERE E.slug = '%%engine%%'
  AND T.tag <> 'CONFIG'
  AND NOT (proof = 'Seek' AND unit = 'Rows' AND COALESCE(numeric_value, 0) = 0)
;
