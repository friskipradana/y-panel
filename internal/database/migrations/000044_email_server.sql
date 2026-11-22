-- +goose Up
CREATE TABLE IF NOT EXISTS hosting_state (
	key        VARCHAR(80) PRIMARY KEY,
	value      TEXT        NOT NULL DEFAULT '',
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_accounts (
	id           BIGSERIAL    PRIMARY KEY,
	user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	local_part   VARCHAR(64)  NOT NULL,
	domain       VARCHAR(253) NOT NULL,
	address      VARCHAR(320) NOT NULL UNIQUE,
	display_name VARCHAR(120) NOT NULL DEFAULT '',
	mode         VARCHAR(20)  NOT NULL DEFAULT 'mailbox' CHECK (mode IN ('mailbox','forward')),
	forward_to   VARCHAR(320) NOT NULL DEFAULT '',
	password_enc TEXT         NOT NULL DEFAULT '',
	quota_mb     INTEGER      NOT NULL DEFAULT 1024,
	enabled      BOOLEAN      NOT NULL DEFAULT true,
	note         TEXT         NOT NULL DEFAULT '',
	created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_user_id ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_domain  ON email_accounts(domain);

-- +goose Down
DROP INDEX IF EXISTS idx_email_accounts_domain;
DROP INDEX IF EXISTS idx_email_accounts_user_id;
DROP TABLE IF EXISTS email_accounts;

