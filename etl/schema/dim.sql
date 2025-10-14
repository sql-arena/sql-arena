
CREATE SEQUENCE IF NOT EXISTS id_seq;

CREATE TABLE category
(
    category_id BIGINT PRIMARY KEY DEFAULT nextval('id_seq'),
    category    TEXT NOT NULL,
    description TEXT NOT NULL      DEFAULT '',
    ordering    INT  NOT NULL      DEFAULT 0
);

INSERT INTO category (category, description, ordering)
VALUES ('CLIENT', 'Client Protocol', 1);
INSERT INTO category (category, description, ordering)
VALUES ('PLAN', 'Planner', 2);
INSERT INTO category (category, description, ordering)
VALUES ('EE', 'Execution Engine', 3);
INSERT INTO category (category, description, ordering)
VALUES ('SE', 'Storage Engine', 4);

CREATE TABLE tag
(
    tag_id BIGINT PRIMARY KEY DEFAULT nextval('id_seq'),
    tag    TEXT NOT NULL
);

CREATE TABLE theorem
(
    theorem_id  BIGINT PRIMARY KEY DEFAULT nextval('id_seq'),
    theorem     TEXT NOT NULL,
    description TEXT NOT NULL      DEFAULT '',
    ordering    INT  NOT NULL      DEFAULT 0
);

CREATE TABLE proof
(
    proof_id   BIGINT PRIMARY KEY DEFAULT nextval('id_seq'),
    proof      TEXT NOT NULL,
    value_type TEXT NOT NULL
);

CREATE TABLE engine (
    engine_id BIGINT PRIMARY KEY DEFAULT nextval('id_seq'),
    engine    TEXT NOT NULL,
    version   TEXT NOT NULL
);