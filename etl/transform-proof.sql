
UPDATE staging.proof
SET theorem = UPPER(theorem);

INSERT INTO tag (tag_id, tag)
SELECT arena_key(tag) AS tag_id, tag
FROM (SELECT DISTINCT UNNEST(string_split(tags, ',')) AS tag
      FROM staging.proof) AS unn
;

INSERT INTO theorem (theorem_id, theorem, description)
SELECT arena_key(theorem), theorem, MAX(theorem_description)
FROM staging.proof
GROUP BY ALL
;

INSERT INTO proof (proof_id, proof)
SELECT DISTINCT arena_key(proof), proof
FROM staging.proof
;

INSERT INTO engine (engine_id, engine, version)
SELECT DISTINCT arena_key(engine, engine_version) AS engine_id, engine, engine_version AS version
FROM staging.proof
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