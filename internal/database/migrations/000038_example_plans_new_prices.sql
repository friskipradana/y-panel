-- +goose Up
-- The three example plans the panel made on its own (Starter, Pro, Bisnis) are sized for a small host and start at Rp 15.000.
-- A plan is changed here only while every number of it is still what the old example had: one that the seller edited, even
-- slightly, is left alone.
UPDATE hosting_plans SET
    price_amount = 15000, disk_quota_mb = 1024, updated_at = NOW()
WHERE slug = 'starter' AND name = 'Starter' AND period = 'monthly'
  AND price_amount = 25000 AND max_projects = 2 AND max_tunnels = 2 AND max_databases = 1
  AND disk_quota_mb = 2048 AND cpu_limit_pct = 100 AND memory_limit_mb = 512 AND max_subdomains = 1 AND max_custom_domains = 0;

UPDATE hosting_plans SET
    price_amount = 39000, max_projects = 4, max_tunnels = 4, disk_quota_mb = 3072, updated_at = NOW()
WHERE slug = 'pro' AND name = 'Pro' AND period = 'monthly'
  AND price_amount = 75000 AND max_projects = 5 AND max_tunnels = 5 AND max_databases = 3
  AND disk_quota_mb = 10240 AND cpu_limit_pct = 200 AND memory_limit_mb = 1024 AND max_subdomains = 3 AND max_custom_domains = 1;

UPDATE hosting_plans SET
    price_amount = 80000, max_projects = 8, max_tunnels = 8, max_databases = 5, disk_quota_mb = 6144, cpu_limit_pct = 200,
    memory_limit_mb = 2048, max_subdomains = 6, max_custom_domains = 2,
    features = REPLACE(features::text, '"CPU dan RAM terbesar"', '"RAM 2 GB dan domain milik sendiri"')::jsonb,
    updated_at = NOW()
WHERE slug = 'bisnis' AND name = 'Bisnis' AND period = 'monthly'
  AND price_amount = 150000 AND max_projects = 15 AND max_tunnels = 15 AND max_databases = 10
  AND disk_quota_mb = 51200 AND cpu_limit_pct = 400 AND memory_limit_mb = 4096 AND max_subdomains = 10 AND max_custom_domains = 3;

-- +goose Down
-- the old values are not put back: a plan that has been sold at the new price must not change under its buyers
SELECT 1;
