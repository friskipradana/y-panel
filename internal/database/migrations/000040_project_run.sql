-- +goose Up
-- How a project runs when its folder says too little: the commands to install, build and start it, the variables it runs with
-- (kept encrypted), and, for a project made of several processes (a frontend and a backend), the processes and which path of the
-- one address goes to which. Such a project has its own type, stack.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS run_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_project_type_check
    CHECK (project_type IN ('static','nodejs','python','php','docker','proxy','custom','stack'));

-- +goose Down
-- a project of several processes has no place in the old types: it is dropped back to a custom one
UPDATE projects SET project_type = 'custom' WHERE project_type = 'stack';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_project_type_check
    CHECK (project_type IN ('static','nodejs','python','php','docker','proxy','custom'));
ALTER TABLE projects DROP COLUMN IF EXISTS run_config;
