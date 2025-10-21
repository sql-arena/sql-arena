SELECT
    engine
     , version
     , theorem
     , proof
     , TRY_CAST(value AS BIGINT) AS value
     , unit AS unit
FROM fact_proof
JOIN theorem T USING (theorem_id)
JOIN engine E USING (engine_id)
JOIN proof P USING (proof_id)
JOIN tag USING (tag_id)
JOIN component USING (component_id)
WHERE tag = UPPER('%%tag%%')
  AND component = UPPER('%%component%%')
;
