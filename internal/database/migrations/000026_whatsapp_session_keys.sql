-- +goose Up
-- Each WhatsApp session gets an API key of its own in WAHA, limited to that session. The panel acts on a session
-- with that key, so even a mistake in the panel cannot reach another account's session. Only the agent holds it.

ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS api_key_id TEXT NOT NULL DEFAULT '';
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE whatsapp_sessions DROP COLUMN IF EXISTS api_key_encrypted;
ALTER TABLE whatsapp_sessions DROP COLUMN IF EXISTS api_key_id;
