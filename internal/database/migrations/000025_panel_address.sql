-- +goose Up
-- The address of a buyer's own panel belongs to every plan and is not one of the plan's subdomains: it is marked, so
-- it does not use the quota, and one of the offered domains is the main one, where those addresses are made.

ALTER TABLE hosting_subdomains ADD COLUMN IF NOT EXISTS panel BOOLEAN NOT NULL DEFAULT FALSE;
-- an account that has addresses already: its first one is the panel address
UPDATE hosting_subdomains SET panel = TRUE
WHERE id IN (SELECT DISTINCT ON (user_id) id FROM hosting_subdomains ORDER BY user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_subdomains_panel ON hosting_subdomains(user_id) WHERE panel;

ALTER TABLE hosting_domains ADD COLUMN IF NOT EXISTS is_main BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE hosting_domains SET is_main = TRUE
WHERE zone_id = (SELECT zone_id FROM hosting_domains WHERE enabled ORDER BY created_at, name LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM hosting_domains WHERE is_main);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_domains_main ON hosting_domains((TRUE)) WHERE is_main;

-- +goose Down
DROP INDEX IF EXISTS idx_hosting_domains_main;
ALTER TABLE hosting_domains DROP COLUMN IF EXISTS is_main;
DROP INDEX IF EXISTS idx_hosting_subdomains_panel;
ALTER TABLE hosting_subdomains DROP COLUMN IF EXISTS panel;
