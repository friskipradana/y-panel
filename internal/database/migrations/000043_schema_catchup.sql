-- +goose Up
-- Two columns that only the agent's own schema bootstrap made: a new install runs the migrations before the agent ever starts, so
-- without them it had no docs.is_public and no user_quotas.max_databases.
ALTER TABLE docs ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_quotas ADD COLUMN IF NOT EXISTS max_databases INTEGER NOT NULL DEFAULT 3;

-- +goose Down
-- Nothing to undo: the agent bootstrap makes the same columns, so removing them here would break the next start.
SELECT 1;
