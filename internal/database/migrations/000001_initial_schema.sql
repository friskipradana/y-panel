-- +goose Up
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(80)  NOT NULL UNIQUE,
    email         VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin','admin','user')),
    status        VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending')),
    display_name  VARCHAR(120),
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(128) NOT NULL UNIQUE,
    ip_address VARCHAR(64),
    user_agent TEXT,
    expires_at TIMESTAMPTZ  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token   ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_superadmin ON users ((role)) WHERE role = 'superadmin';

CREATE TABLE IF NOT EXISTS user_quotas (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    max_projects    INT    NOT NULL DEFAULT 5,
    max_tunnels     INT    NOT NULL DEFAULT 5,
    disk_quota_mb   BIGINT NOT NULL DEFAULT 5120,
    cpu_limit_pct   INT    NOT NULL DEFAULT 100,
    memory_limit_mb INT    NOT NULL DEFAULT 512,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_cloudflare_configs (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT       NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    api_token_encrypted TEXT         NOT NULL,
    account_id          VARCHAR(64),
    zone_id             VARCHAR(64),
    base_domain         VARCHAR(253),
    status              VARCHAR(20)  NOT NULL DEFAULT 'unconfigured' CHECK (status IN ('active','invalid','unconfigured')),
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id        BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    wallpaper_data JSONB,
    theme_settings JSONB,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS user_cloudflare_configs;
DROP TABLE IF EXISTS user_quotas;
DROP INDEX IF EXISTS idx_users_single_superadmin;
DROP INDEX IF EXISTS idx_user_sessions_expires;
DROP INDEX IF EXISTS idx_user_sessions_user_id;
DROP INDEX IF EXISTS idx_user_sessions_token;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS users;
