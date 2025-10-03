CREATE SCHEMA IF NOT EXISTS dim;

CREATE SEQUENCE IF NOT EXISTS id_seq;

DROP TABLE IF EXISTS dim.component;
CREATE TABLE dim.component (
    component_id BIGINT PRIMARY KEY DEFAULT nextval('id_seq'),
    component TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

INSERT INTO dim.component (component, description) VALUES ('PLAN', 'Planner');
INSERT INTO dim.component (component, description) VALUES ('EE', 'Execution Engine');

DROP TABLE IF EXISTS dim.theorem;
CREATE TABLE IF NOT EXISTS dim.theorem (
    theorem_id BIGINT PRIMARY KEY DEFAULT nextval('id_seq'),
    component_id BIGINT REFERENCES dim.component(component_id),
    theorem TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);

