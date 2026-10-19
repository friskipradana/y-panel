-- +goose Up
-- Longer subscriptions can cost less (a percent off per number of periods), and a seller can hand out voucher codes.
-- An order keeps what it was priced with: the list price, each discount, and the voucher used.

ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS duration_discounts JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS hosting_vouchers (
    id               BIGSERIAL PRIMARY KEY,
    code             TEXT NOT NULL,
    kind             TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
    value            BIGINT NOT NULL CHECK (value > 0),
    max_uses         INTEGER NOT NULL DEFAULT 0,
    max_per_account  INTEGER NOT NULL DEFAULT 1,
    applies_to       TEXT NOT NULL DEFAULT 'both' CHECK (applies_to IN ('both', 'new', 'renew')),
    plan_ids         JSONB NOT NULL DEFAULT '[]'::jsonb,
    valid_from       TIMESTAMPTZ,
    valid_until      TIMESTAMPTZ,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    note             TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_vouchers_code ON hosting_vouchers (UPPER(code));

ALTER TABLE hosting_orders ADD COLUMN IF NOT EXISTS amount_list BIGINT NOT NULL DEFAULT 0;
ALTER TABLE hosting_orders ADD COLUMN IF NOT EXISTS discount_duration BIGINT NOT NULL DEFAULT 0;
ALTER TABLE hosting_orders ADD COLUMN IF NOT EXISTS discount_voucher BIGINT NOT NULL DEFAULT 0;
ALTER TABLE hosting_orders ADD COLUMN IF NOT EXISTS voucher_code TEXT NOT NULL DEFAULT '';
-- orders made before this have no list price kept: it was what they cost
UPDATE hosting_orders SET amount_list = amount_base WHERE amount_list = 0 AND amount_base > 0;
CREATE INDEX IF NOT EXISTS idx_hosting_orders_voucher ON hosting_orders (UPPER(voucher_code)) WHERE voucher_code <> '';

-- +goose Down
DROP INDEX IF EXISTS idx_hosting_orders_voucher;
ALTER TABLE hosting_orders DROP COLUMN IF EXISTS voucher_code;
ALTER TABLE hosting_orders DROP COLUMN IF EXISTS discount_voucher;
ALTER TABLE hosting_orders DROP COLUMN IF EXISTS discount_duration;
ALTER TABLE hosting_orders DROP COLUMN IF EXISTS amount_list;
DROP TABLE IF EXISTS hosting_vouchers;
ALTER TABLE hosting_plans DROP COLUMN IF EXISTS duration_discounts;
