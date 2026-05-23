package database

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"time"
)

// ─── Notification Listener Devices ──────────────────────────────────────────

// NotificationDevice represents a registered Android notification listener device.
type NotificationDevice struct {
	ID            int64    `json:"id"`
	DeviceID      string   `json:"deviceId"`
	APIKeyHash    string   `json:"-"`
	PackageFilter []string `json:"packageFilter"`
	Status        string   `json:"status"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// ListNotificationDevices returns all registered notification devices.
func (m *Manager) ListNotificationDevices() ([]NotificationDevice, error) {
	if !m.IsConnected() || m.db == nil {
		return []NotificationDevice{}, nil
	}
	rows, err := m.db.Query(`
		SELECT id, device_id, package_filter, status, created_at, updated_at
		FROM notification_devices ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []NotificationDevice
	for rows.Next() {
		var d NotificationDevice
		var pfJSON string
		if err := rows.Scan(&d.ID, &d.DeviceID, &pfJSON, &d.Status, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(pfJSON), &d.PackageFilter)
		if d.PackageFilter == nil {
			d.PackageFilter = []string{}
		}
		result = append(result, d)
	}
	return result, rows.Err()
}

// RegisterNotificationDevice registers a new notification listener device.
func (m *Manager) RegisterNotificationDevice(deviceID, apiKey string, packageFilter []string) (*NotificationDevice, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, nil
	}

	hash := sha256.Sum256([]byte(apiKey))
	apiKeyHash := hex.EncodeToString(hash[:])

	pfJSON, _ := json.Marshal(packageFilter)
	if pfJSON == nil {
		pfJSON = []byte("[]")
	}

	now := time.Now()
	_, err := m.db.Exec(`
		INSERT INTO notification_devices (device_id, api_key_hash, api_key_plain, package_filter, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4::jsonb, 'active', $5, $5)
		ON CONFLICT (device_id) DO UPDATE SET
			api_key_hash = EXCLUDED.api_key_hash,
			api_key_plain = EXCLUDED.api_key_plain,
			package_filter = EXCLUDED.package_filter,
			status = 'active',
			updated_at = NOW()
	`, deviceID, apiKeyHash, apiKey, string(pfJSON), now)
	if err != nil {
		return nil, err
	}

	var d NotificationDevice
	err = m.db.QueryRow(`
		SELECT id, device_id, package_filter, status, created_at, updated_at
		FROM notification_devices WHERE device_id = $1
	`, deviceID).Scan(&d.ID, &d.DeviceID, &pfJSON, &d.Status, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(pfJSON), &d.PackageFilter)
	return &d, nil
}

// GetNotificationDeviceByAPIKey retrieves a device by its API key.
func (m *Manager) GetNotificationDeviceByAPIKey(apiKey string) (*NotificationDevice, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, nil
	}

	var d NotificationDevice
	var pfJSON string
	err := m.db.QueryRow(`
		SELECT id, device_id, package_filter, status, created_at, updated_at
		FROM notification_devices WHERE api_key_plain = $1
	`, apiKey).Scan(&d.ID, &d.DeviceID, &pfJSON, &d.Status, &d.CreatedAt, &d.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(pfJSON), &d.PackageFilter)
	return &d, nil
}

// UpdateNotificationDevice updates a device's status or package filter.
func (m *Manager) UpdateNotificationDevice(deviceID, status string, packageFilter []string) (*NotificationDevice, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, nil
	}

	if status != "" && len(packageFilter) > 0 {
		pfJSON, _ := json.Marshal(packageFilter)
		_, err := m.db.Exec(`UPDATE notification_devices SET status = $1, package_filter = $2::jsonb, updated_at = NOW() WHERE device_id = $3`,
			status, string(pfJSON), deviceID)
		if err != nil {
			return nil, err
		}
	} else if status != "" {
		_, err := m.db.Exec(`UPDATE notification_devices SET status = $1, updated_at = NOW() WHERE device_id = $2`, status, deviceID)
		if err != nil {
			return nil, err
		}
	} else if len(packageFilter) > 0 {
		pfJSON, _ := json.Marshal(packageFilter)
		_, err := m.db.Exec(`UPDATE notification_devices SET package_filter = $1::jsonb, updated_at = NOW() WHERE device_id = $2`,
			string(pfJSON), deviceID)
		if err != nil {
			return nil, err
		}
	}

	var d NotificationDevice
	var pfJSON string
	err := m.db.QueryRow(`
		SELECT id, device_id, package_filter, status, created_at, updated_at
		FROM notification_devices WHERE device_id = $1
	`, deviceID).Scan(&d.ID, &d.DeviceID, &pfJSON, &d.Status, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(pfJSON), &d.PackageFilter)
	return &d, nil
}

// DeleteNotificationDevice removes a device.
func (m *Manager) DeleteNotificationDevice(deviceID string) error {
	if !m.IsConnected() || m.db == nil {
		return nil
	}
	_, err := m.db.Exec(`DELETE FROM notification_devices WHERE device_id = $1`, deviceID)
	return err
}

// ─── Captured Notifications ─────────────────────────────────────────────────

// CapturedNotification represents a notification received from an Android device.
type CapturedNotification struct {
	ID              int64     `json:"id"`
	DeviceID        string    `json:"deviceId"`
	PackageName     string    `json:"packageName"`
	AppName         string    `json:"appName"`
	Title           string    `json:"title"`
	Body            string    `json:"body"`
	AmountDetected  string    `json:"amountDetected"`
	ReceivedAt      time.Time `json:"receivedAt"`
	CreatedAt       time.Time `json:"createdAt"`
}

// InsertCapturedNotification stores a captured notification.
func (m *Manager) InsertCapturedNotification(deviceRefID int64, packageName, appName, title, body, amountDetected string) (*CapturedNotification, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, nil
	}

	// Get device_id from the ref id
	var deviceID string
	err := m.db.QueryRow(`SELECT device_id FROM notification_devices WHERE id = $1`, deviceRefID).Scan(&deviceID)
	if err != nil {
		return nil, err
	}

	var c CapturedNotification
	err = m.db.QueryRow(`
		INSERT INTO captured_notifications (device_id, device_ref_id, package_name, app_name, title, body, amount_detected)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, device_id, package_name, COALESCE(app_name, ''), COALESCE(title, ''), COALESCE(body, ''), COALESCE(amount_detected, ''), received_at, created_at
	`, deviceID, deviceRefID, packageName, appName, title, body, amountDetected).Scan(
		&c.ID, &c.DeviceID, &c.PackageName, &c.AppName, &c.Title, &c.Body, &c.AmountDetected, &c.ReceivedAt, &c.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// ListCapturedNotifications returns recent captured notifications.
func (m *Manager) ListCapturedNotifications(limit int) ([]CapturedNotification, error) {
	if !m.IsConnected() || m.db == nil {
		return []CapturedNotification{}, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	rows, err := m.db.Query(`
		SELECT id, device_id, package_name, COALESCE(app_name, ''), COALESCE(title, ''), COALESCE(body, ''), COALESCE(amount_detected, ''), received_at, created_at
		FROM captured_notifications ORDER BY received_at DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []CapturedNotification
	for rows.Next() {
		var c CapturedNotification
		if err := rows.Scan(&c.ID, &c.DeviceID, &c.PackageName, &c.AppName, &c.Title, &c.Body, &c.AmountDetected, &c.ReceivedAt, &c.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}
