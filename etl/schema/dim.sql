CREATE TABLE component
(
    component_id BIGINT PRIMARY KEY,
    component    TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    slug         TEXT NOT NULL,
    ordering     INT  NOT NULL DEFAULT 0
);

INSERT INTO component (component_id, component, description, slug, ordering)
SELECT arena_key(component), component, description, slug, ordering
FROM (SELECT 'PLAN' AS component, 'Planner' AS description, 'plan' AS slug, 2 AS ordering
      UNION ALL
      SELECT 'EE', 'Execution Engine', 'ee' AS slug, 3
      UNION ALL
      SELECT 'SE', 'Storage Engine', 'se' AS slug, 4) AS c
;

CREATE TABLE tag
(
    tag_id BIGINT PRIMARY KEY,
    tag    TEXT NOT NULL,
    slug   TEXT NOT NULL
);



CREATE TABLE theorem
(
    theorem_id  BIGINT PRIMARY KEY,
    theorem     TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    slug        TEXT NOT NULL,
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
    version   TEXT NOT NULL,
    slug      TEXT NOT NULL
);