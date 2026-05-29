-- +goose Up
CREATE TABLE IF NOT EXISTS projects (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(120) NOT NULL,
    slug          VARCHAR(80)  NOT NULL,
    description   TEXT,
    status        VARCHAR(30)  NOT NULL DEFAULT 'draft' CHECK (status IN ('active','stopped','building','error','draft','degraded')),
    project_type  VARCHAR(30)  NOT NULL DEFAULT 'custom' CHECK (project_type IN ('static','nodejs','python','php','docker','proxy','custom')),
    repo_url      TEXT,
    working_dir   TEXT,
    exposed_port  INTEGER,
    assigned_port INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

CREATE TABLE IF NOT EXISTS project_env_vars (
    id              BIGSERIAL PRIMARY KEY,
    project_id      BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key             VARCHAR(128) NOT NULL,
    value_encrypted TEXT         NOT NULL,
    is_secret       BOOLEAN      NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, key)
);

CREATE TABLE IF NOT EXISTS project_deployments (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    triggered_by BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    commit_hash  VARCHAR(64),
    status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','building','success','failed','rollback')),
    build_log    TEXT,
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deployments_project_id ON project_deployments(project_id);

CREATE TABLE IF NOT EXISTS webhook_configs (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    secret_token VARCHAR(128) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    target_event VARCHAR(20)  NOT NULL DEFAULT 'push' CHECK (target_event IN ('push','deploy','any')),
    active       BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tunnels (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id    BIGINT       REFERENCES projects(id) ON DELETE SET NULL,
    name          VARCHAR(120) NOT NULL,
    target_url    TEXT         NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('active','inactive','error','pending','creating')),
    cf_tunnel_id  VARCHAR(128),
    cf_hostname   VARCHAR(253),
    cf_zone_id    VARCHAR(64),
    tunnel_config JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE tunnels ADD COLUMN IF NOT EXISTS cf_zone_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_tunnels_user_id ON tunnels(user_id);
CREATE INDEX IF NOT EXISTS idx_tunnels_project_id ON tunnels(project_id);

CREATE TABLE IF NOT EXISTS tunnel_logs (
    id         BIGSERIAL PRIMARY KEY,
    tunnel_id  BIGINT      NOT NULL REFERENCES tunnels(id) ON DELETE CASCADE,
    level      VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
    message    TEXT        NOT NULL,
    metadata   JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tunnel_logs_tunnel_id ON tunnel_logs(tunnel_id);
CREATE INDEX IF NOT EXISTS idx_tunnel_logs_created_at ON tunnel_logs(created_at);

CREATE TABLE IF NOT EXISTS domain_records (
    id                 BIGSERIAL PRIMARY KEY,
    user_id            BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tunnel_id          BIGINT       REFERENCES tunnels(id) ON DELETE SET NULL,
    hostname           VARCHAR(253) NOT NULL UNIQUE,
    ssl_enabled        BOOLEAN      NOT NULL DEFAULT true,
    status             VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('active','pending','error','verifying')),
    verification_token TEXT,
    verified_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE IF EXISTS domain_records;
DROP INDEX IF EXISTS idx_tunnel_logs_created_at;
DROP INDEX IF EXISTS idx_tunnel_logs_tunnel_id;
DROP TABLE IF EXISTS tunnel_logs;
DROP INDEX IF EXISTS idx_tunnels_project_id;
DROP INDEX IF EXISTS idx_tunnels_user_id;
DROP TABLE IF EXISTS tunnels;
DROP TABLE IF EXISTS webhook_configs;
DROP INDEX IF EXISTS idx_deployments_project_id;
DROP TABLE IF EXISTS project_deployments;
DROP TABLE IF EXISTS project_env_vars;
DROP INDEX IF EXISTS idx_projects_user_id;
DROP TABLE IF EXISTS projects;
