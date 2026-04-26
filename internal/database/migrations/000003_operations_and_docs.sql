-- +goose Up
CREATE TABLE IF NOT EXISTS docker_services (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id     BIGINT       REFERENCES projects(id) ON DELETE SET NULL,
    container_id   VARCHAR(128),
    container_name VARCHAR(128),
    image          TEXT         NOT NULL,
    ports          JSONB,
    env_vars       JSONB,
    volumes        JSONB,
    status         VARCHAR(20)  NOT NULL DEFAULT 'stopped' CHECK (status IN ('running','stopped','error','creating')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(190) NOT NULL,
    body       TEXT,
    type       VARCHAR(20)  NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','error')),
    is_read    BOOLEAN      NOT NULL DEFAULT false,
    action_url TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read);

CREATE TABLE IF NOT EXISTS runtime_logs (
    id         BIGSERIAL PRIMARY KEY,
    service    VARCHAR(80) NOT NULL DEFAULT 'panel',
    user_id    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    project_id BIGINT      REFERENCES projects(id) ON DELETE SET NULL,
    level      VARCHAR(10) NOT NULL DEFAULT 'info',
    message    TEXT        NOT NULL,
    metadata   JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_runtime_logs_created_at ON runtime_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_runtime_logs_service ON runtime_logs(service);

CREATE TABLE IF NOT EXISTS changelog_entries (
    id          BIGSERIAL PRIMARY KEY,
    version     VARCHAR(32)  NOT NULL,
    title       VARCHAR(190) NOT NULL,
    summary     TEXT         NOT NULL,
    released_at VARCHAR(32)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(version, title)
);

CREATE TABLE IF NOT EXISTS settings_audit (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    hostname    VARCHAR(253),
    timezone    VARCHAR(80),
    nameservers JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settings_audit_created_at ON settings_audit(created_at);

CREATE TABLE IF NOT EXISTS terminal_presets (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT       REFERENCES users(id) ON DELETE CASCADE,
    label      VARCHAR(190) NOT NULL DEFAULT '',
    command    TEXT         NOT NULL,
    sort_order INTEGER      NOT NULL DEFAULT 0,
    is_global  BOOLEAN      NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_terminal_presets_sort ON terminal_presets(sort_order, id);

CREATE TABLE IF NOT EXISTS payment_plans (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(80)  NOT NULL,
    slug          VARCHAR(30)  NOT NULL UNIQUE,
    max_projects  INTEGER      NOT NULL DEFAULT 5,
    max_tunnels   INTEGER      NOT NULL DEFAULT 5,
    disk_quota_mb BIGINT       NOT NULL DEFAULT 5120,
    price_idr     INTEGER      NOT NULL DEFAULT 0,
    active        BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS docs (
    id             BIGSERIAL PRIMARY KEY,
    author_user_id BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    title          VARCHAR(190) NOT NULL,
    slug           VARCHAR(120) NOT NULL UNIQUE,
    excerpt        TEXT         NOT NULL DEFAULT '',
    content        TEXT         NOT NULL DEFAULT '',
    status         VARCHAR(20)  NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_status_created ON docs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_author_id ON docs(author_user_id);

-- +goose Down
DROP INDEX IF EXISTS idx_docs_author_id;
DROP INDEX IF EXISTS idx_docs_status_created;
DROP TABLE IF EXISTS docs;
DROP TABLE IF EXISTS payment_plans;
DROP INDEX IF EXISTS idx_terminal_presets_sort;
DROP TABLE IF EXISTS terminal_presets;
DROP INDEX IF EXISTS idx_settings_audit_created_at;
DROP TABLE IF EXISTS settings_audit;
DROP TABLE IF EXISTS changelog_entries;
DROP INDEX IF EXISTS idx_runtime_logs_service;
DROP INDEX IF EXISTS idx_runtime_logs_created_at;
DROP TABLE IF EXISTS runtime_logs;
DROP INDEX IF EXISTS idx_notifications_user_id;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS docker_services;
