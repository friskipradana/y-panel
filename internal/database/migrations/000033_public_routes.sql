-- +goose Up
-- A server that has a public address can serve domains itself (the public proxy). Each row is a domain the proxy answers for,
-- and what it leads to: the panel, a project, or a port on this machine.
CREATE TABLE IF NOT EXISTS public_routes (
    id          BIGSERIAL    PRIMARY KEY,
    hostname    TEXT         NOT NULL UNIQUE,
    kind        TEXT         NOT NULL CHECK (kind IN ('panel', 'project', 'port')),
    project_id  BIGINT       REFERENCES projects(id) ON DELETE CASCADE,
    port        INTEGER      NOT NULL DEFAULT 0,
    enabled     BOOLEAN      NOT NULL DEFAULT true,
    note        TEXT         NOT NULL DEFAULT '',
    checked_at  TIMESTAMPTZ,
    check_ok    BOOLEAN      NOT NULL DEFAULT false,
    check_error TEXT         NOT NULL DEFAULT '',
    created_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE IF EXISTS public_routes;
