-- +goose Up
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS included_catalog_id VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE hosting_plans ADD COLUMN IF NOT EXISTS included_license_plan_slug VARCHAR(80) NOT NULL DEFAULT '';
