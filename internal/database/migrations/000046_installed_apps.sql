-- +goose Up
CREATE TABLE IF NOT EXISTS installed_apps (
	id             BIGSERIAL    PRIMARY KEY,
	user_id        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	slug           VARCHAR(80)  NOT NULL,
	catalog_id     VARCHAR(80)  NOT NULL DEFAULT '',
	name           VARCHAR(120) NOT NULL,
	tagline        VARCHAR(240) NOT NULL DEFAULT '',
	category       VARCHAR(40)  NOT NULL DEFAULT 'utilities',
	icon_key       VARCHAR(40)  NOT NULL DEFAULT 'globe',
	icon_color     VARCHAR(24)  NOT NULL DEFAULT 'blue',
	kind           VARCHAR(20)  NOT NULL DEFAULT 'docker',
	image          VARCHAR(255) NOT NULL DEFAULT '',
	container_name VARCHAR(120) NOT NULL DEFAULT '',
	host_port      INTEGER      NOT NULL DEFAULT 0,
	container_port INTEGER      NOT NULL DEFAULT 0,
	open_path      VARCHAR(255) NOT NULL DEFAULT '/',
	target_url     TEXT         NOT NULL DEFAULT '',
	use_proxy      BOOLEAN      NOT NULL DEFAULT true,
	config_json    TEXT         NOT NULL DEFAULT '{}',
	created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
	UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_installed_apps_user ON installed_apps(user_id);

ALTER TABLE user_quotas ADD COLUMN IF NOT EXISTS max_apps INTEGER NOT NULL DEFAULT 3;
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS max_apps INTEGER NOT NULL DEFAULT 2;

-- +goose Down
ALTER TABLE hosting_plans DROP COLUMN IF EXISTS max_apps;
ALTER TABLE user_quotas DROP COLUMN IF EXISTS max_apps;
DROP INDEX IF EXISTS idx_installed_apps_user;
DROP TABLE IF EXISTS installed_apps;

