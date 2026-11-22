-- +goose Up
-- A promo on a plan: a percent off the list price until a date, for new orders, renewals or both. After the date the plan costs
-- its list price again without anything being changed. A promo can be made exclusive: no voucher and no long-subscription
-- discount on top of it while it runs.
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS promo_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS promo_ends_at TIMESTAMPTZ;
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS promo_applies_to TEXT NOT NULL DEFAULT 'both';
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS promo_exclusive BOOLEAN NOT NULL DEFAULT FALSE;
-- what the promo took off an order, kept like the other discounts so an invoice adds up
ALTER TABLE hosting_orders ADD COLUMN IF NOT EXISTS discount_promo BIGINT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE hosting_orders DROP COLUMN IF EXISTS discount_promo;
ALTER TABLE hosting_plans DROP COLUMN IF EXISTS promo_exclusive;
ALTER TABLE hosting_plans DROP COLUMN IF EXISTS promo_applies_to;
ALTER TABLE hosting_plans DROP COLUMN IF EXISTS promo_ends_at;
ALTER TABLE hosting_plans DROP COLUMN IF EXISTS promo_percent;
