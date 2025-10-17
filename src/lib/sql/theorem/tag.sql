SELECT DISTINCT tag
FROM fact_proof
JOIN tag USING (tag_id)
JOIN component USING (component_id)
JOIN theorem USING (theorem_id)
WHERE component = UPPER('%%component%%')
  AND theorem = UPPER('%%theorem%%')