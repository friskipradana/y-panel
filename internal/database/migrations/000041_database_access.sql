-- +goose Up
-- Who may reach a user database from outside the server: only the machine itself (local, the container is published on 127.0.0.1),
-- or the listed addresses (ips, published on every interface and cut down by a firewall chain of the agent).
-- The table is also made by the agent at start; on a new install the migrations run first, so it has to exist here
CREATE TABLE IF NOT EXISTS managed_databases (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name               VARCHAR(48)  NOT NULL,
    engine             VARCHAR(16)  NOT NULL,
    version            VARCHAR(32)  NOT NULL DEFAULT '',
    container_name     VARCHAR(80)  NOT NULL DEFAULT '',
    host_port          INTEGER      NOT NULL,
    db_name            VARCHAR(63)  NOT NULL DEFAULT '',
    db_user            VARCHAR(63)  NOT NULL DEFAULT '',
    password_encrypted TEXT         NOT NULL,
    status             VARCHAR(16)  NOT NULL DEFAULT 'creating',
    last_error         TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name),
    UNIQUE(host_port)
);
ALTER TABLE managed_databases ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'local';
ALTER TABLE managed_databases ADD COLUMN IF NOT EXISTS access_ips TEXT NOT NULL DEFAULT '';
ALTER TABLE managed_databases DROP CONSTRAINT IF EXISTS managed_databases_access_mode_check;
ALTER TABLE managed_databases ADD CONSTRAINT managed_databases_access_mode_check CHECK (access_mode IN ('local','ips'));

-- +goose Down
ALTER TABLE managed_databases DROP CONSTRAINT IF EXISTS managed_databases_access_mode_check;
ALTER TABLE managed_databases DROP COLUMN IF EXISTS access_ips;
ALTER TABLE managed_databases DROP COLUMN IF EXISTS access_mode;
