WITH rank_compare AS (
    SELECT engine_id
           , tag_id
           , proof_id
           , unit
           , SUM(TRY_CAST(value AS BIGINT)) AS value
    FROM fact_proof
    JOIN component CO USING (component_id)
    WHERE CO.slug = '%%component%%'
    GROUP BY ALL
), ranked AS (
    SELECT
        *
        , DENSE_RANK() OVER (PARTITION BY tag_id, proof_id ORDER BY value DESC) AS rank
    FROM rank_compare
)
SELECT tag, proof, value, rank, unit
FROM ranked
JOIN engine E USING (engine_id)
JOIN proof P USING (proof_id)
JOIN tag T USING (tag_id)
WHERE E.slug = '%%engine%%'
  AND T.tag <> 'CONFIG'

;
