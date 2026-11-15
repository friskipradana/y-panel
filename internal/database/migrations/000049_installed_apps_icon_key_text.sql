-- +goose Up
ALTER TABLE installed_apps
    ALTER COLUMN icon_key TYPE TEXT;

-- +goose Down
ALTER TABLE installed_apps
    ALTER COLUMN icon_key TYPE VARCHAR(40);
