-- +goose Up
ALTER TABLE IF EXISTS app_license_plans
    ADD COLUMN IF NOT EXISTS trial_days INT NOT NULL DEFAULT 7;

-- +goose Down
ALTER TABLE IF EXISTS app_license_plans
    DROP COLUMN IF EXISTS trial_days;
