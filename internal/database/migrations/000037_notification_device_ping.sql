-- +goose Up
-- The last time a listener phone reached the panel with a valid key, also with the test of its app, which keeps no notification
-- behind: without it a phone that only tested looked as if it had never connected.
ALTER TABLE notification_devices ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE notification_devices DROP COLUMN IF EXISTS last_ping_at;
