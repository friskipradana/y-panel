-- +goose Up
ALTER TABLE hosting_orders
    ADD COLUMN IF NOT EXISTS addon_plan_slug VARCHAR(80) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS addon_months INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE hosting_orders
    DROP COLUMN IF EXISTS addon_months,
    DROP COLUMN IF EXISTS addon_plan_slug;
