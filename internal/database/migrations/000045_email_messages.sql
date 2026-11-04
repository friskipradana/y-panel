-- +goose Up
CREATE TABLE IF NOT EXISTS email_messages (
	id           BIGSERIAL    PRIMARY KEY,
	account_id   BIGINT       NOT NULL DEFAULT 0,
	direction    VARCHAR(20)  NOT NULL DEFAULT 'inbound',
	from_addr    VARCHAR(320) NOT NULL,
	from_name    VARCHAR(120) NOT NULL DEFAULT '',
	to_addr      VARCHAR(320) NOT NULL,
	subject      VARCHAR(500) NOT NULL DEFAULT '',
	snippet      VARCHAR(500) NOT NULL DEFAULT '',
	body_text    TEXT         NOT NULL DEFAULT '',
	body_html    TEXT         NOT NULL DEFAULT '',
	is_read      BOOLEAN      NOT NULL DEFAULT false,
	is_starred   BOOLEAN      NOT NULL DEFAULT false,
	message_id   VARCHAR(255) NOT NULL DEFAULT '',
	received_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_account ON email_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_received ON email_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_to_addr ON email_messages(to_addr);

-- +goose Down
DROP INDEX IF EXISTS idx_email_messages_to_addr;
DROP INDEX IF EXISTS idx_email_messages_received;
DROP INDEX IF EXISTS idx_email_messages_account;
DROP TABLE IF EXISTS email_messages;

