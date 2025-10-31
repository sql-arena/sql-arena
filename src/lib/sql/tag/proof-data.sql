SELECT
    engine
     , version
     , theorem
     , proof
     , TRY_CAST(value AS BIGINT) AS value
     , unit
     , rank
FROM fact_proof
JOIN theorem T USING (theorem_id)
JOIN engine E USING (engine_id)
JOIN proof P USING (proof_id)
JOIN tag TG USING (tag_id)
JOIN component CO USING (component_id)
WHERE TG.slug = '%%tag%%'
  AND CO.slug = '%%component%%'
;
