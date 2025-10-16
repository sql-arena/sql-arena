CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE staging.proof (
    engine TEXT,
    engine_version TEXT,
    submitter TEXT,
    file_source TEXT,
    components TEXT,
    tags TEXT,
    theorem TEXT,
    theorem_description TEXT,
    proof TEXT,
    proof_value TEXT,
    proof_unit TEXT
);


/* Generating key from a string */
DROP MACRO IF EXISTS arena_key;
CREATE MACRO arena_key(s1, s2 := NULL) AS (
  CASE
    WHEN s1 IS NULL AND s2 IS NULL THEN NULL
    ELSE
         xor(hash(s2), hash(s1)) & 9223372036854775807
  END
);