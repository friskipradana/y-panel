-- +goose Up

-- Per-user desktop widget layout (positions, settings, sticky notes)
ALTER TABLE IF EXISTS user_preferences
  ADD COLUMN IF NOT EXISTS widgets_data JSONB;

-- +goose Down

ALTER TABLE IF EXISTS user_preferences
  DROP COLUMN IF EXISTS widgets_data;
