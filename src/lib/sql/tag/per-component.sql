SELECT tag, COUNT(DISTINCT theorem_id) AS theorem_count
FROM fact_proof
JOIN tag USING (tag_id)
JOIN component USING (component_id)
WHERE component = UPPER('%%component%%')
  AND tag <> 'CONFIG'
GROUP BY tag
ORDER BY tag ASC
;
