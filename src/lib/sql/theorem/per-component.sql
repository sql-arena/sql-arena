SELECT DISTINCT theorem
FROM fact_proof
JOIN theorem USING (theorem_id)
JOIN component USING (component_id)
WHERE component = UPPER('%%component%%')
ORDER BY theorem ASC
;
