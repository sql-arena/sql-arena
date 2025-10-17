SELECT value
     , unit
     , proof
     , T.description
     , theorem
FROM fact_proof
JOIN theorem T USING (theorem_id)
JOIN engine E USING (engine_id)
JOIN proof P USING (proof_id)
JOIN tag T2 USING (tag_id)
WHERE tag = UPPER('%%tag%%')
AND engine = '%%engine%%'
;
