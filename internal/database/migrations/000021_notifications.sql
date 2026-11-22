-- +goose Up
-- Delivery of notices outside the panel (Telegram first): the channels the owner sets up, where each account
-- wants its notices, the queue everything goes through, and what is needed to tell a new device from a known one.

CREATE TABLE IF NOT EXISTS notification_channels (
    kind TEXT PRIMARY KEY CHECK (kind IN ('telegram', 'whatsapp_cloud', 'waha')),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    -- what is not secret: the name of the bot, the phone number id, the address of the WAHA server
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- the token or key, encrypted with the panel's key
    secret_encrypted TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unconfigured',
    last_error TEXT NOT NULL DEFAULT '',
    checked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_recipients (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('telegram', 'whatsapp_cloud', 'waha')),
    -- the chat id (Telegram) or the phone number; empty while a link is waiting to be completed
    address TEXT NOT NULL DEFAULT '',
    verified_at TIMESTAMPTZ,
    -- events (or groups such as 'attack') the account switched off
    muted_events TEXT[] NOT NULL DEFAULT '{}',
    locale TEXT NOT NULL DEFAULT 'id',
    -- set when the channel says the recipient blocked the bot; nothing is sent until they link again
    blocked_at TIMESTAMPTZ,
    link_code TEXT NOT NULL DEFAULT '',
    link_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_code ON notification_recipients(link_code) WHERE link_code <> '';

CREATE TABLE IF NOT EXISTS notification_outbox (
    id BIGSERIAL PRIMARY KEY,
    event TEXT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    address TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- one message per event, recipient and channel: an event handled twice does not send twice
    idempotency_key TEXT NOT NULL,
    -- 0 sends first (attacks, security, what the seller must handle), 1 is the rest
    priority SMALLINT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- the worker that holds the message and until when; a worker that dies loses it when the lease runs out
    locked_by TEXT NOT NULL DEFAULT '',
    locked_until TIMESTAMPTZ,
    provider_id TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_outbox_key ON notification_outbox(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_due ON notification_outbox(status, priority, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_recipient ON notification_outbox(kind, address, id);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_created ON notification_outbox(created_at);

-- the last notice of each attack alert, so a restart does not repeat a message that was just sent
CREATE TABLE IF NOT EXISTS notification_alert_state (
    detector TEXT NOT NULL,
    scope TEXT NOT NULL,
    level INT NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (detector, scope)
);

CREATE TABLE IF NOT EXISTS notification_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- a device is the network of the address plus the kind of browser; the full address is not kept
CREATE TABLE IF NOT EXISTS known_devices (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, fingerprint)
);

-- +goose Down
DROP TABLE IF EXISTS known_devices;
DROP TABLE IF EXISTS notification_settings;
DROP TABLE IF EXISTS notification_alert_state;
DROP INDEX IF EXISTS idx_notification_outbox_created;
DROP INDEX IF EXISTS idx_notification_outbox_recipient;
DROP INDEX IF EXISTS idx_notification_outbox_due;
DROP INDEX IF EXISTS idx_notification_outbox_key;
DROP TABLE IF EXISTS notification_outbox;
DROP INDEX IF EXISTS idx_notification_recipients_code;
DROP TABLE IF EXISTS notification_recipients;
DROP TABLE IF EXISTS notification_channels;
