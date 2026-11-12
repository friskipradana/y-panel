package database

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// InstalledApp represents a self-hosted container app or web app installed onto a user's desktop.
type InstalledApp struct {
	ID            int64  `json:"id"`
	UserID        int64  `json:"userId"`
	Slug          string `json:"slug"`
	CatalogID     string `json:"catalogId"`
	Name          string `json:"name"`
	Tagline       string `json:"tagline"`
	Category      string `json:"category"`
	IconKey       string `json:"iconKey"`
	IconColor     string `json:"iconColor"`
	Kind          string `json:"kind"` // "docker" | "existing-container" | "custom-url"
	Image         string `json:"image"`
	ContainerName string `json:"containerName"`
	HostPort      int    `json:"hostPort"`
	ContainerPort int    `json:"containerPort"`
	OpenPath      string `json:"openPath"`
	TargetURL     string `json:"targetUrl"`
	UseProxy      bool   `json:"useProxy"`
	ConfigJSON    string `json:"configJson"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

const installedAppCols = `id, user_id, slug, catalog_id, name, tagline, category, icon_key, icon_color, kind, image, container_name, host_port, container_port, open_path, target_url, use_proxy, config_json, created_at, updated_at`

func scanInstalledApp(row interface{ Scan(dest ...any) error }) (*InstalledApp, error) {
	var item InstalledApp
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&item.ID, &item.UserID, &item.Slug, &item.CatalogID, &item.Name, &item.Tagline,
		&item.Category, &item.IconKey, &item.IconColor, &item.Kind, &item.Image,
		&item.ContainerName, &item.HostPort, &item.ContainerPort, &item.OpenPath,
		&item.TargetURL, &item.UseProxy, &item.ConfigJSON, &createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}
	item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	item.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return &item, nil
}

func (m *Manager) ListInstalledApps(userID int64) ([]InstalledApp, error) {
	if m == nil || !m.IsConnected() {
		return []InstalledApp{}, nil
	}
	rows, err := m.db.Query(
		`SELECT `+installedAppCols+` FROM installed_apps WHERE user_id = $1 ORDER BY id ASC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]InstalledApp, 0)
	for rows.Next() {
		item, err := scanInstalledApp(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

func (m *Manager) GetInstalledApp(id int64) (*InstalledApp, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}
	row := m.db.QueryRow(`SELECT `+installedAppCols+` FROM installed_apps WHERE id = $1`, id)
	item, err := scanInstalledApp(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

func (m *Manager) GetInstalledAppBySlug(userID int64, slug string) (*InstalledApp, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}
	row := m.db.QueryRow(
		`SELECT `+installedAppCols+` FROM installed_apps WHERE user_id = $1 AND slug = $2`,
		userID, slug,
	)
	item, err := scanInstalledApp(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

func (m *Manager) CreateInstalledApp(app *InstalledApp) (*InstalledApp, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}
	if app == nil {
		return nil, errors.New("installed app payload is required")
	}
	if strings.TrimSpace(app.ConfigJSON) == "" {
		app.ConfigJSON = "{}"
	}
	if strings.TrimSpace(app.OpenPath) == "" {
		app.OpenPath = "/"
	}
	row := m.db.QueryRow(
		`INSERT INTO installed_apps (
			user_id, slug, catalog_id, name, tagline, category, icon_key, icon_color,
			kind, image, container_name, host_port, container_port, open_path, target_url, use_proxy, config_json
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		RETURNING `+installedAppCols,
		app.UserID, app.Slug, app.CatalogID, app.Name, app.Tagline, app.Category,
		app.IconKey, app.IconColor, app.Kind, app.Image, app.ContainerName,
		app.HostPort, app.ContainerPort, app.OpenPath, app.TargetURL, app.UseProxy, app.ConfigJSON,
	)
	return scanInstalledApp(row)
}

func (m *Manager) UpdateInstalledApp(id int64, patch map[string]any) (*InstalledApp, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}
	sets := make([]string, 0, len(patch)+1)
	args := make([]any, 0, len(patch)+1)
	idx := 1
	allowed := map[string]string{
		"name":       "name",
		"tagline":    "tagline",
		"category":   "category",
		"iconKey":    "icon_key",
		"iconColor":  "icon_color",
		"image":      "image",
		"openPath":   "open_path",
		"targetUrl":  "target_url",
		"useProxy":   "use_proxy",
		"hostPort":   "host_port",
		"configJson": "config_json",
	}
	for k, col := range allowed {
		if v, ok := patch[k]; ok {
			sets = append(sets, fmt.Sprintf("%s = $%d", col, idx))
			args = append(args, v)
			idx++
		}
	}
	if len(sets) == 0 {
		return m.GetInstalledApp(id)
	}
	sets = append(sets, "updated_at = NOW()")
	args = append(args, id)
	q := fmt.Sprintf(
		"UPDATE installed_apps SET %s WHERE id = $%d RETURNING %s",
		strings.Join(sets, ", "), idx, installedAppCols,
	)
	item, err := scanInstalledApp(m.db.QueryRow(q, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

func (m *Manager) DeleteInstalledApp(id int64) error {
	if m == nil || !m.IsConnected() {
		return errors.New("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM installed_apps WHERE id = $1`, id)
	return err
}

