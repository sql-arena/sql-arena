
CREATE TABLE fact_proof (
    theorem_id bigint REFERENCES theorem(theorem_id),
    tag_id bigint REFERENCES tag(tag_id),
    component_id bigint REFERENCES component(component_id),
    engine_id bigint REFERENCES engine(engine_id),
    proof_id bigint REFERENCES proof(proof_id),
    value TEXT,
    unit TEXT,
    score bigint
);

/* TODO: Scores go here and get rendered */
