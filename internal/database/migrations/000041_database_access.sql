-- +goose Up
-- Who may reach a user database from outside the server: only the machine itself (local, the container is published on 127.0.0.1),
-- or the listed addresses (ips, published on every interface and cut down by a firewall chain of the agent).
ALTER TABLE managed_databases ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'local';
ALTER TABLE managed_databases ADD COLUMN IF NOT EXISTS access_ips TEXT NOT NULL DEFAULT '';
ALTER TABLE managed_databases DROP CONSTRAINT IF EXISTS managed_databases_access_mode_check;
ALTER TABLE managed_databases ADD CONSTRAINT managed_databases_access_mode_check CHECK (access_mode IN ('local','ips'));

-- +goose Down
ALTER TABLE managed_databases DROP CONSTRAINT IF EXISTS managed_databases_access_mode_check;
ALTER TABLE managed_databases DROP COLUMN IF EXISTS access_ips;
ALTER TABLE managed_databases DROP COLUMN IF EXISTS access_mode;
