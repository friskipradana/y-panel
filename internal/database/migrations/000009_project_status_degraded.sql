-- +goose Up
-- +goose StatementBegin
DO $$
DECLARE
  status_constraint_name text;
BEGIN
  SELECT c.conname
    INTO status_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = current_schema()
    AND t.relname = 'projects'
    AND c.contype = 'c'
    AND (
      c.conname = 'projects_status_check'
      OR pg_get_constraintdef(c.oid) LIKE '%status%'
    )
  ORDER BY (c.conname = 'projects_status_check') DESC
  LIMIT 1;

  IF status_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE projects DROP CONSTRAINT %I', status_constraint_name);
  END IF;

  ALTER TABLE projects
    ADD CONSTRAINT projects_status_check
    CHECK (status IN ('active','stopped','building','error','draft','degraded'));
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
DECLARE
  status_constraint_name text;
BEGIN
  UPDATE projects
  SET status = 'error',
      updated_at = NOW()
  WHERE status = 'degraded';

  SELECT c.conname
    INTO status_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = current_schema()
    AND t.relname = 'projects'
    AND c.contype = 'c'
    AND (
      c.conname = 'projects_status_check'
      OR pg_get_constraintdef(c.oid) LIKE '%status%'
    )
  ORDER BY (c.conname = 'projects_status_check') DESC
  LIMIT 1;

  IF status_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE projects DROP CONSTRAINT %I', status_constraint_name);
  END IF;

  ALTER TABLE projects
    ADD CONSTRAINT projects_status_check
    CHECK (status IN ('active','stopped','building','error','draft'));
END $$;
-- +goose StatementEnd
