SELECT value
    , unit
    , proof
    , T.description
    , engine
    , version
    , rank
FROM fact_proof
JOIN theorem T USING (theorem_id)
JOIN engine E USING (engine_id)
JOIN proof P USING (proof_id)
WHERE T.slug = '%%theorem%%'
;
