/* PLAN scores: He who has the lowest number of actual rows in each category wins the model
   Only the best 3 (with ties) get medals
   */
UPDATE fact_proof AS F
SET rank = R.rank FROM (
SELECT proof_id
, theorem_id
, engine_id
, DENSE_RANK() OVER (PARTITION BY theorem_id, proof_id ORDER BY CAST(TRY_CAST(value AS BIGINT) / 10 AS BIGINT) * 10) AS rank
FROM fact_proof
JOIN component USING (component_id)
WHERE unit = 'Rows'
  AND component = 'PLAN'
  ) AS R
WHERE R.theorem_id = F.theorem_id
  AND R.engine_id = F.engine_id
  AND R.proof_id = F.proof_id
;