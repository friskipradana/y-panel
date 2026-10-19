package database

import (
	"database/sql"
	"errors"
	"fmt"
)

// NotificationTemplate is the text the seller wrote for one event in one language
type NotificationTemplate struct {
	Event  string `json:"event"`
	Locale string `json:"locale"`
	Body   string `json:"body"`
}

// ListNotificationTemplates returns every text the seller changed
func (m *Manager) ListNotificationTemplates() ([]NotificationTemplate, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`SELECT event, locale, body FROM notification_templates ORDER BY event, locale`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NotificationTemplate{}
	for rows.Next() {
		var t NotificationTemplate
		if err := rows.Scan(&t.Event, &t.Locale, &t.Body); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetNotificationTemplate returns the changed text of an event, or "" when the text that comes with Reneo is used
func (m *Manager) GetNotificationTemplate(event, locale string) (string, error) {
	if !m.IsConnected() {
		return "", fmt.Errorf("database not connected")
	}
	var body string
	err := m.db.QueryRow(`SELECT body FROM notification_templates WHERE event = $1 AND locale = $2`, event, locale).Scan(&body)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return body, err
}

// SetNotificationTemplate saves the text of an event in a language, replacing the one before
func (m *Manager) SetNotificationTemplate(event, locale, body string, userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	var by any
	if userID > 0 {
		by = userID
	}
	_, err := m.db.Exec(`
		INSERT INTO notification_templates (event, locale, body, updated_by) VALUES ($1, $2, $3, $4)
		ON CONFLICT (event, locale) DO UPDATE SET body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = NOW()
	`, event, locale, body, by)
	return err
}

// DeleteNotificationTemplate brings back the text that comes with Reneo
func (m *Manager) DeleteNotificationTemplate(event, locale string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM notification_templates WHERE event = $1 AND locale = $2`, event, locale)
	return err
}
