-- +goose Up

-- Payment transactions (invoices/orders linked to projects or users)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    reference_id    VARCHAR(200) NOT NULL DEFAULT '',
    gateway         VARCHAR(50) NOT NULL DEFAULT '',
    amount          BIGINT NOT NULL DEFAULT 0,
    currency        VARCHAR(10) NOT NULL DEFAULT 'IDR',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    description     TEXT NOT NULL DEFAULT '',
    external_id     VARCHAR(200) NOT NULL DEFAULT '',
    paid_at         TIMESTAMPTZ,
    matched_notif_id BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_amount ON payment_transactions(amount) WHERE status = 'pending';

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_txn_matched_notif'
  ) THEN
    ALTER TABLE payment_transactions
      ADD CONSTRAINT fk_payment_txn_matched_notif
      FOREIGN KEY (matched_notif_id) REFERENCES captured_notifications(id) ON DELETE SET NULL;
  END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE IF EXISTS payment_transactions
  DROP CONSTRAINT IF EXISTS fk_payment_txn_matched_notif;
DROP TABLE IF EXISTS payment_transactions;
