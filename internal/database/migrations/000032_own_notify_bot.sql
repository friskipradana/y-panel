-- +goose Up
-- A plan can include the right to bring your own notification bot: the account keeps its own Telegram bot token and its
-- notices leave from that bot instead of the seller's.
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS own_notify BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_telegram_bots (
    user_id       BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_enc     TEXT        NOT NULL,
    bot_username  TEXT        NOT NULL DEFAULT '',
    bot_name      TEXT        NOT NULL DEFAULT '',
    enabled       BOOLEAN     NOT NULL DEFAULT true,
    update_offset BIGINT      NOT NULL DEFAULT 0,
    status        TEXT        NOT NULL DEFAULT 'active',
    last_error    TEXT        NOT NULL DEFAULT '',
    checked_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- a chat that was linked through the account's own bot is only reachable by that bot
ALTER TABLE notification_recipients ADD COLUMN IF NOT EXISTS own_bot BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE notification_recipients DROP COLUMN IF EXISTS own_bot;
DROP TABLE IF EXISTS user_telegram_bots;
ALTER TABLE hosting_plans DROP COLUMN IF EXISTS own_notify;
