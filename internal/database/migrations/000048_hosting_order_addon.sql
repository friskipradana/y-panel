-- +goose Up
ALTER TABLE hosting_orders
    ADD COLUMN IF NOT EXISTS addon_catalog_id VARCHAR(80) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS addon_amount BIGINT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE hosting_orders
    DROP COLUMN IF EXISTS addon_amount,
    DROP COLUMN IF EXISTS addon_catalog_id;
