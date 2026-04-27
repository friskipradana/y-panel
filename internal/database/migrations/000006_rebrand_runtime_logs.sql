-- +goose Up
UPDATE runtime_logs SET service = 'ypanel' WHERE service = 'ui-panel';

-- +goose Down
UPDATE runtime_logs SET service = 'ui-panel' WHERE service = 'ypanel';
