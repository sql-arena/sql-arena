SELECT value AS plan
     , engine
     , version
FROM fact_proof
         JOIN theorem T USING (theorem_id)
         JOIN engine E USING (engine_id)
         JOIN proof P USING (proof_id)
WHERE theorem = UPPER('%%theorem%%')
  AND proof = 'Plan'
;
