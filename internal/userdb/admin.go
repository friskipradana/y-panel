package userdb

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// Administration of a user database. Everything runs through the client that ships
// inside the database container (psql, mysql/mariadb, redis-cli, mongosh), so the
// panel needs no database drivers and the credentials never leave the host.

const (
	queryTimeout  = 20 * time.Second
	maxOutputSize = 2 << 20
	// DefaultMaxRows caps how many rows one query returns to the browser.
	DefaultMaxRows = 500
)

var (
	identRe    = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,62}$`)
	passwordRe = regexp.MustCompile(`^[A-Za-z0-9!@#%^*_+=.,:-]{8,64}$`)
)

// Conn is what is needed to talk to one database.
type Conn struct {
	ID       int64
	Engine   Engine
	Database string
	User     string
	Password string
}

// Result is a tabular answer.
type Result struct {
	Columns    []string   `json:"columns"`
	Rows       [][]string `json:"rows"`
	Truncated  bool       `json:"truncated"`
	DurationMs int64      `json:"durationMs"`
	Message    string     `json:"message,omitempty"`
}

// ValidateIdentifier checks a table, column or user name.
func ValidateIdentifier(name string) error {
	if !identRe.MatchString(name) {
		return errors.New("name must start with a letter or underscore and use only letters, numbers and underscores (max 63)")
	}
	return nil
}

// ValidatePassword keeps secrets free of characters that would need SQL or shell escaping.
func ValidatePassword(password string) error {
	if !passwordRe.MatchString(password) {
		return errors.New("password must be 8-64 characters: letters, numbers and ! @ # % ^ * _ + = . , : -")
	}
	return nil
}

func isSQL(e Engine) bool { return e.ID == "postgres" || e.ID == "mysql" || e.ID == "mariadb" }

// IsSQL reports whether tables, SQL and grants apply to the engine.
func IsSQL(e Engine) bool { return isSQL(e) }

func quote(e Engine, ident string) string {
	if e.ID == "postgres" {
		return `"` + strings.ReplaceAll(ident, `"`, `""`) + `"`
	}
	return "`" + strings.ReplaceAll(ident, "`", "``") + "`"
}

// lit renders a validated plain string as a SQL literal.
func lit(value string) string { return "'" + strings.ReplaceAll(value, "'", "''") + "'" }

func containerName(c Conn) string { return ContainerName(c.ID) }

// runClient executes args inside the container with env passed by name.
func runClient(ctx context.Context, c Conn, env map[string]string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()
	dockerArgs := []string{"exec", "-i"}
	environ := os.Environ()
	for k, v := range env {
		dockerArgs = append(dockerArgs, "-e", k)
		environ = append(environ, k+"="+v)
	}
	dockerArgs = append(dockerArgs, containerName(c))
	dockerArgs = append(dockerArgs, args...)
	cmd := exec.CommandContext(ctx, "docker", dockerArgs...)
	cmd.Env = environ
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &limitedWriter{w: &stdout, left: maxOutputSize}
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		if ctx.Err() == context.DeadlineExceeded {
			msg = "query timed out"
		}
		if msg == "" {
			msg = err.Error()
		}
		return nil, errors.New(firstLine(msg))
	}
	return stdout.Bytes(), nil
}

type limitedWriter struct {
	w    *bytes.Buffer
	left int
}

func (l *limitedWriter) Write(p []byte) (int, error) {
	if l.left <= 0 {
		return len(p), nil
	}
	if len(p) > l.left {
		l.w.Write(p[:l.left])
		l.left = 0
		return len(p), nil
	}
	l.w.Write(p)
	l.left -= len(p)
	return len(p), nil
}

// adminCreds returns the account that may manage the database: the owner for
// PostgreSQL and MongoDB, root for MySQL and MariaDB (the app user cannot create users).
func adminCreds(c Conn) (user string) {
	switch c.Engine.ID {
	case "mysql", "mariadb":
		return "root"
	}
	return c.User
}

// RunSQL runs one statement (or a script) and returns tabular output.
func RunSQL(ctx context.Context, c Conn, statement string, maxRows int, asAdmin bool) (Result, error) {
	if !isSQL(c.Engine) {
		return Result{}, errors.New("SQL is not available for this engine")
	}
	statement = strings.TrimSpace(statement)
	if statement == "" {
		return Result{}, errors.New("statement is empty")
	}
	if len(statement) > 64<<10 {
		return Result{}, errors.New("statement is too long")
	}
	if maxRows <= 0 || maxRows > 5000 {
		maxRows = DefaultMaxRows
	}
	started := time.Now()
	user := c.User
	if asAdmin {
		user = adminCreds(c)
	}

	var out []byte
	var err error
	switch c.Engine.ID {
	case "postgres":
		out, err = runClient(ctx, c, map[string]string{"PGPASSWORD": c.Password},
			"psql", "-X", "-h", "127.0.0.1", "-U", user, "-d", c.Database, "--csv", "-v", "ON_ERROR_STOP=1", "-c", statement)
	default:
		bin := "mysql"
		if c.Engine.ID == "mariadb" {
			bin = "mariadb"
		}
		out, err = runClient(ctx, c, map[string]string{"MYSQL_PWD": c.Password},
			bin, "-h", "127.0.0.1", "-u", user, "--batch", "--default-character-set=utf8mb4", c.Database, "-e", statement)
	}
	if err != nil {
		return Result{}, err
	}

	var res Result
	if c.Engine.ID == "postgres" {
		res = parseCSV(out, maxRows)
	} else {
		res = parseTSV(out, maxRows)
	}
	res.DurationMs = time.Since(started).Milliseconds()
	if len(res.Columns) == 0 {
		res.Message = "OK"
	}
	return res, nil
}

func parseCSV(out []byte, maxRows int) Result {
	reader := csv.NewReader(bytes.NewReader(out))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	records, _ := reader.ReadAll()
	if len(records) == 0 {
		return Result{Columns: []string{}, Rows: [][]string{}}
	}
	res := Result{Columns: records[0], Rows: [][]string{}}
	for _, rec := range records[1:] {
		if len(res.Rows) >= maxRows {
			res.Truncated = true
			break
		}
		res.Rows = append(res.Rows, rec)
	}
	return res
}

func unescapeMySQL(value string) string {
	if value == `\N` {
		return "NULL"
	}
	r := strings.NewReplacer(`\t`, "\t", `\n`, "\n", `\\`, `\`, `\0`, "\x00")
	return r.Replace(value)
}

func parseTSV(out []byte, maxRows int) Result {
	text := strings.TrimRight(string(out), "\n")
	if text == "" {
		return Result{Columns: []string{}, Rows: [][]string{}}
	}
	lines := strings.Split(text, "\n")
	res := Result{Columns: strings.Split(lines[0], "\t"), Rows: [][]string{}}
	for _, line := range lines[1:] {
		if len(res.Rows) >= maxRows {
			res.Truncated = true
			break
		}
		cells := strings.Split(line, "\t")
		for i := range cells {
			cells[i] = unescapeMySQL(cells[i])
		}
		res.Rows = append(res.Rows, cells)
	}
	return res
}

// Tables lists user tables (SQL), collections (MongoDB) or a key sample (Redis).
func Tables(ctx context.Context, c Conn) ([]string, error) {
	switch c.Engine.ID {
	case "postgres":
		res, err := RunSQL(ctx, c, `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename`, 1000, false)
		return firstColumn(res, err)
	case "mysql", "mariadb":
		res, err := RunSQL(ctx, c, `SHOW TABLES`, 1000, false)
		return firstColumn(res, err)
	case "redis":
		out, err := runClient(ctx, c, map[string]string{"REDISCLI_AUTH": c.Password}, "redis-cli", "--no-auth-warning", "--scan", "--count", "200")
		if err != nil {
			return nil, err
		}
		keys := []string{}
		for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			if line = strings.TrimSpace(line); line != "" {
				keys = append(keys, line)
				if len(keys) >= 200 {
					break
				}
			}
		}
		return keys, nil
	case "mongodb":
		script := `const c = db.getSiblingDB('admin'); c.auth(process.env.MONGO_USER, process.env.MONGO_PASS); print(JSON.stringify(c.getSiblingDB(process.env.MONGO_DB).getCollectionNames()))`
		out, err := runClient(ctx, c, map[string]string{"MONGO_USER": c.User, "MONGO_PASS": c.Password, "MONGO_DB": c.Database},
			"mongosh", "--quiet", "--host", "127.0.0.1", "--eval", script)
		if err != nil {
			return nil, err
		}
		return parseJSONStrings(string(out)), nil
	}
	return nil, errors.New("unsupported engine")
}

func parseJSONStrings(text string) []string {
	text = strings.TrimSpace(text)
	text = strings.TrimPrefix(text, "[")
	text = strings.TrimSuffix(text, "]")
	items := []string{}
	for _, part := range strings.Split(text, ",") {
		part = strings.Trim(strings.TrimSpace(part), `"`)
		if part != "" {
			items = append(items, part)
		}
	}
	return items
}

func firstColumn(res Result, err error) ([]string, error) {
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(res.Rows))
	for _, row := range res.Rows {
		if len(row) > 0 {
			names = append(names, row[0])
		}
	}
	return names, nil
}

// Browse returns a page of rows of one table.
func Browse(ctx context.Context, c Conn, table string, limit, offset int) (Result, error) {
	if ValidateIdentifier(table) != nil {
		known, err := Tables(ctx, c)
		if err != nil {
			return Result{}, err
		}
		found := false
		for _, name := range known {
			if name == table {
				found = true
				break
			}
		}
		if !found {
			return Result{}, errors.New("table not found")
		}
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	stmt := fmt.Sprintf("SELECT * FROM %s LIMIT %d OFFSET %d", quote(c.Engine, table), limit, offset)
	res, err := RunSQL(ctx, c, stmt, limit, false)
	if err != nil {
		return res, err
	}
	// MySQL prints nothing for an empty table: take the headers from the column list
	if len(res.Columns) == 0 && c.Engine.ID != "postgres" {
		if cols, colErr := RunSQL(ctx, c, "SHOW COLUMNS FROM "+quote(c.Engine, table), 500, false); colErr == nil {
			for _, row := range cols.Rows {
				if len(row) > 0 {
					res.Columns = append(res.Columns, row[0])
				}
			}
		}
	}
	res.Message = ""
	return res, nil
}

// Column describes one column of a new table.
type Column struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	Length        int    `json:"length,omitempty"`
	Nullable      bool   `json:"nullable"`
	PrimaryKey    bool   `json:"primaryKey"`
	AutoIncrement bool   `json:"autoIncrement"`
	Default       string `json:"default,omitempty"`
}

var defaultRe = regexp.MustCompile(`^[A-Za-z0-9 _.:/@+-]{0,64}$`)

// ColumnTypes are the portable types offered in the UI.
var ColumnTypes = []string{"integer", "bigint", "text", "varchar", "boolean", "decimal", "date", "timestamp", "json"}

func columnType(e Engine, col Column) (string, error) {
	pg := e.ID == "postgres"
	switch col.Type {
	case "integer":
		if col.AutoIncrement && pg {
			return "SERIAL", nil
		}
		return "INTEGER", nil
	case "bigint":
		if col.AutoIncrement && pg {
			return "BIGSERIAL", nil
		}
		return "BIGINT", nil
	case "text":
		return "TEXT", nil
	case "varchar":
		length := col.Length
		if length <= 0 || length > 4096 {
			length = 255
		}
		return fmt.Sprintf("VARCHAR(%d)", length), nil
	case "boolean":
		if pg {
			return "BOOLEAN", nil
		}
		return "TINYINT(1)", nil
	case "decimal":
		return "DECIMAL(18,4)", nil
	case "date":
		return "DATE", nil
	case "timestamp":
		return "TIMESTAMP", nil
	case "json":
		if pg {
			return "JSONB", nil
		}
		return "JSON", nil
	}
	return "", fmt.Errorf("unsupported column type %q", col.Type)
}

// BuildCreateTable renders a CREATE TABLE statement from validated parts.
func BuildCreateTable(e Engine, table string, cols []Column) (string, error) {
	if !isSQL(e) {
		return "", errors.New("tables are available for PostgreSQL, MySQL and MariaDB only")
	}
	if err := ValidateIdentifier(table); err != nil {
		return "", err
	}
	if len(cols) == 0 || len(cols) > 64 {
		return "", errors.New("a table needs 1 to 64 columns")
	}
	seen := map[string]bool{}
	parts := make([]string, 0, len(cols)+1)
	var pks []string
	for _, col := range cols {
		if err := ValidateIdentifier(col.Name); err != nil {
			return "", fmt.Errorf("column %q: %w", col.Name, err)
		}
		key := strings.ToLower(col.Name)
		if seen[key] {
			return "", fmt.Errorf("column %q is listed twice", col.Name)
		}
		seen[key] = true
		typ, err := columnType(e, col)
		if err != nil {
			return "", err
		}
		def := quote(e, col.Name) + " " + typ
		if col.AutoIncrement && e.ID != "postgres" {
			def += " AUTO_INCREMENT"
		}
		if !col.Nullable || col.PrimaryKey {
			def += " NOT NULL"
		}
		if col.Default != "" && !col.AutoIncrement {
			if !defaultRe.MatchString(col.Default) {
				return "", fmt.Errorf("default of %q contains characters that are not allowed", col.Name)
			}
			switch strings.ToUpper(col.Default) {
			case "CURRENT_TIMESTAMP", "NOW()":
				def += " DEFAULT CURRENT_TIMESTAMP"
			default:
				def += " DEFAULT " + lit(col.Default)
			}
		}
		parts = append(parts, def)
		if col.PrimaryKey {
			pks = append(pks, quote(e, col.Name))
		}
	}
	if len(pks) > 0 {
		parts = append(parts, "PRIMARY KEY ("+strings.Join(pks, ", ")+")")
	}
	return fmt.Sprintf("CREATE TABLE %s (\n  %s\n)", quote(e, table), strings.Join(parts, ",\n  ")), nil
}

// DropTable removes one table.
func DropTable(ctx context.Context, c Conn, table string) error {
	if err := ValidateIdentifier(table); err != nil {
		return err
	}
	_, err := RunSQL(ctx, c, "DROP TABLE "+quote(c.Engine, table), 1, true)
	return err
}

// Access presets for extra database users.
const (
	AccessRead  = "read"
	AccessWrite = "write"
	AccessAll   = "all"
)

// BuildCreateUser renders the statements that create a user with a preset access level.
func BuildCreateUser(e Engine, database, user, password, access string) ([]string, error) {
	if !isSQL(e) {
		return nil, errors.New("users are available for PostgreSQL, MySQL and MariaDB only")
	}
	if err := ValidateIdentifier(user); err != nil {
		return nil, err
	}
	if err := ValidatePassword(password); err != nil {
		return nil, err
	}
	if err := ValidateIdentifier(database); err != nil {
		return nil, err
	}
	switch access {
	case AccessRead, AccessWrite, AccessAll:
	default:
		return nil, errors.New("access must be read, write or all")
	}
	if e.ID == "postgres" {
		u, d := quote(e, user), quote(e, database)
		stmts := []string{
			fmt.Sprintf("CREATE ROLE %s LOGIN PASSWORD %s", u, lit(password)),
			fmt.Sprintf("GRANT CONNECT ON DATABASE %s TO %s", d, u),
			fmt.Sprintf("GRANT USAGE ON SCHEMA public TO %s", u),
		}
		switch access {
		case AccessRead:
			stmts = append(stmts,
				fmt.Sprintf("GRANT SELECT ON ALL TABLES IN SCHEMA public TO %s", u),
				fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %s", u))
		case AccessWrite:
			stmts = append(stmts,
				fmt.Sprintf("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %s", u),
				fmt.Sprintf("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %s", u),
				fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %s", u),
				fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %s", u))
		case AccessAll:
			stmts = append(stmts,
				fmt.Sprintf("GRANT ALL PRIVILEGES ON DATABASE %s TO %s", d, u),
				fmt.Sprintf("GRANT ALL ON SCHEMA public TO %s", u),
				fmt.Sprintf("GRANT ALL ON ALL TABLES IN SCHEMA public TO %s", u),
				fmt.Sprintf("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %s", u),
				fmt.Sprintf("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %s", u))
		}
		return stmts, nil
	}
	target := fmt.Sprintf("%s.* TO '%s'@'%%'", quote(e, database), user)
	grant := map[string]string{
		AccessRead:  "SELECT",
		AccessWrite: "SELECT, INSERT, UPDATE, DELETE",
		AccessAll:   "ALL PRIVILEGES",
	}[access]
	return []string{
		fmt.Sprintf("CREATE USER '%s'@'%%' IDENTIFIED BY %s", user, lit(password)),
		fmt.Sprintf("GRANT %s ON %s", grant, target),
		"FLUSH PRIVILEGES",
	}, nil
}

// BuildDropUser renders the statements that remove a user.
func BuildDropUser(e Engine, database, user string) ([]string, error) {
	if err := ValidateIdentifier(user); err != nil {
		return nil, err
	}
	if e.ID == "postgres" {
		u := quote(e, user)
		return []string{
			fmt.Sprintf("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %s", u),
			fmt.Sprintf("REVOKE ALL PRIVILEGES ON DATABASE %s FROM %s", quote(e, database), u),
			fmt.Sprintf("DROP ROLE %s", u),
		}, nil
	}
	return []string{fmt.Sprintf("DROP USER '%s'@'%%'", user), "FLUSH PRIVILEGES"}, nil
}

// BuildSetPassword renders the statements that change one account's password.
func BuildSetPassword(e Engine, user, password string) ([]string, error) {
	if err := ValidateIdentifier(user); err != nil {
		return nil, err
	}
	if err := ValidatePassword(password); err != nil {
		return nil, err
	}
	if e.ID == "postgres" {
		return []string{fmt.Sprintf("ALTER ROLE %s PASSWORD %s", quote(e, user), lit(password))}, nil
	}
	return []string{
		fmt.Sprintf("ALTER USER '%s'@'%%' IDENTIFIED BY %s", user, lit(password)),
		"FLUSH PRIVILEGES",
	}, nil
}

// RunScript runs several statements as the admin account in one session, so a
// password change cannot lock out the statements that follow it.
func RunScript(ctx context.Context, c Conn, statements []string) error {
	if len(statements) == 0 {
		return nil
	}
	_, err := RunSQL(ctx, c, strings.Join(statements, "; "), 1, true)
	return err
}

// SetMongoPassword changes the root user's password.
func SetMongoPassword(ctx context.Context, c Conn, newPassword string) error {
	if err := ValidatePassword(newPassword); err != nil {
		return err
	}
	script := `const a = db.getSiblingDB('admin'); a.auth(process.env.MONGO_USER, process.env.MONGO_PASS); a.changeUserPassword(process.env.MONGO_USER, process.env.MONGO_NEW)`
	_, err := runClient(ctx, c, map[string]string{"MONGO_USER": c.User, "MONGO_PASS": c.Password, "MONGO_NEW": newPassword},
		"mongosh", "--quiet", "--host", "127.0.0.1", "--eval", script)
	return err
}

var redisDenied = map[string]bool{
	"CONFIG": true, "SHUTDOWN": true, "DEBUG": true, "SLAVEOF": true, "REPLICAOF": true, "MODULE": true,
	"SCRIPT": true, "EVAL": true, "EVALSHA": true, "FUNCTION": true, "ACL": true, "MIGRATE": true, "BGSAVE": false,
}

// RunRedis runs one Redis command line (no shell involved).
func RunRedis(ctx context.Context, c Conn, command string) (Result, error) {
	if c.Engine.ID != "redis" {
		return Result{}, errors.New("not a Redis database")
	}
	fields := strings.Fields(command)
	if len(fields) == 0 {
		return Result{}, errors.New("command is empty")
	}
	if redisDenied[strings.ToUpper(fields[0])] {
		return Result{}, fmt.Errorf("%s is not available here", strings.ToUpper(fields[0]))
	}
	started := time.Now()
	args := append([]string{"redis-cli", "--no-auth-warning", "--no-raw"}, fields...)
	out, err := runClient(ctx, c, map[string]string{"REDISCLI_AUTH": c.Password}, args...)
	if err != nil {
		return Result{}, err
	}
	lines := strings.Split(strings.TrimRight(string(out), "\n"), "\n")
	res := Result{Columns: []string{"result"}, Rows: [][]string{}, DurationMs: time.Since(started).Milliseconds()}
	for _, line := range lines {
		if len(res.Rows) >= DefaultMaxRows {
			res.Truncated = true
			break
		}
		res.Rows = append(res.Rows, []string{line})
	}
	return res, nil
}

// Recreate replaces the container (not the data volume), used when the engine takes
// its password from the start-up environment.
func Recreate(spec Spec) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	s := spec
	s.build()
	if _, err := docker(ctx, nil, "rm", "-f", ContainerName(spec.ID)); err != nil && !strings.Contains(err.Error(), "No such container") {
		return err
	}
	_, err := docker(ctx, s.envValues, spec.RunArgs()...)
	return err
}

// ListUsers returns the accounts that can sign in to the database.
func ListUsers(ctx context.Context, c Conn) ([]map[string]string, error) {
	var stmt string
	switch c.Engine.ID {
	case "postgres":
		stmt = `SELECT rolname AS user, CASE WHEN rolsuper THEN 'all' ELSE 'limited' END AS level FROM pg_roles WHERE rolcanlogin AND rolname NOT LIKE 'pg\_%' ORDER BY rolname`
	case "mysql", "mariadb":
		stmt = `SELECT user, host FROM mysql.user WHERE user NOT IN ('mysql.sys','mysql.session','mysql.infoschema','mariadb.sys','root','') ORDER BY user`
	default:
		return nil, errors.New("users are available for PostgreSQL, MySQL and MariaDB only")
	}
	res, err := RunSQL(ctx, c, stmt, 200, true)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]string, 0, len(res.Rows))
	for _, row := range res.Rows {
		item := map[string]string{}
		for i, col := range res.Columns {
			if i < len(row) {
				item[col] = row[i]
			}
		}
		out = append(out, item)
	}
	return out, nil
}
