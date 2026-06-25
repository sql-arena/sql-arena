CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE staging.proof (
    engine TEXT,
    engine_version TEXT,
    submitter TEXT,
    file_source TEXT,
    components TEXT,
    tags TEXT,
    theorem TEXT,               -- canonical name, used as the primary key for theorems
    theorem_display_name TEXT,  -- human-readable name rendered in the UI (may differ from theorem)
    theorem_description TEXT,
    theorem_sql TEXT,           -- the benchmark SQL query (first query from any engine's result file)
    storage_variant TEXT,       -- e.g. 'native', 'iceberg' — third key dimension alongside engine+version
    proof TEXT,
    proof_value TEXT,
    proof_unit TEXT
);


/* Generating key from a string */
DROP MACRO IF EXISTS arena_key;
CREATE MACRO arena_key(s1, s2 := NULL, s3 := NULL) AS (
  CASE
    WHEN s1 IS NULL AND s2 IS NULL THEN NULL
    ELSE
         xor(xor(hash(s1), hash(COALESCE(s2, ''))), hash(COALESCE(s3, ''))) & 9223372036854775807
  END
);