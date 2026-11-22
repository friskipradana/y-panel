-- +goose Up
-- Subdomains the superadmin sells under the domains of its own Cloudflare account.
-- hosting_domains: which zones may be used; hosting_subdomains: who holds which hostname and what it points at.
CREATE TABLE IF NOT EXISTS hosting_domains (
    zone_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hosting_subdomains (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    hostname TEXT NOT NULL UNIQUE,
    project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    -- pending | active | suspended | error
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hosting_subdomains_user ON hosting_subdomains(user_id);

-- Small key/value state of hosting mode, e.g. the id of the tunnel that carries the subdomains
CREATE TABLE IF NOT EXISTS hosting_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE IF EXISTS hosting_state;
DROP INDEX IF EXISTS idx_hosting_subdomains_user;
DROP TABLE IF EXISTS hosting_subdomains;
DROP TABLE IF EXISTS hosting_domains;
