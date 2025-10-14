CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE staging.proof (
    engine TEXT,
    engine_version TEXT,
    submitter TEXT,
    file_source TEXT,
    categories TEXT,
    tags TEXT,
    theorem TEXT,
    theorem_description TEXT,
    proof TEXT,
    proof_value TEXT,
    proof_unit TEXT
)