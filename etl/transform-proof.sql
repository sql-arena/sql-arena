
UPDATE staging.proof
SET theorem = UPPER(theorem);

INSERT INTO tag (tag_id, tag, slug)
SELECT arena_key(tag) AS tag_id, tag, LOWER(tag) AS slug
FROM (SELECT DISTINCT TRIM(UNNEST(string_split(tags, ','))) AS tag
      FROM staging.proof) AS unn
;

-- theorem: use canonical `theorem` column for the key/slug, displayName for the rendered label.
-- For CSV-sourced rows, theorem_display_name equals theorem (set in stage-proof.sql).
INSERT INTO theorem (theorem_id, theorem, slug, description, sql)
SELECT arena_key(theorem)                                    AS theorem_id,
       MAX(COALESCE(NULLIF(TRIM(theorem_display_name), ''), theorem)) AS theorem,
       LOWER(theorem)                                        AS slug,
       MAX(theorem_description)                              AS description,
       COALESCE(MAX(COALESCE(NULLIF(TRIM(theorem_sql), ''), NULL)), '') AS sql
FROM staging.proof
GROUP BY theorem
;

INSERT INTO proof (proof_id, proof)
SELECT DISTINCT arena_key(proof), proof
FROM staging.proof
;

/* A bunch of engines dont yet have data, but there are still opinions to be had about them */
INSERT INTO engine (engine_id, engine, version, storage_variant, slug)
SELECT arena_key(engine, engine_version, storage_variant) AS engine_id,
       engine,
       engine_version AS version,
       storage_variant,
       LOWER(engine)  AS slug
FROM (
    SELECT 'SQL Server' AS engine, '2017' AS engine_version, 'native' AS storage_variant
UNION ALL
    SELECT 'ClickHouse', 'UNKNOWN', 'native'
    UNION ALL
    SELECT 'Databricks', 'UNKNOWN', 'native'
    UNION ALL
    SELECT 'MySQL', 'UNKNOWN', 'native'
     ) AS raw
;

INSERT INTO engine (engine_id, engine, version, storage_variant, slug)
SELECT DISTINCT arena_key(engine, engine_version, storage_variant) AS engine_id,
                engine,
                engine_version AS version,
                COALESCE(NULLIF(TRIM(storage_variant), ''), 'native') AS storage_variant,
                LOWER(engine)  AS slug
FROM staging.proof S
WHERE NOT EXISTS (
    SELECT 1 FROM engine
    WHERE engine_id = arena_key(S.engine, S.engine_version, COALESCE(NULLIF(TRIM(S.storage_variant), ''), 'native'))
)
;



INSERT INTO fact_proof (theorem_id, tag_id, component_id, engine_id, proof_id, value, unit)
SELECT theorem_id,
       arena_key(tag)      AS tag_id,
       arena_key(component) AS component_id,
       arena_key(engine, engine_version, COALESCE(NULLIF(TRIM(storage_variant), ''), 'native')) AS engine_id,
       proof_id,
       value,
       unit
FROM (SELECT
          TRIM(UNNEST(string_split(tags, ',')))       AS tag
           , TRIM(UNNEST(string_split(components, ','))) AS component
           , arena_key(theorem)                    AS theorem_id
           , engine
           , engine_version
           , storage_variant
           , arena_key(proof)                      AS proof_id
           , proof_value AS value
           , proof_unit AS unit
      FROM staging.proof) AS unn
WHERE component <> 'TEST'
;
