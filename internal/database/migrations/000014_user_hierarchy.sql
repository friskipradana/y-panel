-- +goose Up
-- Account hierarchy: who created (and therefore manages) an account.
-- Everything an account owns is isolated from the others; a superadmin sees all,
-- an admin sees itself and the accounts below it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_parent_id ON users(parent_id);

-- Existing non-superadmin accounts belong to the superadmin until it is re-assigned
UPDATE users
SET parent_id = (SELECT id FROM users WHERE role = 'superadmin' ORDER BY id LIMIT 1)
WHERE role <> 'superadmin' AND parent_id IS NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_users_parent_id;
ALTER TABLE users DROP COLUMN IF EXISTS parent_id;
