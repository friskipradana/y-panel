-- +goose Up
-- An upgrade can be paid as the difference for the time that is left: the plan changes at once and the end date stays.
ALTER TABLE hosting_orders ADD COLUMN IF NOT EXISTS upgrade_difference BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE hosting_orders DROP COLUMN IF EXISTS upgrade_difference;
