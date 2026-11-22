-- +goose Up
UPDATE runtime_logs SET service = 'reneo' WHERE service = 'ypanel';
UPDATE terminal_presets SET command = REPLACE(command, 'ypanel', 'reneo')
WHERE is_global = true AND command LIKE '%ypanel%';

-- +goose Down
UPDATE runtime_logs SET service = 'ypanel' WHERE service = 'reneo';
UPDATE terminal_presets SET command = REPLACE(command, 'reneo', 'ypanel')
WHERE is_global = true AND command LIKE '%reneo%';
