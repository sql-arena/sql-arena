SELECT value
     , unit
     , proof
     , theorem.description
     , theorem
FROM fact_proof
JOIN theorem  USING (theorem_id)
JOIN engine E USING (engine_id)
JOIN proof P USING (proof_id)
JOIN tag T USING (tag_id)
WHERE T.slug = '%%tag%%'
AND E.slug = '%%engine%%'
;
