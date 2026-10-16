package mcp

// extraSpecs covers features added after the first catalog: user-managed databases (container
// based PostgreSQL, MySQL, MariaDB, MongoDB, Redis), terminal presets, own usage and panel updates.
func extraSpecs() []apiSpec {
	dbID := pathParam("id", "Database ID (from db_list).")
	table := pathParam("table", "Table name (from db_tables).")
	columnItems := &Property{
		Type:        "object",
		Description: `Column: {"name":"id","type":"integer","primaryKey":true,"autoIncrement":true,"nullable":false}. Types: integer, bigint, text, varchar (with "length"), boolean, decimal, date, timestamp, json. Optional "default".`,
	}

	return []apiSpec{
		// ── Databases (user-managed containers) ──────────────────────────
		{Name: "db_engines", Title: "Database engines", Method: "GET", Path: "/api/v1/databases/engines",
			Desc: "List the database engines that can be created (PostgreSQL, MySQL, MariaDB, MongoDB, Redis) with their selectable versions and the default version."},
		{Name: "db_list", Title: "List databases", Method: "GET", Path: "/api/v1/databases",
			Desc: "List the databases of this account: engine, version, host port, status (preparing, ready, failed) and whether the container is running."},
		{Name: "db_create", Title: "Create database", Method: "POST", Path: "/api/v1/databases", Hint: "write",
			Desc: "Create a database as a Docker container bound to 127.0.0.1. The first creation of an engine pulls its image, so status stays `preparing` for a while; poll db_list until it is `ready`. Credentials are generated and read with db_credentials.",
			Params: []apiParam{
				strParam("name", "Database name (letters, numbers, dash or underscore).", true),
				{Name: "engine", In: inBody, Type: "string", Desc: "Engine id.", Required: true, Enum: []string{"postgres", "mysql", "mariadb", "mongodb", "redis"}},
				strParam("version", "Exact image tag from db_engines (for example 16.9). Omit for the engine default.", false),
			}},
		{Name: "db_credentials", Title: "Database credentials", Method: "GET", Path: "/api/v1/databases/{id}/credentials",
			Desc:   "Read the host, port, database, username, password and connection URL of one database. The password is a secret: do not log or repeat it.",
			Params: []apiParam{dbID}},
		{Name: "db_start", Title: "Start database", Method: "POST", Path: "/api/v1/databases/{id}/start", Hint: "write",
			Desc: "Start a stopped database container.", Params: []apiParam{dbID}},
		{Name: "db_stop", Title: "Stop database", Method: "POST", Path: "/api/v1/databases/{id}/stop", Hint: "write",
			Desc: "Stop a running database container. Data is kept.", Params: []apiParam{dbID}},
		{Name: "db_delete", Title: "Delete database", Method: "DELETE", Path: "/api/v1/databases/{id}",
			Desc: "Delete a database: the container and its data volume are removed and cannot be recovered.", Params: []apiParam{dbID}},
		{Name: "db_tables", Title: "List tables", Method: "GET", Path: "/api/v1/databases/{id}/tables",
			Desc:   "List tables (PostgreSQL, MySQL, MariaDB), collections (MongoDB) or a sample of keys (Redis). The database must be running.",
			Params: []apiParam{dbID}},
		{Name: "db_browse", Title: "Browse table rows", Method: "GET", Path: "/api/v1/databases/{id}/tables/{table}",
			Desc: "Read a page of rows from one table (SQL engines). Returns columns, rows (strings) and whether the page was truncated.",
			Params: []apiParam{dbID, table,
				queryParam("limit", "integer", "Rows per page, 1-500 (default 100)."),
				queryParam("offset", "integer", "Rows to skip.")}},
		{Name: "db_table_create", Title: "Create table", Method: "POST", Path: "/api/v1/databases/{id}/tables", Hint: "write",
			Desc: "Create a table with typed columns (SQL engines).",
			Params: []apiParam{dbID,
				strParam("name", "Table name (letters, numbers, underscore).", true),
				{Name: "columns", In: inBody, Type: "array", Desc: "Column definitions.", Required: true, Items: columnItems}}},
		{Name: "db_table_drop", Title: "Drop table", Method: "DELETE", Path: "/api/v1/databases/{id}/tables/{table}",
			Desc: "Drop a table and all of its rows.", Params: []apiParam{dbID, table}},
		{Name: "db_query", Title: "Run SQL or Redis command", Method: "POST", Path: "/api/v1/databases/{id}/query", Hint: "write",
			Desc: "Run one statement as the database owner: SQL for PostgreSQL, MySQL and MariaDB, a command line for Redis. Statements can change or delete data; read-only queries return columns and rows.",
			Params: []apiParam{dbID,
				{Name: "statement", In: inBody, Type: "string", Desc: "SQL statement or Redis command.", Required: true},
				intParam("maxRows", "Maximum rows to return (default 200, max 5000).", false)}},
		{Name: "db_users", Title: "List database users", Method: "GET", Path: "/api/v1/databases/{id}/users",
			Desc: "List the accounts that exist inside the database engine.", Params: []apiParam{dbID}},
		{Name: "db_user_create", Title: "Create database user", Method: "POST", Path: "/api/v1/databases/{id}/users", Hint: "write",
			Desc: "Create an extra database account with a preset access level: read, write or all.",
			Params: []apiParam{dbID,
				strParam("username", "New account name.", true),
				strParam("password", "8-64 characters: letters, numbers and ! @ # % ^ * _ + = . , : -", true),
				{Name: "access", In: inBody, Type: "string", Desc: "Access preset.", Required: true, Enum: []string{"read", "write", "all"}}}},
		{Name: "db_user_delete", Title: "Delete database user", Method: "DELETE", Path: "/api/v1/databases/{id}/users/{name}",
			Desc:   "Remove an extra database account.",
			Params: []apiParam{dbID, pathParam("name", "Account name (from db_users).")}},
		{Name: "db_password_set", Title: "Set database password", Method: "POST", Path: "/api/v1/databases/{id}/password", Hint: "write",
			Desc: "Change the owner password. Omit newPassword to generate a strong one; the new value is returned once.",
			Params: []apiParam{dbID,
				{Name: "new_password", Key: "newPassword", In: inBody, Type: "string", Desc: "New password, 8-64 characters. Omit to generate."}}},

		// ── Terminal presets ─────────────────────────────────────────────
		{Name: "terminal_preset_create", Title: "Create terminal preset", Method: "POST", Path: "/api/v1/terminal/presets", Hint: "write",
			Desc: "Save a command as a terminal preset button for this account.",
			Params: []apiParam{
				strParam("label", "Button label.", true),
				strParam("command", "Command line that the preset types into a terminal.", true)}},
		{Name: "terminal_preset_delete", Title: "Delete terminal preset", Method: "DELETE", Path: "/api/v1/terminal/presets/{id}",
			Desc: "Delete one of the account's terminal presets.", Params: []apiParam{pathParam("id", "Preset ID (from terminal_presets_list).")}},

		// ── Account usage ────────────────────────────────────────────────
		{Name: "usage_get", Title: "My usage", Method: "GET", Path: "/api/v1/me/usage",
			Desc: "What this account consumes against its quota: projects, tunnels, databases and disk."},

		// ── Panel updates ────────────────────────────────────────────────
		{Name: "update_status", SuperOnly: true, Title: "Update progress", Method: "GET", Path: "/api/v1/system/update/status", AdminOnly: true,
			Desc: "State of a running or finished panel update: running, done, failed, with the installer log lines."},
		{Name: "update_apply", SuperOnly: true, Title: "Apply panel update", Method: "POST", Path: "/api/v1/system/update/apply", AdminOnly: true, Hint: "write",
			Desc: "Start the panel update (superadmin only). The service restarts for a moment; follow progress with update_status. Requires confirm=true.",
			Params: []apiParam{
				boolParam("confirm", "Must be true: the update restarts the panel."),
				strParam("version", "Target version without the v prefix. Omit for the latest release.", false)}},

		// ── Docs ─────────────────────────────────────────────────────────
		{Name: "docs_official_list", Title: "Official articles", Method: "GET", Path: "/api/v1/docs/official",
			Desc: "List the official articles synced from the Reneo repository (installation, MCP, databases, projects, accounts)."},
	}
}
