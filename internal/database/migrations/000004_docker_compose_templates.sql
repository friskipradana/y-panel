-- +goose Up
CREATE TABLE IF NOT EXISTS docker_compose_templates (
    id            BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT NOT NULL DEFAULT 0,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    yaml_content  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE docker_compose_templates ADD COLUMN IF NOT EXISTS owner_user_id BIGINT NOT NULL DEFAULT 0;
WITH ranked_templates AS (
    SELECT id, owner_user_id, name,
           ROW_NUMBER() OVER (PARTITION BY owner_user_id, LOWER(name) ORDER BY id ASC) AS duplicate_rank
    FROM docker_compose_templates
)
UPDATE docker_compose_templates AS templates
SET name = CONCAT(templates.name, ' #', templates.id)
FROM ranked_templates
WHERE templates.id = ranked_templates.id
  AND ranked_templates.duplicate_rank > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_docker_compose_templates_owner_name ON docker_compose_templates (owner_user_id, LOWER(name));

-- +goose Down
DROP INDEX IF EXISTS uq_docker_compose_templates_owner_name;
DROP TABLE IF EXISTS docker_compose_templates;
