SELECT *,
       DENSE_RANK() OVER (PARTITION BY proof ORDER BY value ) AS rank
FROM (SELECT engine
           , version
           , proof
           , SUM(TRY_CAST(value AS BIGINT)) AS value
     , unit AS unit
      FROM fact_proof
          JOIN theorem T USING (theorem_id)
          JOIN engine E USING (engine_id)
          JOIN proof P USING (proof_id)
          JOIN tag TG USING (tag_id)
          JOIN component C USING (component_id)
      WHERE TG.slug = '%%tag%%'
        AND C.slug = '%%component%%'
        AND (E.slug = '%%engine%%'
         OR '%%engine%%' = 'ALL')
      GROUP BY ALL) by_engine
;
