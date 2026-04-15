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
		manager.setError(fmt.Sprintf("schema database failed: %v", err))
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
	
	// Execute async
	go func() {
		_, _ = m.db.Exec(`
			INSERT INTO runtime_logs (service, level, message, metadata_json)
			VALUES (?, ?, ?, ?)
		`, service, level, message, metadataJSON)
	}()
}

func (m *Manager) TruncateData(target string, days int) (int64, error) {
	if !m.IsConnected() || m.db == nil {
		return 0, fmt.Errorf("database not connected")
	}
	if days < 0 {
		days = 0
	}
	
	var table string
	switch target {
	case "runtime_logs":
		table = "runtime_logs"
	case "settings_audit":
		table = "settings_audit"
	case "changelog_entries":
		table = "changelog_entries"
	case "terminal_presets":
		table = "terminal_presets"
	case "all":
		// Truncate runtime logs and settings audit only for 'all'
		var total int64
		if res, err := m.db.Exec("DELETE FROM runtime_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", days); err == nil {
			if aff, err := res.RowsAffected(); err == nil { total += aff }
		}
		if res, err := m.db.Exec("DELETE FROM settings_audit WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", days); err == nil {
			if aff, err := res.RowsAffected(); err == nil { total += aff }
		}
		return total, nil
	default:
		return 0, fmt.Errorf("invalid target table: %s", target)
	}

	query := fmt.Sprintf("DELETE FROM %s WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)", table)
	res, err := m.db.Exec(query, days)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
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

		CREATE TABLE IF NOT EXISTS terminal_presets (
			id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
			label VARCHAR(190) NOT NULL DEFAULT '',
			command TEXT NOT NULL,
			sort_order INT NOT NULL DEFAULT 0,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			INDEX idx_terminal_presets_sort (sort_order, id)
		);

		CREATE TABLE IF NOT EXISTS user_preferences (
			username VARCHAR(120) PRIMARY KEY,
			wallpaper_json LONGTEXT NULL,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		return err
	}
	return m.seedDefaultTerminalPresets()
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

// ─── Terminal Presets ────────────────────────────────────────────────────────

type TerminalPreset struct {
	ID        int64     `json:"id"`
	Label     string    `json:"label"`
	Command   string    `json:"command"`
	SortOrder int       `json:"sortOrder"`
	CreatedAt time.Time `json:"createdAt"`
}

var defaultTerminalPresets = []TerminalPreset{
	{Label: "", Command: "whoami", SortOrder: 1},
	{Label: "", Command: "hostnamectl", SortOrder: 2},
	{Label: "", Command: "uptime", SortOrder: 3},
	{Label: "", Command: "df -h", SortOrder: 4},
	{Label: "", Command: "free -h", SortOrder: 5},
	{Label: "", Command: "docker ps -a", SortOrder: 6},
	{Label: "", Command: "systemctl status ui-panel --no-pager", SortOrder: 7},
	{Label: "", Command: "journalctl -u ui-panel -n 50 --no-pager", SortOrder: 8},
}

func (m *Manager) seedDefaultTerminalPresets() error {
	if m.db == nil {
		return nil
	}
	var count int64
	_ = m.db.QueryRow("SELECT COUNT(*) FROM terminal_presets").Scan(&count)
	if count > 0 {
		return nil
	}
	for _, p := range defaultTerminalPresets {
		_, err := m.db.Exec(
			`INSERT INTO terminal_presets (label, command, sort_order) VALUES (?, ?, ?)`,
			p.Label, p.Command, p.SortOrder,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (m *Manager) ListTerminalPresets() ([]TerminalPreset, error) {
	if !m.IsConnected() || m.db == nil {
		presets := make([]TerminalPreset, len(defaultTerminalPresets))
		copy(presets, defaultTerminalPresets)
		for i := range presets {
			presets[i].ID = int64(i + 1)
		}
		return presets, nil
	}
	rows, err := m.db.Query(`
		SELECT id, COALESCE(label,''), command, sort_order, created_at
		FROM terminal_presets
		ORDER BY sort_order ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]TerminalPreset, 0, 16)
	for rows.Next() {
		var p TerminalPreset
		if err := rows.Scan(&p.ID, &p.Label, &p.Command, &p.SortOrder, &p.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

func (m *Manager) CreateTerminalPreset(label, command string) (TerminalPreset, error) {
	label   = strings.TrimSpace(label)
	command = strings.TrimSpace(command)
	if command == "" {
		return TerminalPreset{}, fmt.Errorf("command tidak boleh kosong")
	}
	if !m.IsConnected() || m.db == nil {
		return TerminalPreset{}, fmt.Errorf("database tidak tersambung")
	}
	var maxOrder int
	_ = m.db.QueryRow("SELECT COALESCE(MAX(sort_order),0) FROM terminal_presets").Scan(&maxOrder)
	res, err := m.db.Exec(
		`INSERT INTO terminal_presets (label, command, sort_order) VALUES (?, ?, ?)`,
		label, command, maxOrder+1,
	)
	if err != nil {
		return TerminalPreset{}, err
	}
	id, _ := res.LastInsertId()
	return TerminalPreset{
		ID:        id,
		Label:     label,
		Command:   command,
		SortOrder: maxOrder + 1,
		CreatedAt: time.Now(),
	}, nil
}

func (m *Manager) DeleteTerminalPreset(id int64) error {
	if !m.IsConnected() || m.db == nil {
		return fmt.Errorf("database tidak tersambung")
	}
	res, err := m.db.Exec("DELETE FROM terminal_presets WHERE id = ?", id)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("preset tidak ditemukan")
	}
	return nil
}

func (m *Manager) ResetTerminalPresets() error {
	if !m.IsConnected() || m.db == nil {
		return fmt.Errorf("database tidak tersambung")
	}
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM terminal_presets"); err != nil {
		_ = tx.Rollback()
		return err
	}
	for _, p := range defaultTerminalPresets {
		if _, err := tx.Exec(
			`INSERT INTO terminal_presets (label, command, sort_order) VALUES (?, ?, ?)`,
			p.Label, p.Command, p.SortOrder,
		); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
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

func (m *Manager) SetWallpaper(username, wallpaperData string) error {
	if !m.IsConnected() || m.db == nil {
		return fmt.Errorf("database tidak tersambung")
	}
	_, err := m.db.Exec(`
		INSERT INTO user_preferences (username, wallpaper_json)
		VALUES (?, ?)
		ON DUPLICATE KEY UPDATE wallpaper_json = VALUES(wallpaper_json)
	`, strings.TrimSpace(username), wallpaperData)
	return err
}

func (m *Manager) GetWallpaper(username string) (string, error) {
	if !m.IsConnected() || m.db == nil {
		return "", fmt.Errorf("database tidak tersambung")
	}
	var wallpaperData sql.NullString
	err := m.db.QueryRow("SELECT wallpaper_json FROM user_preferences WHERE username = ?", strings.TrimSpace(username)).Scan(&wallpaperData)
	if err != nil && err != sql.ErrNoRows {
		return "", err
	}
	return wallpaperData.String, nil
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
