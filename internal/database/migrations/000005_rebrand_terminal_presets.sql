-- +goose Up
UPDATE terminal_presets
SET command = REPLACE(command, 'ui-panel', 'ypanel')
WHERE is_global = true AND command LIKE '%ui-panel%';

DELETE FROM terminal_presets
WHERE is_global = true
  AND command IN (
    'systemctl status ui-panel --no-pager',
    'journalctl -u ui-panel -n 50 --no-pager'
  );

INSERT INTO terminal_presets (label, command, sort_order, is_global)
SELECT '', 'systemctl status ypanel --no-pager', 7, true
WHERE NOT EXISTS (
  SELECT 1 FROM terminal_presets
  WHERE is_global = true AND command = 'systemctl status ypanel --no-pager'
);

INSERT INTO terminal_presets (label, command, sort_order, is_global)
SELECT '', 'journalctl -u ypanel -n 50 --no-pager', 8, true
WHERE NOT EXISTS (
  SELECT 1 FROM terminal_presets
  WHERE is_global = true AND command = 'journalctl -u ypanel -n 50 --no-pager'
);

-- +goose Down
UPDATE terminal_presets
SET command = REPLACE(command, 'ypanel', 'ui-panel')
WHERE is_global = true AND command LIKE '%ypanel%';
