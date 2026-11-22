-- +goose Up
-- One WhatsApp session per account on the WAHA container the panel runs. The name is kept here, so renaming the
-- account does not cut the session.

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    session_name TEXT NOT NULL,
    -- what WAHA last said: STOPPED, STARTING, SCAN_QR_CODE, WORKING, FAILED
    status TEXT NOT NULL DEFAULT 'STOPPED',
    phone TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_sessions_name ON whatsapp_sessions(session_name);

-- +goose Down
DROP TABLE IF EXISTS whatsapp_sessions;
