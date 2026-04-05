package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

type Config struct {
	Enabled  bool
	Host     string
	Port     int
	User     string
	Password string
	Name     string
}

type Manager struct {
	cfg       Config
	db        *sql.DB
	mu        sync.RWMutex
	connected bool
	lastError string
}

type Status struct {
	Enabled            bool   `json:"enabled"`
	Connected          bool   `json:"connected"`
	Host               string `json:"host"`
	Port               int    `json:"port"`
	Database           string `json:"database"`
	User               string `json:"user"`
	LastError          string `json:"lastError"`
	ChangelogCount     int64  `json:"changelogCount"`
	RuntimeLogCount    int64  `json:"runtimeLogCount"`
	SettingsAuditCount int64  `json:"settingsAuditCount"`
}

type RuntimeLog struct {
	ID        int64     `json:"id"`
	Service   string    `json:"service"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Metadata  string    `json:"metadata"`
	CreatedAt time.Time `json:"createdAt"`
}

type ChangelogEntry struct {
	ID         int64     `json:"id"`
	Version    string    `json:"version"`
	Title      string    `json:"title"`
	Summary    string    `json:"summary"`
	ReleasedAt string    `json:"releasedAt"`
	CreatedAt  time.Time `json:"createdAt"`
}

type SettingsAuditEntry struct {
	ID          int64     `json:"id"`
	Username    string    `json:"username"`
	Hostname    string    `json:"hostname"`
	Timezone    string    `json:"timezone"`
	Nameservers []string  `json:"nameservers"`
	CreatedAt   time.Time `json:"createdAt"`
}

func New(cfg Config) *Manager {
	manager := &Manager{cfg: cfg}
	if !cfg.Enabled {
		manager.lastError = "database disabled"
		return manager
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&multiStatements=true", cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.Name)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		manager.setError(fmt.Sprintf("sql open failed: %v", err))
		return manager
	}
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetMaxIdleConns(3)
	db.SetMaxOpenConns(8)

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		manager.setError(fmt.Sprintf("ping failed: %v", err))
		_ = db.Close()
		return manager
	}

	manager.db = db
	manager.setConnected(true)

	if err := manager.ensureSchema(); err != nil {
		manager.setError(fmt.Sprintf("schema bootstrap failed: %v", err))
		return manager
	}
	if err := manager.seedDefaultChangelog(); err != nil {
		manager.setError(fmt.Sprintf("changelog seed failed: %v", err))
	}

	return manager
}

func (m *Manager) Close() error {
	if m == nil || m.db == nil {
		return nil
	}
	return m.db.Close()
}

func (m *Manager) Status() Status {
	m.mu.RLock()
	status := Status{
		Enabled:   m.cfg.Enabled,
		Connected: m.connected,
		Host:      m.cfg.Host,
		Port:      m.cfg.Port,
		Database:  m.cfg.Name,
		User:      m.cfg.User,
		LastError: m.lastError,
	}
	m.mu.RUnlock()

	if !status.Connected || m.db == nil {
		return status
	}
	status.ChangelogCount = m.scalarCount("SELECT COUNT(*) FROM changelog_entries")
	status.RuntimeLogCount = m.scalarCount("SELECT COUNT(*) FROM runtime_logs")
	status.SettingsAuditCount = m.scalarCount("SELECT COUNT(*) FROM settings_audit")
	return status
}

func (m *Manager) ListRuntimeLogs(limit int) ([]RuntimeLog, error) {
	if !m.IsConnected() || m.db == nil {
		return []RuntimeLog{}, nil
	}
	if limit <= 0 || limit > 300 {
		limit = 120
	}
	rows, err := m.db.Query(`
		SELECT id, service, level, message, COALESCE(metadata_json, ''), created_at
		FROM runtime_logs
		ORDER BY id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]RuntimeLog, 0, limit)
	for rows.Next() {
		var item RuntimeLog
		if err := rows.Scan(&item.ID, &item.Service, &item.Level, &item.Message, &item.Metadata, &item.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, item)
	}
	return entries, rows.Err()
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
		FROM changelog_entries
		ORDER BY created_at DESC, id DESC
		LIMIT ?
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

func (m *Manager) ListSettingsAudit(limit int) ([]SettingsAuditEntry, error) {
	if !m.IsConnected() || m.db == nil {
		return []SettingsAuditEntry{}, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 60
	}
	rows, err := m.db.Query(`
		SELECT id, username, hostname, timezone, COALESCE(nameservers_json, '[]'), created_at
		FROM settings_audit
		ORDER BY created_at DESC, id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]SettingsAuditEntry, 0, limit)
	for rows.Next() {
		var item SettingsAuditEntry
		var nameserversJSON string
		if err := rows.Scan(&item.ID, &item.Username, &item.Hostname, &item.Timezone, &nameserversJSON, &item.CreatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(nameserversJSON), &item.Nameservers); err != nil {
			item.Nameservers = nil
		}
		entries = append(entries, item)
	}
	return entries, rows.Err()
}

func (m *Manager) RecordRuntimeLog(service, level, message string, metadata map[string]any) {
	if !m.IsConnected() || m.db == nil {
		return
	}
	service = strings.TrimSpace(service)
	if service == "" {
		service = "ui-panel"
	}
	level = strings.TrimSpace(strings.ToLower(level))
	if level == "" {
		level = "info"
	}
	message = strings.TrimSpace(message)
	if message == "" {
		return
	}
	metadataJSON := marshalJSON(metadata)
	_, _ = m.db.Exec(`INSERT INTO runtime_logs (service, level, message, metadata_json) VALUES (?, ?, ?, ?)`, service, level, message, metadataJSON)
}

func (m *Manager) RecordSettingsAudit(username, hostname, timezone string, nameservers []string) {
	if !m.IsConnected() || m.db == nil {
		return
	}
	nameserversJSON := marshalJSON(nameservers)
	_, _ = m.db.Exec(`
		INSERT INTO settings_audit (username, hostname, timezone, nameservers_json)
		VALUES (?, ?, ?, ?)
	`, strings.TrimSpace(username), strings.TrimSpace(hostname), strings.TrimSpace(timezone), nameserversJSON)
}

func (m *Manager) IsConnected() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.connected
}

func (m *Manager) scalarCount(query string) int64 {
	var count int64
	_ = m.db.QueryRow(query).Scan(&count)
	return count
}

func (m *Manager) ensureSchema() error {
	if m.db == nil {
		return nil
	}
	_, err := m.db.Exec(`
		CREATE TABLE IF NOT EXISTS runtime_logs (
			id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
			service VARCHAR(120) NOT NULL,
			level VARCHAR(32) NOT NULL,
			message TEXT NOT NULL,
			metadata_json LONGTEXT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_runtime_logs_created_at (created_at),
			INDEX idx_runtime_logs_service (service)
		);

		CREATE TABLE IF NOT EXISTS changelog_entries (
			id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
			version VARCHAR(32) NOT NULL,
			title VARCHAR(190) NOT NULL,
			summary TEXT NOT NULL,
			released_at VARCHAR(32) NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE KEY uniq_changelog_version_title (version, title)
		);

		CREATE TABLE IF NOT EXISTS settings_audit (
			id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
			username VARCHAR(120) NOT NULL,
			hostname VARCHAR(190) NOT NULL,
			timezone VARCHAR(120) NOT NULL,
			nameservers_json LONGTEXT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_settings_audit_created_at (created_at)
		);
	`)
	return err
}

func (m *Manager) seedDefaultChangelog() error {
	if m.db == nil {
		return nil
	}
	for _, item := range defaultChangelogEntries() {
		_, err := m.db.Exec(`
			INSERT INTO changelog_entries (version, title, summary, released_at)
			VALUES (?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE summary = VALUES(summary), released_at = VALUES(released_at)
		`, item.Version, item.Title, item.Summary, item.ReleasedAt)
		if err != nil {
			return err
		}
	}
	return nil
}

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

func marshalJSON(value any) string {
	if value == nil {
		return ""
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(payload)
}

func defaultChangelogEntries() []ChangelogEntry {
	now := time.Now()
	return []ChangelogEntry{
		{Version: "0.6.0", Title: "Responsive settings editor", Summary: "Added responsive Settings UI, editable hostname/timezone/nameserver controls, and dedicated host settings APIs.", ReleasedAt: "2026-04-05", CreatedAt: now.Add(-1 * time.Hour)},
		{Version: "0.6.0", Title: "Settings quick launch", Summary: "Added a Settings quick-launch item plus dedicated desktop shell routing for configuration editing.", ReleasedAt: "2026-04-05", CreatedAt: now.Add(-58 * time.Minute)},
		{Version: "0.5.0", Title: "System logs viewer", Summary: "Added backend journalctl API support and a dedicated System Logs window with sticky filters.", ReleasedAt: "2026-04-05", CreatedAt: now.Add(-2 * time.Hour)},
		{Version: "0.5.0", Title: "Runtime observability", Summary: "Expanded frontend and backend runtime observability for auth and terminal flows, including safer websocket middleware behavior.", ReleasedAt: "2026-04-05", CreatedAt: now.Add(-119 * time.Minute)},
		{Version: "0.4.0", Title: "Host terminal stabilization", Summary: "Improved host-terminal workflow and deployment ergonomics while simplifying login presentation.", ReleasedAt: "2026-04-05", CreatedAt: now.Add(-3 * time.Hour)},
	}
}
