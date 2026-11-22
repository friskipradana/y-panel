-- +goose Up
-- A session that waits for a scan must not wait for ever: when the wait began, and how many different QR codes were
-- shown meanwhile, so the panel can end the attempt and ask for a new one.

ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS scan_started_at TIMESTAMPTZ;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS qr_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS qr_changes INT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE whatsapp_sessions DROP COLUMN IF EXISTS qr_changes;
ALTER TABLE whatsapp_sessions DROP COLUMN IF EXISTS qr_hash;
ALTER TABLE whatsapp_sessions DROP COLUMN IF EXISTS scan_started_at;
