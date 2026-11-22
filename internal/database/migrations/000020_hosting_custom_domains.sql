-- +goose Up
-- A buyer may bring a domain of their own: they point a CNAME at the panel's address and it becomes another
-- sign-in address for their panel. The domain is registered at Cloudflare as a custom hostname, which issues its certificate.
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS max_custom_domains INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS hosting_custom_domains (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hostname TEXT NOT NULL,
    -- the id Cloudflare gave the custom hostname, needed to read its state and to remove it
    cf_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error', 'suspended')),
    ssl_status TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_custom_domains_hostname ON hosting_custom_domains(hostname);
CREATE INDEX IF NOT EXISTS idx_hosting_custom_domains_user ON hosting_custom_domains(user_id);

-- +goose Down
DROP INDEX IF EXISTS idx_hosting_custom_domains_user;
DROP INDEX IF EXISTS idx_hosting_custom_domains_hostname;
DROP TABLE IF EXISTS hosting_custom_domains;
ALTER TABLE hosting_plans DROP COLUMN IF EXISTS max_custom_domains;
