-- +goose Up
-- The seller can word a notice in their own way. A row replaces the text of one event in one language; no row means the text
-- that comes with Reneo.
CREATE TABLE IF NOT EXISTS notification_templates (
    event      TEXT        NOT NULL,
    locale     TEXT        NOT NULL,
    body       TEXT        NOT NULL,
    updated_by BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event, locale)
);

-- +goose Down
DROP TABLE IF EXISTS notification_templates;
