-- +goose Up

-- Payment gateway configuration (stored as key-value settings)
CREATE TABLE IF NOT EXISTS payment_settings (
    id          BIGSERIAL PRIMARY KEY,
    key         VARCHAR(100) NOT NULL UNIQUE,
    value       TEXT NOT NULL DEFAULT '',
    is_secret   BOOLEAN NOT NULL DEFAULT FALSE,
    label       VARCHAR(200) NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default payment gateway configuration keys
INSERT INTO payment_settings (key, value, is_secret, label, description) VALUES
    ('active_gateway',      '',            FALSE, 'Active Gateway',              'Payment gateway to use: midtrans or xendit'),
    ('midtrans_server_key', '',            TRUE,  'Midtrans Server Key',         'Midtrans production/sandbox server key'),
    ('midtrans_client_key', '',            FALSE, 'Midtrans Client Key',         'Midtrans production/sandbox client key (public)'),
    ('midtrans_environment','sandbox',     FALSE, 'Midtrans Environment',        'midtrans environment: sandbox or production'),
    ('xendit_secret_key',   '',            TRUE,  'Xendit Secret Key',           'Xendit production/sandbox secret API key'),
    ('xendit_callback_token','',           TRUE,  'Xendit Callback Token',       'Xendit webhook verification token'),
    ('currency',            'IDR',         FALSE, 'Currency',                    'Transaction currency code'),
    ('webhook_url',         '',            FALSE, 'Webhook URL',                 'URL for payment gateway to send callbacks to'),
    ('auto_confirm',        'false',       FALSE, 'Auto Confirm',                'Automatically confirm matching notifications: true or false'),
    ('notification_tolerance_sec', '300',  FALSE, 'Notification Tolerance (sec)', 'Time window in seconds to match notifications with payments')
ON CONFLICT (key) DO NOTHING;

-- Notification Listener devices (Android phones forwarding notifications)
CREATE TABLE IF NOT EXISTS notification_devices (
    id              BIGSERIAL PRIMARY KEY,
    device_id       VARCHAR(200) NOT NULL UNIQUE,
    api_key_hash    VARCHAR(200) NOT NULL,
    api_key_plain   VARCHAR(200) NOT NULL DEFAULT '',
    package_filter  JSONB DEFAULT '[]',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Captured notifications from Android NotificationListener
CREATE TABLE IF NOT EXISTS captured_notifications (
    id              BIGSERIAL PRIMARY KEY,
    device_id       VARCHAR(200) NOT NULL,
    device_ref_id   BIGINT REFERENCES notification_devices(id) ON DELETE CASCADE,
    package_name    VARCHAR(200) NOT NULL,
    app_name        VARCHAR(200),
    title           TEXT,
    body            TEXT,
    amount_detected VARCHAR(50),
    raw_payload     JSONB DEFAULT '{}',
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captured_notifications_device ON captured_notifications(device_id);
CREATE INDEX IF NOT EXISTS idx_captured_notifications_received ON captured_notifications(received_at DESC);

-- +goose Down
DROP TABLE IF EXISTS captured_notifications;
DROP TABLE IF EXISTS notification_devices;
DROP TABLE IF EXISTS payment_settings;
