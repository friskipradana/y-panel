-- +goose Up
-- An order is a record of money asked for: it stays when its account is deleted. A cancelled or expired order drops the
-- account that was made for it, and until now that took the order with it, so a cancelled order simply vanished and
-- deleting a buyer erased what they paid. The order keeps the name of its buyer and loses only the link to the account.

ALTER TABLE hosting_orders ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '';
UPDATE hosting_orders o SET username = u.username FROM users u WHERE u.id = o.user_id AND o.username = '';

ALTER TABLE hosting_orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE hosting_orders DROP CONSTRAINT IF EXISTS hosting_orders_user_id_fkey;
ALTER TABLE hosting_orders ADD CONSTRAINT hosting_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE hosting_orders DROP CONSTRAINT IF EXISTS hosting_orders_user_id_fkey;
DELETE FROM hosting_orders WHERE user_id IS NULL;
ALTER TABLE hosting_orders ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE hosting_orders ADD CONSTRAINT hosting_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE hosting_orders DROP COLUMN IF EXISTS username;
