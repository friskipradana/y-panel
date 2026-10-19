-- +goose Up
-- The key of a listener phone is only ever compared by its hash: the plain copy kept next to it is not needed and is cleared.

UPDATE notification_devices SET api_key_plain = '' WHERE api_key_plain <> '';

CREATE INDEX IF NOT EXISTS idx_notification_devices_key_hash ON notification_devices (api_key_hash);

-- +goose Down
DROP INDEX IF EXISTS idx_notification_devices_key_hash;
