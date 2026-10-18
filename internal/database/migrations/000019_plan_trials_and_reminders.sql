-- +goose Up
-- The end date a reminder was already sent for, so an account is told once per period and not every check.
-- A renewal moves expires_at, which makes the next period remind again.
ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS reminded_for TIMESTAMPTZ;

-- A trial upgrade: for a while the account runs on trial_plan_id while its own plan (plan_id, expires_at) waits.
-- When the trial ends, expires_at moves later by the time the trial lasted, so the paid time is not used up.
ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS trial_plan_id BIGINT REFERENCES hosting_plans(id) ON DELETE SET NULL;
ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE user_plans DROP COLUMN IF EXISTS trial_ends_at;
ALTER TABLE user_plans DROP COLUMN IF EXISTS trial_started_at;
ALTER TABLE user_plans DROP COLUMN IF EXISTS trial_plan_id;
ALTER TABLE user_plans DROP COLUMN IF EXISTS reminded_for;
