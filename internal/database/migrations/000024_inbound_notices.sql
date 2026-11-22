-- +goose Up
-- People answer the notices: "stop" must be remembered for a number that has no account behind it yet, and what the
-- channel says about a message after it left (delivered, read, failed) is kept beside the message.

CREATE TABLE IF NOT EXISTS notification_optouts (
    kind TEXT NOT NULL,
    address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (kind, address)
);

ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS provider_status TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_notification_outbox_provider ON notification_outbox(kind, provider_id) WHERE provider_id <> '';

-- +goose Down
DROP INDEX IF EXISTS idx_notification_outbox_provider;
ALTER TABLE notification_outbox DROP COLUMN IF EXISTS provider_status;
DROP TABLE IF EXISTS notification_optouts;
