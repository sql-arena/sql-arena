SELECT DISTINCT tag
FROM fact_proof
JOIN tag USING (tag_id)
JOIN component USING (component_id)
JOIN theorem USING (theorem_id)
WHERE component.slug = '%%component%%'
  AND theorem.slug = '%%theorem%%'
;