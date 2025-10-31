SELECT value AS plan
     , engine
     , version
FROM fact_proof
JOIN theorem T USING (theorem_id)
JOIN engine E USING (engine_id)
JOIN proof P USING (proof_id)
JOIN component C USING (component_id)
WHERE T.slug = '%%theorem%%'
  AND C.slug = 'plan'
  AND unit = 'Plan'
;
