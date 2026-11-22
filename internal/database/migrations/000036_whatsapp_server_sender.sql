-- +goose Up
-- An account whose plan does not bring its own WhatsApp gets its notices from the WhatsApp of the server, to a number it
-- proved is its own with a code sent there. The flag tells the queue to send from the seller's session, not the account's.
ALTER TABLE notification_recipients ADD COLUMN IF NOT EXISTS via_server BOOLEAN NOT NULL DEFAULT false;

-- the code that waits to be typed back: only a hash of it is kept, it expires, and it is tried a few times at most
CREATE TABLE IF NOT EXISTS whatsapp_verifications (
    user_id     BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    phone       TEXT        NOT NULL,
    code_hash   TEXT        NOT NULL,
    attempts    INT         NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sends_day   DATE        NOT NULL DEFAULT CURRENT_DATE,
    sends_today INT         NOT NULL DEFAULT 1
);

-- +goose Down
DROP TABLE IF EXISTS whatsapp_verifications;
ALTER TABLE notification_recipients DROP COLUMN IF EXISTS via_server;
