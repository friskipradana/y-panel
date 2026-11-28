-- +goose Up
-- Which Reneo feature a post explains, for the coverage list of the Docs window. docs.kind was only ever made by the agent bootstrap,
-- so a new install (migrations first) needs it here as well.
ALTER TABLE docs ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'article';
ALTER TABLE docs ADD COLUMN IF NOT EXISTS feature_key VARCHAR(40) NOT NULL DEFAULT '';

-- +goose Down
-- kind stays: the agent bootstrap makes it too
ALTER TABLE docs DROP COLUMN IF EXISTS feature_key;
