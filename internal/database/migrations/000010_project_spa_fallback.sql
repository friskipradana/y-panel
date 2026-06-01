-- +goose Up
ALTER TABLE IF EXISTS projects
  ADD COLUMN IF NOT EXISTS spa_fallback BOOLEAN NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE IF EXISTS projects
  DROP COLUMN IF EXISTS spa_fallback;
