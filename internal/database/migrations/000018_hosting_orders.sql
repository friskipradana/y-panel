-- +goose Up
-- Orders for hosting plans: a buyer picks a plan, pays an amount made unique by a small code, and the bank
-- notification of that exact amount activates the account. A renewal and a trial are orders too.
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS trial_days INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS hosting_orders (
    id BIGSERIAL PRIMARY KEY,
    -- what the buyer sees in the address of the order page: unguessable, never the numeric id
    public_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('new', 'renew', 'trial')),
    plan_id BIGINT REFERENCES hosting_plans(id) ON DELETE SET NULL,
    -- the name of the plan at the time, kept when the plan is renamed or deleted
    plan_name TEXT NOT NULL DEFAULT '',
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- how many periods of the plan this order buys
    periods INT NOT NULL DEFAULT 1,
    -- whole rupiah: the price, the code that makes the total unique, and what the buyer transfers
    amount_base BIGINT NOT NULL DEFAULT 0,
    unique_code INT NOT NULL DEFAULT 0,
    amount_total BIGINT NOT NULL DEFAULT 0,
    -- pending: waiting for the payment; review: needs the superadmin (a trial to approve, a doubtful payment)
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'review', 'paid', 'expired', 'cancelled')),
    note TEXT NOT NULL DEFAULT '',
    created_ip TEXT NOT NULL DEFAULT '',
    -- the panel address the buyer picked; created when the order is paid, and kept for them while it waits
    sub_label TEXT NOT NULL DEFAULT '',
    sub_zone_id TEXT NOT NULL DEFAULT '',
    sub_domain TEXT NOT NULL DEFAULT '',
    sub_hostname TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    notif_id BIGINT REFERENCES captured_notifications(id) ON DELETE SET NULL
);

-- two waiting orders never ask for the same total: that is what makes the match unambiguous
CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_orders_pending_total ON hosting_orders(amount_total) WHERE status = 'pending' AND amount_total > 0;
-- one bank notification pays at most one order
CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_orders_sub_reserved ON hosting_orders(sub_hostname) WHERE sub_hostname <> '' AND status IN ('pending', 'review');
CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_orders_notif ON hosting_orders(notif_id) WHERE notif_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hosting_orders_user ON hosting_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_hosting_orders_status ON hosting_orders(status, expires_at);

-- +goose Down
DROP INDEX IF EXISTS idx_hosting_orders_status;
DROP INDEX IF EXISTS idx_hosting_orders_user;
DROP INDEX IF EXISTS idx_hosting_orders_sub_reserved;
DROP INDEX IF EXISTS idx_hosting_orders_notif;
DROP INDEX IF EXISTS idx_hosting_orders_pending_total;
DROP TABLE IF EXISTS hosting_orders;
ALTER TABLE hosting_plans DROP COLUMN IF EXISTS trial_days;
