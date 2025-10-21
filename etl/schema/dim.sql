CREATE TABLE component
(
    component_id BIGINT PRIMARY KEY,
    component    TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    ordering    INT  NOT NULL DEFAULT 0
);

INSERT INTO component (component_id, component, description, ordering)
SELECT arena_key(component), component, description, ordering
FROM (
      SELECT 'PLAN' AS component, 'Planner' AS description, 2 AS ordering
      UNION ALL
      SELECT 'EE', 'Execution Engine', 3
      UNION ALL
      SELECT 'SE', 'Storage Engine', 4) AS c
;

CREATE TABLE tag
(
    tag_id BIGINT PRIMARY KEY,
    tag    TEXT NOT NULL
);



CREATE TABLE theorem
(
    theorem_id  BIGINT PRIMARY KEY,
    theorem     TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    ordering    INT  NOT NULL DEFAULT 0
);

CREATE TABLE proof
(
    proof_id BIGINT PRIMARY KEY,
    proof    TEXT NOT NULL
);

CREATE TABLE engine
(
    engine_id BIGINT PRIMARY KEY,
    engine    TEXT NOT NULL,
    version   TEXT NOT NULL
);