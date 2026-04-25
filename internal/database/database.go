// Package database provides the PostgreSQL-backed persistence layer for ServerPanel Pro.
// It manages schema migrations, all entity CRUD operations, and connection lifecycle.
package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

// ─── Config ──────────────────────────────────────────────────────────────────

// Config holds PostgreSQL connection parameters.
type Config struct {
	Enabled bool
	DSN     string // PostgreSQL connection string: postgres://user:pass@host:5432/dbname?sslmode=disable
}

// ─── Manager ─────────────────────────────────────────────────────────────────

// Manager is the central database access object.
type Manager struct {
	cfg       Config
	db        *sql.DB
	mu        sync.RWMutex
	connected bool
	lastError string
}

// New creates and initialises a Manager.
// If cfg.Enabled is false the manager is returned in a no-op state.
func New(cfg Config) *Manager {
	manager := &Manager{cfg: cfg}
	if !cfg.Enabled {
		manager.lastError = "database disabled"
		return manager
	}

	db, err := sql.Open("postgres", cfg.DSN)
	if err != nil {
		manager.setError(fmt.Sprintf("sql open failed: %v", err))
		return manager
	}
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetMaxIdleConns(5)
	db.SetMaxOpenConns(20)

	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		manager.setError(fmt.Sprintf("ping failed: %v", err))
		_ = db.Close()
		return manager
	}

	manager.db = db
	manager.setConnected(true)

	if err := manager.ensureSchema(); err != nil {
		manager.setError(fmt.Sprintf("schema migration failed: %v", err))
		return manager
	}

	if err := manager.seedDefaultChangelog(); err != nil {
		manager.setError(fmt.Sprintf("changelog seed failed: %v", err))
	}

	if err := manager.seedDefaultTerminalPresets(); err != nil {
		manager.setError(fmt.Sprintf("terminal presets seed failed: %v", err))
	}

	return manager
}

func (m *Manager) Close() error {
	if m == nil || m.db == nil {
		return nil
	}
	return m.db.Close()
}

func (m *Manager) IsConnected() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.connected
}

func (m *Manager) DB() *sql.DB {
	return m.db
}

// ─── Status ──────────────────────────────────────────────────────────────────

type Status struct {
	Enabled            bool   `json:"enabled"`
	Connected          bool   `json:"connected"`
	Host               string `json:"host"`
	Port               string `json:"port"`
	Database           string `json:"database"`
	User               string `json:"user"`
	LastError          string `json:"lastError"`
	ChangelogCount     int64  `json:"changelogCount"`
	RuntimeLogCount    int64  `json:"runtimeLogCount"`
	SettingsAuditCount int64  `json:"settingsAuditCount"`
	UserCount          int64  `json:"userCount"`
	ProjectCount       int64  `json:"projectCount"`
	TunnelCount        int64  `json:"tunnelCount"`
}

// parseDSNFields extracts host, port, dbname, and user from a PostgreSQL DSN.
// Supports both URL format (postgres://user:pass@host:port/dbname) and key=value format.
func parseDSNFields(dsn string) (host, port, dbname, user string) {
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		u, err := url.Parse(dsn)
		if err != nil {
			return
		}
		host = u.Hostname()
		port = u.Port()
		if port == "" {
			port = "5432"
		}
		user = u.User.Username()
		dbname = strings.TrimPrefix(u.Path, "/")
		return
	}
	// key=value format
	for _, part := range strings.Fields(dsn) {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "host":
			host = kv[1]
		case "port":
			port = kv[1]
		case "dbname":
			dbname = kv[1]
		case "user":
			user = kv[1]
		}
	}
	if port == "" {
		port = "5432"
	}
	return
}

func (m *Manager) Status() Status {
	m.mu.RLock()
	status := Status{
		Enabled:   m.cfg.Enabled,
		Connected: m.connected,
		LastError: m.lastError,
	}
	m.mu.RUnlock()

	// Always populate connection info from DSN (even when not connected)
	if m.cfg.DSN != "" {
		status.Host, status.Port, status.Database, status.User = parseDSNFields(m.cfg.DSN)
	}

	if !status.Connected || m.db == nil {
		return status
	}

	status.ChangelogCount = m.scalarCount("SELECT COUNT(*) FROM changelog_entries")
	status.RuntimeLogCount = m.scalarCount("SELECT COUNT(*) FROM runtime_logs")
	status.SettingsAuditCount = m.scalarCount("SELECT COUNT(*) FROM settings_audit")
	status.UserCount = m.scalarCount("SELECT COUNT(*) FROM users")
	status.ProjectCount = m.scalarCount("SELECT COUNT(*) FROM projects")
	status.TunnelCount = m.scalarCount("SELECT COUNT(*) FROM tunnels")
	return status
}

// ─── Schema ──────────────────────────────────────────────────────────────────

func (m *Manager) ensureSchema() error {
	if m.db == nil {
		return nil
	}

	stmts := []string{
		// ── Users ──────────────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS users (
			id            BIGSERIAL PRIMARY KEY,
			username      VARCHAR(80)  NOT NULL UNIQUE,
			email         VARCHAR(254) NOT NULL UNIQUE,
			password_hash TEXT         NOT NULL,
			role          VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin','admin','user')),
			status        VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending')),
			display_name  VARCHAR(120),
			avatar_url    TEXT,
			created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			last_login_at TIMESTAMPTZ
		)`,

		`CREATE TABLE IF NOT EXISTS user_sessions (
			id         BIGSERIAL PRIMARY KEY,
			user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			token      VARCHAR(128) NOT NULL UNIQUE,
			ip_address VARCHAR(64),
			user_agent TEXT,
			expires_at TIMESTAMPTZ  NOT NULL,
			created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sessions_token   ON user_sessions(token)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sessions_expires  ON user_sessions(expires_at)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_superadmin ON users ((role)) WHERE role = 'superadmin'`,

		`CREATE TABLE IF NOT EXISTS user_quotas (
			id               BIGSERIAL PRIMARY KEY,
			user_id          BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
			max_projects     INT    NOT NULL DEFAULT 5,
			max_tunnels      INT    NOT NULL DEFAULT 5,
			disk_quota_mb    BIGINT NOT NULL DEFAULT 5120,
			cpu_limit_pct    INT    NOT NULL DEFAULT 100,
			memory_limit_mb  INT    NOT NULL DEFAULT 512,
			created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,

		`CREATE TABLE IF NOT EXISTS user_cloudflare_configs (
			id                  BIGSERIAL PRIMARY KEY,
			user_id             BIGINT       NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
			api_token_encrypted TEXT         NOT NULL,
			account_id          VARCHAR(64),
			zone_id             VARCHAR(64),
			base_domain         VARCHAR(253),
			status              VARCHAR(20)  NOT NULL DEFAULT 'unconfigured' CHECK (status IN ('active','invalid','unconfigured')),
			verified_at         TIMESTAMPTZ,
			created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,

		`CREATE TABLE IF NOT EXISTS user_preferences (
			user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			wallpaper_data JSONB,
			theme_settings JSONB,
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,

		// ── Projects ───────────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS projects (
			id            BIGSERIAL PRIMARY KEY,
			user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name          VARCHAR(120) NOT NULL,
			slug          VARCHAR(80)  NOT NULL,
			description   TEXT,
			status        VARCHAR(30)  NOT NULL DEFAULT 'draft' CHECK (status IN ('active','stopped','building','error','draft')),
			project_type  VARCHAR(30)  NOT NULL DEFAULT 'custom' CHECK (project_type IN ('static','nodejs','python','php','docker','proxy','custom')),
			repo_url      TEXT,
			working_dir   TEXT,
			exposed_port  INTEGER,
			assigned_port INTEGER,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE(user_id, slug)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)`,

		`CREATE TABLE IF NOT EXISTS project_env_vars (
			id              BIGSERIAL PRIMARY KEY,
			project_id      BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			key             VARCHAR(128) NOT NULL,
			value_encrypted TEXT         NOT NULL,
			is_secret       BOOLEAN      NOT NULL DEFAULT false,
			created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			UNIQUE(project_id, key)
		)`,

		`CREATE TABLE IF NOT EXISTS project_deployments (
			id            BIGSERIAL PRIMARY KEY,
			project_id    BIGINT      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			triggered_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
			commit_hash   VARCHAR(64),
			status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','building','success','failed','rollback')),
			build_log     TEXT,
			started_at    TIMESTAMPTZ,
			finished_at   TIMESTAMPTZ,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_deployments_project_id ON project_deployments(project_id)`,

		`CREATE TABLE IF NOT EXISTS webhook_configs (
			id           BIGSERIAL PRIMARY KEY,
			project_id   BIGINT       NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			secret_token VARCHAR(128) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
			target_event VARCHAR(20)  NOT NULL DEFAULT 'push' CHECK (target_event IN ('push','deploy','any')),
			active       BOOLEAN      NOT NULL DEFAULT true,
			created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,

		// ── Tunnels ────────────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS tunnels (
			id            BIGSERIAL PRIMARY KEY,
			user_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			project_id    BIGINT       REFERENCES projects(id) ON DELETE SET NULL,
			name          VARCHAR(120) NOT NULL,
			target_url    TEXT         NOT NULL,
			status        VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('active','inactive','error','pending','creating')),
			cf_tunnel_id  VARCHAR(128),
			cf_hostname   VARCHAR(253),
			cf_zone_id    VARCHAR(64),
			tunnel_config JSONB,
			created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,
		// ── Schema migrations (idempotent) ──────────────────────────────────────
		`ALTER TABLE tunnels ADD COLUMN IF NOT EXISTS cf_zone_id VARCHAR(64)`,
		`CREATE INDEX IF NOT EXISTS idx_tunnels_user_id    ON tunnels(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tunnels_project_id ON tunnels(project_id)`,

		`CREATE TABLE IF NOT EXISTS tunnel_logs (
			id         BIGSERIAL PRIMARY KEY,
			tunnel_id  BIGINT      NOT NULL REFERENCES tunnels(id) ON DELETE CASCADE,
			level      VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
			message    TEXT        NOT NULL,
			metadata   JSONB,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_tunnel_logs_tunnel_id   ON tunnel_logs(tunnel_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tunnel_logs_created_at  ON tunnel_logs(created_at)`,

		// ── Domains ────────────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS domain_records (
			id                 BIGSERIAL PRIMARY KEY,
			user_id            BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			tunnel_id          BIGINT       REFERENCES tunnels(id) ON DELETE SET NULL,
			hostname           VARCHAR(253) NOT NULL UNIQUE,
			ssl_enabled        BOOLEAN      NOT NULL DEFAULT true,
			status             VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('active','pending','error','verifying')),
			verification_token TEXT,
			verified_at        TIMESTAMPTZ,
			created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,

		// ── Docker Services ────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS docker_services (
			id             BIGSERIAL PRIMARY KEY,
			user_id        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			project_id     BIGINT       REFERENCES projects(id) ON DELETE SET NULL,
			container_id   VARCHAR(128),
			container_name VARCHAR(128),
			image          TEXT         NOT NULL,
			ports          JSONB,
			env_vars       JSONB,
			volumes        JSONB,
			status         VARCHAR(20)  NOT NULL DEFAULT 'stopped' CHECK (status IN ('running','stopped','error','creating')),
			created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,

		// ── Notifications ──────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS notifications (
			id         BIGSERIAL PRIMARY KEY,
			user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title      VARCHAR(190) NOT NULL,
			body       TEXT,
			type       VARCHAR(20)  NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','error')),
			is_read    BOOLEAN      NOT NULL DEFAULT false,
			action_url TEXT,
			created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read)`,

		// ── Runtime Logs ──────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS runtime_logs (
			id         BIGSERIAL PRIMARY KEY,
			service    VARCHAR(80) NOT NULL DEFAULT 'panel',
			user_id    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
			project_id BIGINT      REFERENCES projects(id) ON DELETE SET NULL,
			level      VARCHAR(10) NOT NULL DEFAULT 'info',
			message    TEXT        NOT NULL,
			metadata   JSONB,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_runtime_logs_created_at ON runtime_logs(created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_runtime_logs_service    ON runtime_logs(service)`,

		// ── Changelog ─────────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS changelog_entries (
			id          BIGSERIAL PRIMARY KEY,
			version     VARCHAR(32)  NOT NULL,
			title       VARCHAR(190) NOT NULL,
			summary     TEXT         NOT NULL,
			released_at VARCHAR(32)  NOT NULL,
			created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			UNIQUE(version, title)
		)`,

		// ── Settings Audit ────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS settings_audit (
			id          BIGSERIAL PRIMARY KEY,
			user_id     BIGINT      REFERENCES users(id) ON DELETE SET NULL,
			hostname    VARCHAR(253),
			timezone    VARCHAR(80),
			nameservers JSONB,
			created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_settings_audit_created_at ON settings_audit(created_at)`,

		// ── Terminal Presets ──────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS terminal_presets (
			id         BIGSERIAL PRIMARY KEY,
			user_id    BIGINT       REFERENCES users(id) ON DELETE CASCADE,
			label      VARCHAR(190) NOT NULL DEFAULT '',
			command    TEXT         NOT NULL,
			sort_order INTEGER      NOT NULL DEFAULT 0,
			is_global  BOOLEAN      NOT NULL DEFAULT false,
			created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_terminal_presets_sort ON terminal_presets(sort_order, id)`,

		// ── Payment Plans (Phase 2+ feature) ─────────────────────────────
		`CREATE TABLE IF NOT EXISTS payment_plans (
			id             BIGSERIAL PRIMARY KEY,
			name           VARCHAR(80)  NOT NULL,
			slug           VARCHAR(30)  NOT NULL UNIQUE,
			max_projects   INTEGER      NOT NULL DEFAULT 5,
			max_tunnels    INTEGER      NOT NULL DEFAULT 5,
			disk_quota_mb  BIGINT       NOT NULL DEFAULT 5120,
			price_idr      INTEGER      NOT NULL DEFAULT 0,
			active         BOOLEAN      NOT NULL DEFAULT true,
			created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,

		// ── Docs ───────────────────────────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS docs (
			id             BIGSERIAL PRIMARY KEY,
			author_user_id BIGINT       REFERENCES users(id) ON DELETE SET NULL,
			title          VARCHAR(190) NOT NULL,
			slug           VARCHAR(120) NOT NULL UNIQUE,
			excerpt        TEXT         NOT NULL DEFAULT '',
			content        TEXT         NOT NULL DEFAULT '',
			status         VARCHAR(20)  NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
			created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_docs_status_created ON docs(status, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_docs_author_id      ON docs(author_user_id)`,

		// ── Docker Compose Templates ───────────────────────────────────────
		`CREATE TABLE IF NOT EXISTS docker_compose_templates (
			id BIGSERIAL PRIMARY KEY,
			owner_user_id BIGINT NOT NULL DEFAULT 0,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			yaml_content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`ALTER TABLE docker_compose_templates ADD COLUMN IF NOT EXISTS owner_user_id BIGINT NOT NULL DEFAULT 0`,
		`WITH ranked_templates AS (
			SELECT id, owner_user_id, name,
				ROW_NUMBER() OVER (PARTITION BY owner_user_id, LOWER(name) ORDER BY id ASC) AS duplicate_rank
			FROM docker_compose_templates
		)
		UPDATE docker_compose_templates AS templates
		SET name = CONCAT(templates.name, ' #', templates.id)
		FROM ranked_templates
		WHERE templates.id = ranked_templates.id
		  AND ranked_templates.duplicate_rank > 1`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_docker_compose_templates_owner_name ON docker_compose_templates (owner_user_id, LOWER(name))`,
	}

	for _, stmt := range stmts {
		if _, err := m.db.Exec(stmt); err != nil {
			return fmt.Errorf("schema exec failed: %w\nStatement: %s", err, stmt[:min(len(stmt), 120)])
		}
	}

	return nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ─── Users ────────────────────────────────────────────────────────────────────

type User struct {
	ID          int64      `json:"id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	DisplayName string     `json:"displayName"`
	AvatarURL   string     `json:"avatarUrl"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	LastLoginAt *time.Time `json:"lastLoginAt"`
}

func (m *Manager) GetUserByUsername(username string) (*User, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	row := m.db.QueryRow(`
		SELECT id, username, email, role, status, COALESCE(display_name,''), COALESCE(avatar_url,''), created_at, updated_at, last_login_at
		FROM users WHERE username = $1
	`, username)
	return scanUser(row)
}

func (m *Manager) GetUserByID(id int64) (*User, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	row := m.db.QueryRow(`
		SELECT id, username, email, role, status, COALESCE(display_name,''), COALESCE(avatar_url,''), created_at, updated_at, last_login_at
		FROM users WHERE id = $1
	`, id)
	return scanUser(row)
}

func (m *Manager) GetUserByEmail(email string) (*User, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	row := m.db.QueryRow(`
		SELECT id, username, email, role, status, COALESCE(display_name,''), COALESCE(avatar_url,''), created_at, updated_at, last_login_at
		FROM users WHERE email = $1
	`, email)
	return scanUser(row)
}

func (m *Manager) GetPrimarySuperadmin() (*User, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}

	row := m.db.QueryRow(`
		SELECT id, username, email, role, status, COALESCE(display_name,''), COALESCE(avatar_url,''), created_at, updated_at, last_login_at
		FROM users
		ORDER BY id ASC
		LIMIT 1
	`)
	return scanUser(row)
}

func (m *Manager) GetUserPasswordHash(userID int64) (string, error) {
	if !m.IsConnected() {
		return "", fmt.Errorf("database not connected")
	}
	var hash string
	err := m.db.QueryRow("SELECT password_hash FROM users WHERE id = $1", userID).Scan(&hash)
	return hash, err
}

func (m *Manager) ListUsers(limit, offset int) ([]User, int64, error) {
	return m.ListUsersFiltered("", limit, offset)
}

func (m *Manager) ListUsersFiltered(query string, limit, offset int) ([]User, int64, error) {
	if !m.IsConnected() {
		return nil, 0, fmt.Errorf("database not connected")
	}
	query = strings.TrimSpace(query)
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	search := "%" + strings.ToLower(query) + "%"

	var total int64
	if err := m.db.QueryRow(`
		SELECT COUNT(*)
		FROM users
		WHERE $1 = ''
			OR LOWER(username) LIKE $2
			OR LOWER(email) LIKE $2
			OR LOWER(COALESCE(display_name,'')) LIKE $2
	`, query, search).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := m.db.Query(`
		SELECT id, username, email, role, status, COALESCE(display_name,''), COALESCE(avatar_url,''), created_at, updated_at, last_login_at
		FROM users
		WHERE $1 = ''
			OR LOWER(username) LIKE $2
			OR LOWER(email) LIKE $2
			OR LOWER(COALESCE(display_name,'')) LIKE $2
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`, query, search, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		u, err := scanUserFromRows(rows)
		if err != nil {
			return nil, 0, err
		}
		users = append(users, *u)
	}
	return users, total, rows.Err()
}

func (m *Manager) CreateUser(username, email, passwordHash, role, displayName string) (*User, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if role == "superadmin" {
		var existing int
		if err := m.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'superadmin'`).Scan(&existing); err != nil {
			return nil, err
		}
		if existing > 0 {
			return nil, fmt.Errorf("only one superadmin account is allowed")
		}
	}
	var u User
	err := m.db.QueryRow(`
		INSERT INTO users (username, email, password_hash, role, display_name)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, username, email, role, status, COALESCE(display_name,''), COALESCE(avatar_url,''), created_at, updated_at, last_login_at
	`, username, email, passwordHash, role, displayName).Scan(
		&u.ID, &u.Username, &u.Email, &u.Role, &u.Status,
		&u.DisplayName, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt,
	)
	if err != nil {
		return nil, err
	}

	// Init default quota for new user
	_, _ = m.db.Exec(`
		INSERT INTO user_quotas (user_id) VALUES ($1) ON CONFLICT DO NOTHING
	`, u.ID)

	return &u, nil
}

func (m *Manager) UpdateUser(id int64, fields map[string]any) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	if rawRole, ok := fields["role"]; ok {
		if nextRole, ok := rawRole.(string); ok && nextRole == "superadmin" {
			var currentRole string
			if err := m.db.QueryRow(`SELECT role FROM users WHERE id = $1`, id).Scan(&currentRole); err != nil {
				return err
			}
			if currentRole != "superadmin" {
				var existing int
				if err := m.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'superadmin'`).Scan(&existing); err != nil {
					return err
				}
				if existing > 0 {
					return fmt.Errorf("only one superadmin account is allowed")
				}
			}
		}
	}
	allowed := map[string]string{
		"display_name": "display_name",
		"email":        "email",
		"role":         "role",
		"status":       "status",
		"avatar_url":   "avatar_url",
	}
	setParts := []string{"updated_at = NOW()"}
	args := []any{}
	i := 1
	for k, v := range fields {
		col, ok := allowed[k]
		if !ok {
			continue
		}
		setParts = append(setParts, fmt.Sprintf("%s = $%d", col, i))
		args = append(args, v)
		i++
	}
	if len(args) == 0 {
		return nil
	}
	args = append(args, id)
	query := fmt.Sprintf("UPDATE users SET %s WHERE id = $%d", strings.Join(setParts, ", "), i)
	_, err := m.db.Exec(query, args...)
	return err
}

func (m *Manager) UpdateUserPasswordHash(id int64, hash string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", hash, id)
	return err
}

func (m *Manager) DeleteUser(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("DELETE FROM users WHERE id = $1", id)
	return err
}

func (m *Manager) TouchUserLogin(id int64) {
	if !m.IsConnected() || m.db == nil {
		return
	}
	go m.db.Exec("UPDATE users SET last_login_at = NOW() WHERE id = $1", id)
}

func (m *Manager) CountUsers() int64 {
	if m == nil || !m.IsConnected() || m.db == nil {
		return 0
	}
	return m.scalarCount("SELECT COUNT(*) FROM users")
}

func (m *Manager) HasUsers() bool {
	return m.CountUsers() > 0
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

type Session struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"userId"`
	Token     string    `json:"-"`
	IPAddress string    `json:"ipAddress"`
	UserAgent string    `json:"userAgent"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

func (m *Manager) CreateSession(userID int64, token, ip, ua string, ttl time.Duration) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO user_sessions (user_id, token, ip_address, user_agent, expires_at)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, token, ip, ua, time.Now().Add(ttl))
	return err
}

func (m *Manager) GetSessionUser(token string) (*User, bool) {
	if !m.IsConnected() || m.db == nil {
		return nil, false
	}
	row := m.db.QueryRow(`
		SELECT u.id, u.username, u.email, u.role, u.status,
			COALESCE(u.display_name,''), COALESCE(u.avatar_url,''),
			u.created_at, u.updated_at, u.last_login_at
		FROM user_sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = $1 AND s.expires_at > NOW() AND u.status = 'active'
	`, token)
	u, err := scanUser(row)
	if err != nil {
		return nil, false
	}
	// Slide expiry
	go m.db.Exec("UPDATE user_sessions SET expires_at = NOW() + INTERVAL '12 hours' WHERE token = $1", token)
	return u, true
}

func (m *Manager) DeleteSession(token string) {
	if !m.IsConnected() || m.db == nil {
		return
	}
	go m.db.Exec("DELETE FROM user_sessions WHERE token = $1", token)
}

func (m *Manager) CleanExpiredSessions() {
	if !m.IsConnected() || m.db == nil {
		return
	}
	go m.db.Exec("DELETE FROM user_sessions WHERE expires_at <= NOW()")
}

// ─── Quotas ───────────────────────────────────────────────────────────────────

type UserQuota struct {
	UserID         int64 `json:"userId"`
	MaxProjects    int   `json:"maxProjects"`
	MaxTunnels     int   `json:"maxTunnels"`
	DiskQuotaMB    int64 `json:"diskQuotaMb"`
	CPULimitPct    int   `json:"cpuLimitPct"`
	MemoryLimitMB  int   `json:"memoryLimitMb"`
}

func (m *Manager) GetUserQuota(userID int64) (*UserQuota, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var q UserQuota
	err := m.db.QueryRow(`
		SELECT user_id, max_projects, max_tunnels, disk_quota_mb, cpu_limit_pct, memory_limit_mb
		FROM user_quotas WHERE user_id = $1
	`, userID).Scan(&q.UserID, &q.MaxProjects, &q.MaxTunnels, &q.DiskQuotaMB, &q.CPULimitPct, &q.MemoryLimitMB)
	if err == sql.ErrNoRows {
		// Return defaults
		return &UserQuota{UserID: userID, MaxProjects: 5, MaxTunnels: 5, DiskQuotaMB: 5120, CPULimitPct: 100, MemoryLimitMB: 512}, nil
	}
	return &q, err
}

func (m *Manager) UpdateUserQuota(q UserQuota) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO user_quotas (user_id, max_projects, max_tunnels, disk_quota_mb, cpu_limit_pct, memory_limit_mb)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id) DO UPDATE SET
			max_projects = EXCLUDED.max_projects,
			max_tunnels = EXCLUDED.max_tunnels,
			disk_quota_mb = EXCLUDED.disk_quota_mb,
			cpu_limit_pct = EXCLUDED.cpu_limit_pct,
			memory_limit_mb = EXCLUDED.memory_limit_mb,
			updated_at = NOW()
	`, q.UserID, q.MaxProjects, q.MaxTunnels, q.DiskQuotaMB, q.CPULimitPct, q.MemoryLimitMB)
	return err
}

// ─── Cloudflare Configs ──────────────────────────────────────────────────────

type CloudflareConfig struct {
	ID                 int64      `json:"id"`
	UserID             int64      `json:"userId"`
	APITokenEncrypted  string     `json:"-"`
	AccountID          string     `json:"accountId"`
	ZoneID             string     `json:"zoneId"`
	BaseDomain         string     `json:"baseDomain"`
	Status             string     `json:"status"`
	VerifiedAt         *time.Time `json:"verifiedAt"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}

func (m *Manager) GetCFConfig(userID int64) (*CloudflareConfig, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var c CloudflareConfig
	err := m.db.QueryRow(`
		SELECT id, user_id, api_token_encrypted, COALESCE(account_id,''), COALESCE(zone_id,''),
			COALESCE(base_domain,''), status, verified_at, created_at, updated_at
		FROM user_cloudflare_configs WHERE user_id = $1
	`, userID).Scan(
		&c.ID, &c.UserID, &c.APITokenEncrypted, &c.AccountID, &c.ZoneID,
		&c.BaseDomain, &c.Status, &c.VerifiedAt, &c.CreatedAt, &c.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &c, err
}

func (m *Manager) UpsertCFConfig(userID int64, tokenEncrypted, accountID, zoneID, baseDomain, status string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	var verifiedAt *time.Time
	if status == "active" {
		t := time.Now()
		verifiedAt = &t
	}
	_, err := m.db.Exec(`
		INSERT INTO user_cloudflare_configs (user_id, api_token_encrypted, account_id, zone_id, base_domain, status, verified_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (user_id) DO UPDATE SET
			api_token_encrypted = EXCLUDED.api_token_encrypted,
			account_id = EXCLUDED.account_id,
			zone_id = EXCLUDED.zone_id,
			base_domain = EXCLUDED.base_domain,
			status = EXCLUDED.status,
			verified_at = EXCLUDED.verified_at,
			updated_at = NOW()
	`, userID, tokenEncrypted, accountID, zoneID, baseDomain, status, verifiedAt)
	return err
}

func (m *Manager) DeleteCFConfig(userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("DELETE FROM user_cloudflare_configs WHERE user_id = $1", userID)
	return err
}

// ─── Projects ────────────────────────────────────────────────────────────────

type Project struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"userId"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	Description  string    `json:"description"`
	Status       string    `json:"status"`
	ProjectType  string    `json:"projectType"`
	RepoURL      string    `json:"repoUrl"`
	WorkingDir   string    `json:"workingDir"`
	ExposedPort  int       `json:"exposedPort"`
	AssignedPort int       `json:"assignedPort"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (m *Manager) ListProjects(userID int64) ([]Project, error) {
	projects, _, err := m.ListProjectsFiltered(userID, false, "", 200, 0)
	return projects, err
}

func (m *Manager) ListProjectsFiltered(userID int64, includeAll bool, query string, limit, offset int) ([]Project, int64, error) {
	if !m.IsConnected() {
		return nil, 0, fmt.Errorf("database not connected")
	}
	query = strings.TrimSpace(query)
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	search := "%" + strings.ToLower(query) + "%"
	filters := []string{"($1 = '' OR LOWER(name) LIKE $2 OR LOWER(slug) LIKE $2 OR LOWER(COALESCE(description,'')) LIKE $2 OR LOWER(COALESCE(project_type,'')) LIKE $2 OR LOWER(COALESCE(working_dir,'')) LIKE $2)"}
	args := []any{query, search}
	if !includeAll {
		filters = append(filters, fmt.Sprintf("user_id = $%d", len(args)+1))
		args = append(args, userID)
	}
	whereClause := strings.Join(filters, " AND ")

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM projects WHERE %s", whereClause)
	var total int64
	if err := m.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listQuery := fmt.Sprintf(`
		SELECT id, user_id, name, slug, COALESCE(description,''), status, project_type,
			COALESCE(repo_url,''), COALESCE(working_dir,''),
			COALESCE(exposed_port,0), COALESCE(assigned_port,0), created_at, updated_at
		FROM projects
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)
	rows, err := m.db.Query(listQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	ps, err := scanProjects(rows)
	return ps, total, err
}

func (m *Manager) ListAllProjects(limit, offset int) ([]Project, int64, error) {
	return m.ListProjectsFiltered(0, true, "", limit, offset)
}

func (m *Manager) GetProject(id, userID int64) (*Project, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	row := m.db.QueryRow(`
		SELECT id, user_id, name, slug, COALESCE(description,''), status, project_type,
			COALESCE(repo_url,''), COALESCE(working_dir,''),
			COALESCE(exposed_port,0), COALESCE(assigned_port,0), created_at, updated_at
		FROM projects WHERE id = $1 AND user_id = $2
	`, id, userID)
	return scanProject(row)
}

func (m *Manager) CreateProject(userID int64, name, slug, description, projectType, repoURL, workingDir string, assignedPort int) (*Project, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var p Project
	err := m.db.QueryRow(`
		INSERT INTO projects (user_id, name, slug, description, project_type, repo_url, working_dir, assigned_port)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, user_id, name, slug, COALESCE(description,''), status, project_type,
			COALESCE(repo_url,''), COALESCE(working_dir,''),
			COALESCE(exposed_port,0), COALESCE(assigned_port,0), created_at, updated_at
	`, userID, name, slug, description, projectType, repoURL, workingDir, assignedPort).Scan(
		&p.ID, &p.UserID, &p.Name, &p.Slug, &p.Description, &p.Status, &p.ProjectType,
		&p.RepoURL, &p.WorkingDir, &p.ExposedPort, &p.AssignedPort, &p.CreatedAt, &p.UpdatedAt,
	)
	return &p, err
}

func (m *Manager) UpdateProjectStatus(id int64, status string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2", status, id)
	return err
}

func (m *Manager) DeleteProject(id, userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("DELETE FROM projects WHERE id = $1 AND user_id = $2", id, userID)
	return err
}

// ─── Tunnels ─────────────────────────────────────────────────────────────────

type Tunnel struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"userId"`
	ProjectID    *int64    `json:"projectId"`
	Name         string    `json:"name"`
	TargetURL    string    `json:"targetUrl"`
	Status       string    `json:"status"`
	CFTunnelID   string    `json:"cfTunnelId"`
	CFHostname   string    `json:"cfHostname"`
	CFZoneID     string    `json:"cfZoneId"`
	TunnelConfig any       `json:"tunnelConfig"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (m *Manager) ListTunnels(userID int64) ([]Tunnel, error) {
	tunnels, _, err := m.ListTunnelsFiltered(userID, "", 200, 0)
	return tunnels, err
}

func (m *Manager) ListTunnelsFiltered(userID int64, query string, limit, offset int) ([]Tunnel, int64, error) {
	if !m.IsConnected() {
		return nil, 0, fmt.Errorf("database not connected")
	}
	query = strings.TrimSpace(query)
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	search := "%" + strings.ToLower(query) + "%"
	var total int64
	if err := m.db.QueryRow(`
		SELECT COUNT(*)
		FROM tunnels
		WHERE user_id = $1
		  AND ($2 = '' OR LOWER(name) LIKE $3 OR LOWER(target_url) LIKE $3 OR LOWER(COALESCE(cf_hostname,'')) LIKE $3 OR LOWER(status) LIKE $3)
	`, userID, query, search).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := m.db.Query(`
		SELECT id, user_id, project_id, name, target_url, status,
			COALESCE(cf_tunnel_id,''), COALESCE(cf_hostname,''), COALESCE(cf_zone_id,''), created_at, updated_at
		FROM tunnels
		WHERE user_id = $1
		  AND ($2 = '' OR LOWER(name) LIKE $3 OR LOWER(target_url) LIKE $3 OR LOWER(COALESCE(cf_hostname,'')) LIKE $3 OR LOWER(status) LIKE $3)
		ORDER BY created_at DESC
		LIMIT $4 OFFSET $5
	`, userID, query, search, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items, err := scanTunnels(rows)
	return items, total, err
}

func (m *Manager) ListAllActiveTunnels() ([]Tunnel, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`
		SELECT id, user_id, project_id, name, target_url, status,
			COALESCE(cf_tunnel_id,''), COALESCE(cf_hostname,''), COALESCE(cf_zone_id,''), created_at, updated_at
		FROM tunnels WHERE cf_tunnel_id != '' AND status = 'active' ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items, err := scanTunnels(rows)
	return items, err
}

func (m *Manager) GetTunnel(id, userID int64) (*Tunnel, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	row := m.db.QueryRow(`
		SELECT id, user_id, project_id, name, target_url, status,
			COALESCE(cf_tunnel_id,''), COALESCE(cf_hostname,''), COALESCE(cf_zone_id,''), created_at, updated_at
		FROM tunnels WHERE id = $1 AND user_id = $2
	`, id, userID)
	return scanTunnel(row)
}

func (m *Manager) CreateTunnel(userID int64, projectID *int64, name, targetURL string) (*Tunnel, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var t Tunnel
	err := m.db.QueryRow(`
		INSERT INTO tunnels (user_id, project_id, name, target_url)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, project_id, name, target_url, status,
			COALESCE(cf_tunnel_id,''), COALESCE(cf_hostname,''), COALESCE(cf_zone_id,''), created_at, updated_at
	`, userID, projectID, name, targetURL).Scan(
		&t.ID, &t.UserID, &t.ProjectID, &t.Name, &t.TargetURL, &t.Status,
		&t.CFTunnelID, &t.CFHostname, &t.CFZoneID, &t.CreatedAt, &t.UpdatedAt,
	)
	return &t, err
}

func (m *Manager) UpdateTunnel(id int64, userID int64, name, targetURL, hostname, zoneID string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		UPDATE tunnels SET name = $1, target_url = $2, cf_hostname = $3, cf_zone_id = $4, updated_at = NOW()
		WHERE id = $5 AND user_id = $6
	`, name, targetURL, hostname, zoneID, id, userID)
	return err
}

func (m *Manager) UpdateTunnelCF(id int64, cfTunnelID, cfHostname, cfZoneID, status string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		UPDATE tunnels SET cf_tunnel_id = $1, cf_hostname = $2, cf_zone_id = $3, status = $4, updated_at = NOW()
		WHERE id = $5
	`, cfTunnelID, cfHostname, cfZoneID, status, id)
	return err
}

func (m *Manager) UpdateTunnelStatus(id int64, status string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("UPDATE tunnels SET status = $1, updated_at = NOW() WHERE id = $2", status, id)
	return err
}

func (m *Manager) DeleteTunnel(id, userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("DELETE FROM tunnels WHERE id = $1 AND user_id = $2", id, userID)
	return err
}

// ─── Notifications ────────────────────────────────────────────────────────────

type Notification struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"userId"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Type      string    `json:"type"`
	IsRead    bool      `json:"isRead"`
	ActionURL string    `json:"actionUrl"`
	CreatedAt time.Time `json:"createdAt"`
}

func (m *Manager) CreateNotification(userID int64, title, body, notifType, actionURL string) error {
	if !m.IsConnected() || m.db == nil {
		return nil
	}
	_, err := m.db.Exec(`
		INSERT INTO notifications (user_id, title, body, type, action_url)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, title, body, notifType, actionURL)
	return err
}

func (m *Manager) ListNotifications(userID int64, limit int) ([]Notification, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`
		SELECT id, user_id, title, COALESCE(body,''), type, is_read, COALESCE(action_url,''), created_at
		FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]Notification, 0)
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Body, &n.Type, &n.IsRead, &n.ActionURL, &n.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, n)
	}
	return result, rows.Err()
}

func (m *Manager) MarkNotificationRead(id, userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2", id, userID)
	return err
}

func (m *Manager) MarkAllNotificationsRead(userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("UPDATE notifications SET is_read = true WHERE user_id = $1", userID)
	return err
}

func (m *Manager) CountUnreadNotifications(userID int64) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var count int
	err := m.db.QueryRow("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false", userID).Scan(&count)
	return count, err
}

func (m *Manager) GetLatestNotification(userID int64) (*Notification, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var n Notification
	err := m.db.QueryRow(`
		SELECT id, user_id, title, COALESCE(body,''), type, is_read, COALESCE(action_url,''), created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC, id DESC
		LIMIT 1
	`, userID).Scan(&n.ID, &n.UserID, &n.Title, &n.Body, &n.Type, &n.IsRead, &n.ActionURL, &n.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &n, nil
}

// ─── Runtime Logs ─────────────────────────────────────────────────────────────

type RuntimeLog struct {
	ID        int64     `json:"id"`
	Service   string    `json:"service"`
	UserID    *int64    `json:"userId"`
	ProjectID *int64    `json:"projectId"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Metadata  string    `json:"metadata"`
	CreatedAt time.Time `json:"createdAt"`
}

func (m *Manager) RecordRuntimeLog(service, level, message string, metadata map[string]any) {
	m.RecordRuntimeLogWithContext(service, level, message, nil, nil, metadata)
}

func (m *Manager) RecordRuntimeLogWithContext(service, level, message string, userID, projectID *int64, metadata map[string]any) {
	if !m.IsConnected() || m.db == nil {
		return
	}
	service = strings.TrimSpace(service)
	if service == "" {
		service = "panel"
	}
	level = strings.ToLower(strings.TrimSpace(level))
	if level == "" {
		level = "info"
	}
	message = strings.TrimSpace(message)
	if message == "" {
		return
	}
	meta := marshalJSON(metadata)

	go func() {
		_, _ = m.db.Exec(`
			INSERT INTO runtime_logs (service, user_id, project_id, level, message, metadata)
			VALUES ($1, $2, $3, $4, $5, $6::jsonb)
		`, service, userID, projectID, level, message, meta)
	}()
}

func (m *Manager) ListRuntimeLogs(limit int) ([]RuntimeLog, error) {
	if !m.IsConnected() || m.db == nil {
		return []RuntimeLog{}, nil
	}
	if limit <= 0 || limit > 300 {
		limit = 120
	}
	rows, err := m.db.Query(`
		SELECT id, service, user_id, project_id, level, message, COALESCE(metadata::text,'{}'), created_at
		FROM runtime_logs ORDER BY id DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]RuntimeLog, 0, limit)
	for rows.Next() {
		var item RuntimeLog
		if err := rows.Scan(&item.ID, &item.Service, &item.UserID, &item.ProjectID, &item.Level, &item.Message, &item.Metadata, &item.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, item)
	}
	return entries, rows.Err()
}

// ─── Changelog ────────────────────────────────────────────────────────────────

type ChangelogEntry struct {
	ID         int64     `json:"id"`
	Version    string    `json:"version"`
	Title      string    `json:"title"`
	Summary    string    `json:"summary"`
	ReleasedAt string    `json:"releasedAt"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (m *Manager) ListChangelog(limit int) ([]ChangelogEntry, error) {
	if !m.IsConnected() || m.db == nil {
		return defaultChangelogEntries(), nil
	}
	if limit <= 0 || limit > 80 {
		limit = 40
	}
	rows, err := m.db.Query(`
		SELECT id, version, title, summary, released_at, created_at
		FROM changelog_entries ORDER BY created_at DESC, id DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]ChangelogEntry, 0, limit)
	for rows.Next() {
		var item ChangelogEntry
		if err := rows.Scan(&item.ID, &item.Version, &item.Title, &item.Summary, &item.ReleasedAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, item)
	}
	if len(entries) == 0 {
		return defaultChangelogEntries(), nil
	}
	return entries, rows.Err()
}

func (m *Manager) seedDefaultChangelog() error {
	if m.db == nil {
		return nil
	}
	for _, item := range defaultChangelogEntries() {
		_, err := m.db.Exec(`
			INSERT INTO changelog_entries (version, title, summary, released_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (version, title) DO UPDATE SET summary = EXCLUDED.summary, released_at = EXCLUDED.released_at
		`, item.Version, item.Title, item.Summary, item.ReleasedAt)
		if err != nil {
			return err
		}
	}
	return nil
}

func defaultChangelogEntries() []ChangelogEntry {
	now := time.Now()
	return []ChangelogEntry{
		{Version: "1.0.0", Title: "ServerPanel Pro — Multi-User Launch", Summary: "Full multi-user support with PostgreSQL, per-user Cloudflared tunnels, project management, and isolated environments.", ReleasedAt: "2026-04-17", CreatedAt: now},
		{Version: "0.7.0", Title: "Database persistence", Summary: "Added MariaDB persistence for runtime logs, changelog, and settings audit.", ReleasedAt: "2026-04-05", CreatedAt: now.Add(-24 * time.Hour)},
		{Version: "0.6.0", Title: "Settings editor", Summary: "Added responsive Settings UI with hostname/timezone/nameserver controls.", ReleasedAt: "2026-04-05", CreatedAt: now.Add(-48 * time.Hour)},
	}
}

// ─── Settings Audit ──────────────────────────────────────────────────────────

type SettingsAuditEntry struct {
	ID          int64     `json:"id"`
	UserID      *int64    `json:"userId"`
	Hostname    string    `json:"hostname"`
	Timezone    string    `json:"timezone"`
	Nameservers []string  `json:"nameservers"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (m *Manager) RecordSettingsAudit(userID *int64, hostname, timezone string, nameservers []string) {
	if !m.IsConnected() || m.db == nil {
		return
	}
	ns := marshalJSON(nameservers)
	go m.db.Exec(`
		INSERT INTO settings_audit (user_id, hostname, timezone, nameservers)
		VALUES ($1, $2, $3, $4::jsonb)
	`, userID, hostname, timezone, ns)
}

func (m *Manager) ListSettingsAudit(limit int) ([]SettingsAuditEntry, error) {
	if !m.IsConnected() || m.db == nil {
		return []SettingsAuditEntry{}, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 60
	}
	rows, err := m.db.Query(`
		SELECT id, user_id, COALESCE(hostname,''), COALESCE(timezone,''), COALESCE(nameservers::text,'[]'), created_at
		FROM settings_audit ORDER BY created_at DESC, id DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]SettingsAuditEntry, 0, limit)
	for rows.Next() {
		var item SettingsAuditEntry
		var nsJSON string
		if err := rows.Scan(&item.ID, &item.UserID, &item.Hostname, &item.Timezone, &nsJSON, &item.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(nsJSON), &item.Nameservers)
		entries = append(entries, item)
	}
	return entries, rows.Err()
}

// ─── Terminal Presets ────────────────────────────────────────────────────────

type TerminalPreset struct {
	ID        int64     `json:"id"`
	UserID    *int64    `json:"userId"`
	Label     string    `json:"label"`
	Command   string    `json:"command"`
	SortOrder int       `json:"sortOrder"`
	IsGlobal  bool      `json:"isGlobal"`
	CreatedAt time.Time `json:"createdAt"`
}

var defaultTerminalPresetCommands = []struct{ label, command string; order int }{
	{"", "whoami", 1},
	{"", "hostnamectl", 2},
	{"", "uptime", 3},
	{"", "df -h", 4},
	{"", "free -h", 5},
	{"", "docker ps -a", 6},
	{"", "systemctl status ui-panel --no-pager", 7},
	{"", "journalctl -u ui-panel -n 50 --no-pager", 8},
}

func (m *Manager) seedDefaultTerminalPresets() error {
	if m.db == nil {
		return nil
	}
	var count int64
	_ = m.db.QueryRow("SELECT COUNT(*) FROM terminal_presets WHERE is_global = true").Scan(&count)
	if count > 0 {
		return nil
	}
	for _, p := range defaultTerminalPresetCommands {
		_, err := m.db.Exec(
			`INSERT INTO terminal_presets (label, command, sort_order, is_global) VALUES ($1, $2, $3, true)`,
			p.label, p.command, p.order,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (m *Manager) ListTerminalPresets(userID *int64) ([]TerminalPreset, error) {
	if !m.IsConnected() || m.db == nil {
		return []TerminalPreset{}, nil
	}
	var rows *sql.Rows
	var err error
	if userID == nil {
		rows, err = m.db.Query(`
			SELECT id, user_id, COALESCE(label,''), command, sort_order, is_global, created_at
			FROM terminal_presets WHERE is_global = true
			ORDER BY sort_order ASC, id ASC
		`)
	} else {
		rows, err = m.db.Query(`
			SELECT id, user_id, COALESCE(label,''), command, sort_order, is_global, created_at
			FROM terminal_presets WHERE is_global = true OR user_id = $1
			ORDER BY sort_order ASC, id ASC
		`, *userID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]TerminalPreset, 0, 16)
	for rows.Next() {
		var p TerminalPreset
		if err := rows.Scan(&p.ID, &p.UserID, &p.Label, &p.Command, &p.SortOrder, &p.IsGlobal, &p.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

func (m *Manager) CreateTerminalPreset(userID *int64, label, command string) (TerminalPreset, error) {
	label = strings.TrimSpace(label)
	command = strings.TrimSpace(command)
	if command == "" {
		return TerminalPreset{}, fmt.Errorf("command tidak boleh kosong")
	}
	if !m.IsConnected() || m.db == nil {
		return TerminalPreset{}, fmt.Errorf("database tidak tersambung")
	}
	var maxOrder int
	_ = m.db.QueryRow("SELECT COALESCE(MAX(sort_order),0) FROM terminal_presets").Scan(&maxOrder)
	var p TerminalPreset
	err := m.db.QueryRow(
		`INSERT INTO terminal_presets (user_id, label, command, sort_order)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, user_id, COALESCE(label,''), command, sort_order, is_global, created_at`,
		userID, label, command, maxOrder+1,
	).Scan(&p.ID, &p.UserID, &p.Label, &p.Command, &p.SortOrder, &p.IsGlobal, &p.CreatedAt)
	return p, err
}

func (m *Manager) DeleteTerminalPreset(id int64, userID *int64) error {
	if !m.IsConnected() || m.db == nil {
		return fmt.Errorf("database tidak tersambung")
	}
	var res sql.Result
	var err error
	if userID == nil {
		res, err = m.db.Exec("DELETE FROM terminal_presets WHERE id = $1", id)
	} else {
		res, err = m.db.Exec("DELETE FROM terminal_presets WHERE id = $1 AND user_id = $2", id, *userID)
	}
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("preset tidak ditemukan")
	}
	return nil
}

func (m *Manager) ResetTerminalPresets(userID *int64) error {
	if !m.IsConnected() || m.db == nil {
		return fmt.Errorf("database tidak tersambung")
	}
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}

	if userID == nil {
		if _, err := tx.Exec("DELETE FROM terminal_presets WHERE is_global = true"); err != nil {
			_ = tx.Rollback()
			return err
		}
		for _, p := range defaultTerminalPresetCommands {
			if _, err := tx.Exec(
				`INSERT INTO terminal_presets (label, command, sort_order, is_global) VALUES ($1, $2, $3, true)`,
				p.label, p.command, p.order,
			); err != nil {
				_ = tx.Rollback()
				return err
			}
		}
	} else {
		if _, err := tx.Exec("DELETE FROM terminal_presets WHERE user_id = $1", *userID); err != nil {
			_ = tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// ─── Wallpaper (User Preferences) ────────────────────────────────────────────

func (m *Manager) SetWallpaper(userID int64, wallpaperData string) error {
	if !m.IsConnected() || m.db == nil {
		return fmt.Errorf("database tidak tersambung")
	}
	// wallpaper_data column is JSONB — wrap the raw string as a JSON string value
	jsonEncoded, err := json.Marshal(wallpaperData)
	if err != nil {
		return fmt.Errorf("failed to encode wallpaper data: %w", err)
	}
	_, err = m.db.Exec(`
		INSERT INTO user_preferences (user_id, wallpaper_data)
		VALUES ($1, $2::jsonb)
		ON CONFLICT (user_id) DO UPDATE SET wallpaper_data = EXCLUDED.wallpaper_data, updated_at = NOW()
	`, userID, string(jsonEncoded))
	return err
}

func (m *Manager) GetWallpaper(userID int64) (string, error) {
	if !m.IsConnected() || m.db == nil {
		return "", fmt.Errorf("database tidak tersambung")
	}
	var data sql.NullString
	err := m.db.QueryRow("SELECT wallpaper_data FROM user_preferences WHERE user_id = $1", userID).Scan(&data)
	if err != nil && err != sql.ErrNoRows {
		return "", err
	}
	if !data.Valid || data.String == "" {
		return "", nil
	}
	// Unwrap JSON string: the stored value is a JSON-encoded string like "data:image/..."
	var decoded string
	if jsonErr := json.Unmarshal([]byte(data.String), &decoded); jsonErr == nil {
		return decoded, nil
	}
	// Fallback: return raw value (for legacy data stored before this fix)
	return data.String, nil
}

// ─── TruncateData ─────────────────────────────────────────────────────────────

func (m *Manager) TruncateData(target string, days int) (int64, error) {
	if !m.IsConnected() || m.db == nil {
		return 0, fmt.Errorf("database not connected")
	}
	if days < 0 {
		days = 0
	}
	allowed := map[string]string{
		"runtime_logs":    "runtime_logs",
		"settings_audit":  "settings_audit",
		"tunnel_logs":     "tunnel_logs",
	}
	if target == "all" {
		var total int64
		for _, tbl := range []string{"runtime_logs", "settings_audit"} {
			res, err := m.db.Exec(fmt.Sprintf("DELETE FROM %s WHERE created_at < NOW() - $1::interval", tbl), fmt.Sprintf("%d days", days))
			if err == nil {
				if aff, err := res.RowsAffected(); err == nil {
					total += aff
				}
			}
		}
		return total, nil
	}
	tbl, ok := allowed[target]
	if !ok {
		return 0, fmt.Errorf("invalid target: %s", target)
	}
	res, err := m.db.Exec(fmt.Sprintf("DELETE FROM %s WHERE created_at < NOW() - $1::interval", tbl), fmt.Sprintf("%d days", days))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ─── Docs ────────────────────────────────────────────────────────────────────

type Doc struct {
	ID           int64      `json:"id"`
	AuthorUserID *int64     `json:"authorUserId"`
	Title        string     `json:"title"`
	Slug         string     `json:"slug"`
	Excerpt      string     `json:"excerpt"`
	Content      string     `json:"content"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

func (m *Manager) ListDocs(query string, limit, offset int, includeDrafts bool) ([]Doc, int64, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, 0, fmt.Errorf("database not connected")
	}
	query = strings.TrimSpace(query)
	if limit <= 0 {
		limit = 10
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	search := "%" + strings.ToLower(query) + "%"
	statusFilter := "status = 'published'"
	if includeDrafts {
		statusFilter = "status != 'archived' OR status = 'archived'"
	}
	var total int64
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM docs
		WHERE (%s)
		  AND ($1 = '' OR LOWER(title) LIKE $2 OR LOWER(slug) LIKE $2 OR LOWER(excerpt) LIKE $2 OR LOWER(content) LIKE $2)
	`, statusFilter)
	if err := m.db.QueryRow(countQuery, query, search).Scan(&total); err != nil {
		return nil, 0, err
	}
	listQuery := fmt.Sprintf(`
		SELECT id, author_user_id, title, slug, COALESCE(excerpt,''), COALESCE(content,''), status, created_at, updated_at
		FROM docs
		WHERE (%s)
		  AND ($1 = '' OR LOWER(title) LIKE $2 OR LOWER(slug) LIKE $2 OR LOWER(excerpt) LIKE $2 OR LOWER(content) LIKE $2)
		ORDER BY updated_at DESC, id DESC
		LIMIT $3 OFFSET $4
	`, statusFilter)
	rows, err := m.db.Query(listQuery, query, search, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items, err := scanDocs(rows)
	return items, total, err
}

func (m *Manager) GetDocByID(id int64, includeDrafts bool) (*Doc, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, fmt.Errorf("database not connected")
	}
	query := `
		SELECT id, author_user_id, title, slug, COALESCE(excerpt,''), COALESCE(content,''), status, created_at, updated_at
		FROM docs WHERE id = $1`
	if !includeDrafts {
		query += ` AND status = 'published'`
	}
	row := m.db.QueryRow(query, id)
	return scanDoc(row)
}

func (m *Manager) GetDocBySlug(slug string, includeDrafts bool) (*Doc, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, fmt.Errorf("database not connected")
	}
	query := `
		SELECT id, author_user_id, title, slug, COALESCE(excerpt,''), COALESCE(content,''), status, created_at, updated_at
		FROM docs WHERE slug = $1`
	if !includeDrafts {
		query += ` AND status = 'published'`
	}
	row := m.db.QueryRow(query, slug)
	return scanDoc(row)
}

func (m *Manager) CreateDoc(authorUserID *int64, title, slug, excerpt, content, status string) (*Doc, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, fmt.Errorf("database not connected")
	}
	var doc Doc
	err := m.db.QueryRow(`
		INSERT INTO docs (author_user_id, title, slug, excerpt, content, status)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, author_user_id, title, slug, COALESCE(excerpt,''), COALESCE(content,''), status, created_at, updated_at
	`, authorUserID, title, slug, excerpt, content, status).Scan(
		&doc.ID, &doc.AuthorUserID, &doc.Title, &doc.Slug, &doc.Excerpt, &doc.Content, &doc.Status, &doc.CreatedAt, &doc.UpdatedAt,
	)
	return &doc, err
}

func (m *Manager) UpdateDoc(id int64, title, slug, excerpt, content, status string) (*Doc, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, fmt.Errorf("database not connected")
	}
	var doc Doc
	err := m.db.QueryRow(`
		UPDATE docs
		SET title = $1, slug = $2, excerpt = $3, content = $4, status = $5, updated_at = NOW()
		WHERE id = $6
		RETURNING id, author_user_id, title, slug, COALESCE(excerpt,''), COALESCE(content,''), status, created_at, updated_at
	`, title, slug, excerpt, content, status, id).Scan(
		&doc.ID, &doc.AuthorUserID, &doc.Title, &doc.Slug, &doc.Excerpt, &doc.Content, &doc.Status, &doc.CreatedAt, &doc.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &doc, err
}

func (m *Manager) DeleteDoc(id int64) error {
	if !m.IsConnected() || m.db == nil {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM docs WHERE id = $1`, id)
	return err
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

func (m *Manager) setConnected(value bool) {
	m.mu.Lock()
	m.connected = value
	if value {
		m.lastError = ""
	}
	m.mu.Unlock()
}

func (m *Manager) setError(message string) {
	m.mu.Lock()
	m.connected = false
	m.lastError = strings.TrimSpace(message)
	m.mu.Unlock()
}

func (m *Manager) scalarCount(query string) int64 {
	var count int64
	_ = m.db.QueryRow(query).Scan(&count)
	return count
}

func marshalJSON(value any) string {
	if value == nil {
		return "null"
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return "null"
	}
	return string(payload)
}

// ─── Scan Helpers ─────────────────────────────────────────────────────────────

type rowScanner interface {
	Scan(dest ...any) error
}

func scanUser(row rowScanner) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.Status, &u.DisplayName, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &u, err
}

func scanUserFromRows(rows *sql.Rows) (*User, error) {
	var u User
	err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.Status, &u.DisplayName, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	return &u, err
}

func scanProject(row rowScanner) (*Project, error) {
	var p Project
	err := row.Scan(&p.ID, &p.UserID, &p.Name, &p.Slug, &p.Description, &p.Status, &p.ProjectType, &p.RepoURL, &p.WorkingDir, &p.ExposedPort, &p.AssignedPort, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &p, err
}

func scanProjects(rows *sql.Rows) ([]Project, error) {
	result := make([]Project, 0)
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Slug, &p.Description, &p.Status, &p.ProjectType, &p.RepoURL, &p.WorkingDir, &p.ExposedPort, &p.AssignedPort, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

func scanTunnel(row rowScanner) (*Tunnel, error) {
	var t Tunnel
	err := row.Scan(&t.ID, &t.UserID, &t.ProjectID, &t.Name, &t.TargetURL, &t.Status, &t.CFTunnelID, &t.CFHostname, &t.CFZoneID, &t.CreatedAt, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &t, err
}

func scanTunnels(rows *sql.Rows) ([]Tunnel, error) {
	result := make([]Tunnel, 0)
	for rows.Next() {
		var t Tunnel
		if err := rows.Scan(&t.ID, &t.UserID, &t.ProjectID, &t.Name, &t.TargetURL, &t.Status, &t.CFTunnelID, &t.CFHostname, &t.CFZoneID, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func scanDoc(row rowScanner) (*Doc, error) {
	var d Doc
	err := row.Scan(&d.ID, &d.AuthorUserID, &d.Title, &d.Slug, &d.Excerpt, &d.Content, &d.Status, &d.CreatedAt, &d.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &d, err
}

func scanDocs(rows *sql.Rows) ([]Doc, error) {
	result := make([]Doc, 0)
	for rows.Next() {
		var d Doc
		if err := rows.Scan(&d.ID, &d.AuthorUserID, &d.Title, &d.Slug, &d.Excerpt, &d.Content, &d.Status, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, d)
	}
	return result, rows.Err()
}
