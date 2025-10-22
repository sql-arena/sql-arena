SELECT
    tag
     , proof
     , SUM(TRY_CAST(value AS BIGINT)) AS value
     , MAX(unit) AS unit
FROM fact_proof
JOIN theorem T USING (theorem_id)
JOIN engine E USING (engine_id)
JOIN proof P USING (proof_id)
JOIN tag USING (tag_id)
JOIN component USING (component_id)
WHERE engine = '%%engine%%'
  AND component = UPPER('%%component%%')
  AND tag <> 'CONFIG'
GROUP BY ALL
;
