
CREATE TABLE fact_proof (
    theorem_id bigint REFERENCES theorem(theorem_id),
    tag_id bigint REFERENCES tag(tag_id),
    category_id bigint REFERENCES category(category_id),
    engine_id bigint REFERENCES engine(engine_id),
    proof_id bigint REFERENCES proof(proof_id),
    value_number DOUBLE PRECISION,
    value_bool DOUBLE PRECISION,
    value_string DOUBLE PRECISION,
    unit TEXT
);
