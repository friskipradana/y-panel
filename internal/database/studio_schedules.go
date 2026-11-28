package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// StudioSchedule defines an automated recurring article/documentation generation job.
type StudioSchedule struct {
	ID          int64      `json:"id"`
	OwnerUserID int64      `json:"ownerUserId"`
	Name        string     `json:"name"`
	Mode        string     `json:"mode"` // enrich_docs | topic_series
	Theme       string     `json:"theme"`
	BrandName   string     `json:"brandName"`
	Category    string     `json:"category"`
	Topics      []string   `json:"topics"`
	UsedTopics  []string   `json:"usedTopics"`
	Language    string     `json:"language"` // id | en
	Cadence     string     `json:"cadence"`  // hourly | daily | weekly | monthly
	RunHour     int        `json:"runHour"`
	RunWeekday  int        `json:"runWeekday"` // 0=Sun..6=Sat
	AutoPublish bool       `json:"autoPublish"`
	ShowInDocs  bool       `json:"showInDocs"`
	Enabled     bool       `json:"enabled"`
	RunCount    int        `json:"runCount"`
	LastRunAt   *time.Time `json:"lastRunAt,omitempty"`
	NextRunAt   *time.Time `json:"nextRunAt,omitempty"`
	LastStatus  string     `json:"lastStatus"` // idle | running | success | error
	LastError   string     `json:"lastError"`
	LastPageID  int64      `json:"lastPageId"`
	LastTitle   string     `json:"lastTitle"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

const studioScheduleCols = `id, owner_user_id, name, mode, theme, brand_name, category,
	topics_json, used_topics_json, language, cadence, run_hour, run_weekday,
	auto_publish, show_in_docs, enabled, run_count, last_run_at, next_run_at,
	last_status, last_error, last_page_id, last_title, created_at, updated_at`

func normalizeStudioSchedule(sc *StudioSchedule) {
	sc.Name = strings.TrimSpace(sc.Name)
	if sc.Mode != "topic_series" {
		sc.Mode = "enrich_docs"
	}
	sc.Theme = strings.TrimSpace(sc.Theme)
	sc.BrandName = strings.TrimSpace(sc.BrandName)
	if sc.BrandName == "" {
		sc.BrandName = "Reneo"
	}
	sc.Category = strings.TrimSpace(sc.Category)
	if sc.Category == "" {
		sc.Category = "panduan"
	}
	if sc.Language != "en" {
		sc.Language = "id"
	}
	switch sc.Cadence {
	case "hourly", "daily", "weekly", "monthly":
	default:
		sc.Cadence = "daily"
	}
	if sc.RunHour < 0 || sc.RunHour > 23 {
		sc.RunHour = 9
	}
	if sc.RunWeekday < 0 || sc.RunWeekday > 6 {
		sc.RunWeekday = 1
	}
	cleanTopics := []string{}
	for _, t := range sc.Topics {
		if trimmed := strings.TrimSpace(t); trimmed != "" {
			cleanTopics = append(cleanTopics, trimmed)
		}
	}
	sc.Topics = cleanTopics
	if sc.UsedTopics == nil {
		sc.UsedTopics = []string{}
	}
	if sc.LastStatus == "" {
		sc.LastStatus = "idle"
	}
}

func scanStudioSchedule(scanner interface{ Scan(dest ...any) error }) (*StudioSchedule, error) {
	var sc StudioSchedule
	var topicsJSON, usedJSON string
	var lastRun, nextRun sql.NullTime
	err := scanner.Scan(
		&sc.ID, &sc.OwnerUserID, &sc.Name, &sc.Mode, &sc.Theme, &sc.BrandName, &sc.Category,
		&topicsJSON, &usedJSON, &sc.Language, &sc.Cadence, &sc.RunHour, &sc.RunWeekday,
		&sc.AutoPublish, &sc.ShowInDocs, &sc.Enabled, &sc.RunCount, &lastRun, &nextRun,
		&sc.LastStatus, &sc.LastError, &sc.LastPageID, &sc.LastTitle, &sc.CreatedAt, &sc.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(topicsJSON), &sc.Topics)
	_ = json.Unmarshal([]byte(usedJSON), &sc.UsedTopics)
	if sc.Topics == nil {
		sc.Topics = []string{}
	}
	if sc.UsedTopics == nil {
		sc.UsedTopics = []string{}
	}
	if lastRun.Valid {
		t := lastRun.Time
		sc.LastRunAt = &t
	}
	if nextRun.Valid {
		t := nextRun.Time
		sc.NextRunAt = &t
	}
	return &sc, nil
}

func (m *Manager) ListStudioSchedules(ownerUserID int64, includeAll bool) ([]StudioSchedule, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var rows *sql.Rows
	var err error
	if includeAll {
		rows, err = m.db.Query(`SELECT ` + studioScheduleCols + ` FROM studio_schedules ORDER BY id DESC LIMIT 100`)
	} else {
		rows, err = m.db.Query(`SELECT `+studioScheduleCols+` FROM studio_schedules WHERE owner_user_id = $1 ORDER BY id DESC LIMIT 100`, ownerUserID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StudioSchedule{}
	for rows.Next() {
		item, sErr := scanStudioSchedule(rows)
		if sErr != nil {
			return nil, sErr
		}
		if item != nil {
			out = append(out, *item)
		}
	}
	return out, nil
}

func (m *Manager) ListDueStudioSchedules(now time.Time) ([]StudioSchedule, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`
		SELECT `+studioScheduleCols+`
		FROM studio_schedules
		WHERE enabled = TRUE
		  AND last_status <> 'running'
		  AND next_run_at IS NOT NULL
		  AND next_run_at <= $1
		ORDER BY next_run_at ASC
		LIMIT 10`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StudioSchedule{}
	for rows.Next() {
		item, sErr := scanStudioSchedule(rows)
		if sErr != nil {
			return nil, sErr
		}
		if item != nil {
			out = append(out, *item)
		}
	}
	return out, nil
}

func (m *Manager) GetStudioSchedule(id int64) (*StudioSchedule, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	return scanStudioSchedule(m.db.QueryRow(`SELECT `+studioScheduleCols+` FROM studio_schedules WHERE id = $1`, id))
}

func (m *Manager) CreateStudioSchedule(sc *StudioSchedule) (*StudioSchedule, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	normalizeStudioSchedule(sc)
	topicsB, _ := json.Marshal(sc.Topics)
	usedB, _ := json.Marshal(sc.UsedTopics)
	err := m.db.QueryRow(`
		INSERT INTO studio_schedules (
			owner_user_id, name, mode, theme, brand_name, category,
			topics_json, used_topics_json, language, cadence, run_hour, run_weekday,
			auto_publish, show_in_docs, enabled, next_run_at, last_status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		RETURNING id, created_at, updated_at`,
		sc.OwnerUserID, sc.Name, sc.Mode, sc.Theme, sc.BrandName, sc.Category,
		string(topicsB), string(usedB), sc.Language, sc.Cadence, sc.RunHour, sc.RunWeekday,
		sc.AutoPublish, sc.ShowInDocs, sc.Enabled, sc.NextRunAt, sc.LastStatus,
	).Scan(&sc.ID, &sc.CreatedAt, &sc.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return sc, nil
}

func (m *Manager) UpdateStudioSchedule(sc *StudioSchedule) (*StudioSchedule, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	normalizeStudioSchedule(sc)
	topicsB, _ := json.Marshal(sc.Topics)
	usedB, _ := json.Marshal(sc.UsedTopics)
	err := m.db.QueryRow(`
		UPDATE studio_schedules SET
			name = $2, mode = $3, theme = $4, brand_name = $5, category = $6,
			topics_json = $7, used_topics_json = $8, language = $9, cadence = $10,
			run_hour = $11, run_weekday = $12, auto_publish = $13, show_in_docs = $14,
			enabled = $15, run_count = $16, last_run_at = $17, next_run_at = $18,
			last_status = $19, last_error = $20, last_page_id = $21, last_title = $22,
			updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`,
		sc.ID, sc.Name, sc.Mode, sc.Theme, sc.BrandName, sc.Category,
		string(topicsB), string(usedB), sc.Language, sc.Cadence,
		sc.RunHour, sc.RunWeekday, sc.AutoPublish, sc.ShowInDocs,
		sc.Enabled, sc.RunCount, sc.LastRunAt, sc.NextRunAt,
		sc.LastStatus, sc.LastError, sc.LastPageID, sc.LastTitle,
	).Scan(&sc.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return sc, nil
}

func (m *Manager) DeleteStudioSchedule(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM studio_schedules WHERE id = $1`, id)
	return err
}
