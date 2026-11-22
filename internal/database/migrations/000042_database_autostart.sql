-- +goose Up
-- Whether a user database should be running: set when it is started or created, cleared when its owner stops it. A database open to
-- listed addresses is not restarted by Docker itself (it would be published before its firewall rules exist after a reboot); the agent
-- starts it once the rules are in place, and only when this is set.
ALTER TABLE managed_databases ADD COLUMN IF NOT EXISTS autostart BOOLEAN NOT NULL DEFAULT TRUE;

-- +goose Down
ALTER TABLE managed_databases DROP COLUMN IF EXISTS autostart;
