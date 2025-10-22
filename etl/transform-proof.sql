
UPDATE staging.proof
SET theorem = UPPER(theorem);

INSERT INTO tag (tag_id, tag, slug)
SELECT arena_key(tag) AS tag_id, tag, LOWER(tag) AS slug
FROM (SELECT DISTINCT UNNEST(string_split(tags, ',')) AS tag
      FROM staging.proof) AS unn
;

INSERT INTO theorem (theorem_id, theorem, slug, description)
SELECT arena_key(theorem), theorem, LOWER(theorem) AS slug,  MAX(theorem_description)
FROM staging.proof
GROUP BY ALL
;

INSERT INTO proof (proof_id, proof)
SELECT DISTINCT arena_key(proof), proof
FROM staging.proof
;

/* A bunch of engines dont yet have data, but there are still opinions to be had about them */
INSERT INTO engine (engine_id, engine, version, slug)
SELECT arena_key(engine, engine_version) AS engine_id, engine, engine_version AS version, LOWER(engine) AS slug
FROM (
    SELECT 'SQL Server' AS engine, '2017' AS engine_version
UNION ALL
    SELECT 'ClickHouse' AS engine, 'UNKNOWN' AS engine_version
    UNION ALL
    SELECT 'Databricks', 'UNKNOWN'
    UNION ALL
    SELECT 'MySQL', 'UNKNOWN'
     ) AS raw
;

INSERT INTO engine (engine_id, engine, version, slug)
SELECT DISTINCT arena_key(engine, engine_version) AS engine_id, engine, engine_version AS version, LOWER(engine) AS slug
FROM staging.proof S
WHERE NOT EXISTS (SELECT 1 FROM engine WHERE engine_id = arena_key(S.engine, S.engine_version))
;



INSERT INTO fact_proof (theorem_id, tag_id, component_id, engine_id, proof_id, value, unit)
SELECT theorem_id,
       arena_key(tag)      AS tag_id,
       arena_key(component) AS component_id,
       engine_id,
       proof_id,
       value,
       unit
FROM (SELECT
          UNNEST(string_split(tags, ','))       AS tag
           , UNNEST(string_split(components, ',')) AS component
           , arena_key(theorem)                    AS theorem_id
           , arena_key(engine, engine_version)     AS engine_id
           , arena_key(proof)                      AS proof_id
           , proof_value AS value
           , proof_unit AS unit
      FROM staging.proof) AS unn
;