-- +goose Up
-- A buyer's own domain can be served by the public proxy of the server (provider "direct") instead of Cloudflare for SaaS
-- (provider "cloudflare"). A direct domain proves its owner with a TXT record that holds a token, and is served only
-- after that.
ALTER TABLE hosting_custom_domains ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'cloudflare';
ALTER TABLE hosting_custom_domains ADD COLUMN IF NOT EXISTS verify_token TEXT NOT NULL DEFAULT '';
ALTER TABLE hosting_custom_domains ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE hosting_custom_domains DROP COLUMN IF EXISTS verified_at;
ALTER TABLE hosting_custom_domains DROP COLUMN IF EXISTS verify_token;
ALTER TABLE hosting_custom_domains DROP COLUMN IF EXISTS provider;
