-- +goose Up
-- An account made or reset by an admin must choose its own password before using the panel.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS must_change_password;
