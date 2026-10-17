-- +goose Up
-- Hosting mode: service plans the superadmin sells, and which plan an account is on.
CREATE TABLE IF NOT EXISTS hosting_plans (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    -- whole rupiah; the panel prices in IDR only
    price_amount BIGINT NOT NULL DEFAULT 0,
    period TEXT NOT NULL DEFAULT 'monthly',
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_projects INT NOT NULL DEFAULT 5,
    max_tunnels INT NOT NULL DEFAULT 5,
    max_databases INT NOT NULL DEFAULT 3,
    disk_quota_mb BIGINT NOT NULL DEFAULT 5120,
    cpu_limit_pct INT NOT NULL DEFAULT 100,
    memory_limit_mb INT NOT NULL DEFAULT 512,
    max_subdomains INT NOT NULL DEFAULT 1,
    highlighted BOOLEAN NOT NULL DEFAULT FALSE,
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per account that was given a plan. expires_at NULL means it does not expire.
-- suspended_for_expiry marks suspensions made by the expiry check, so a renewal can lift
-- exactly those and never an account the superadmin suspended by hand.
CREATE TABLE IF NOT EXISTS user_plans (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan_id BIGINT REFERENCES hosting_plans(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    suspended_for_expiry BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_plans_expires_at ON user_plans(expires_at) WHERE expires_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_user_plans_expires_at;
DROP TABLE IF EXISTS user_plans;
DROP TABLE IF EXISTS hosting_plans;
