-- +goose Up
-- A notice to a buyer who has not connected anything yet is sent from another account's WhatsApp session (the
-- superadmin's), so the queue keeps whose session sends it. 0 means the account's own session.

ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS sender_user_id BIGINT NOT NULL DEFAULT 0;

-- The address the buyer ordered from, so a notice about the order can link back to it.
ALTER TABLE hosting_orders ADD COLUMN IF NOT EXISTS public_base TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE hosting_orders DROP COLUMN IF EXISTS public_base;
ALTER TABLE notification_outbox DROP COLUMN IF EXISTS sender_user_id;
