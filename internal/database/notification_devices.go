package database

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
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
	// LastSeenAt is when the phone last sent a notification (nil: never); Received counts what it sent
	LastSeenAt *time.Time `json:"lastSeenAt"`
	Received   int64      `json:"received"`
}

// ListNotificationDevices returns all registered notification devices.
func (m *Manager) ListNotificationDevices() ([]NotificationDevice, error) {
	if !m.IsConnected() || m.db == nil {
		return []NotificationDevice{}, nil
	}
	rows, err := m.db.Query(`
		SELECT d.id, d.device_id, d.package_filter, d.status, d.created_at, d.updated_at,
			GREATEST(c.last_seen, d.last_ping_at), COALESCE(c.received, 0)
		FROM notification_devices d
		LEFT JOIN (
			SELECT device_ref_id, MAX(received_at) AS last_seen, COUNT(*) AS received
			FROM captured_notifications GROUP BY device_ref_id
		) c ON c.device_ref_id = d.id
		ORDER BY d.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := []NotificationDevice{}
	for rows.Next() {
		var d NotificationDevice
		var pfJSON string
		if err := rows.Scan(&d.ID, &d.DeviceID, &pfJSON, &d.Status, &d.CreatedAt, &d.UpdatedAt, &d.LastSeenAt, &d.Received); err != nil {
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

// ErrNotificationDeviceExists is a new device whose name another phone already has
var ErrNotificationDeviceExists = errors.New("a device with this name already exists")

func hashDeviceKey(apiKey string) string {
	sum := sha256.Sum256([]byte(apiKey))
	return hex.EncodeToString(sum[:])
}

// RegisterNotificationDevice adds a phone. Only the hash of its key is kept, so the key can be shown once and never again.
func (m *Manager) RegisterNotificationDevice(deviceID, apiKey string, packageFilter []string) (*NotificationDevice, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, nil
	}
	pfJSON, _ := json.Marshal(packageFilter)
	if packageFilter == nil {
		pfJSON = []byte("[]")
	}
	res, err := m.db.Exec(`
		INSERT INTO notification_devices (device_id, api_key_hash, api_key_plain, package_filter, status)
		VALUES ($1, $2, '', $3::jsonb, 'active')
		ON CONFLICT (device_id) DO NOTHING
	`, deviceID, hashDeviceKey(apiKey), string(pfJSON))
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotificationDeviceExists
	}
	return m.notificationDeviceByName(deviceID)
}

// RotateNotificationDeviceKey gives a phone a new key; the old one stops working at once.
func (m *Manager) RotateNotificationDeviceKey(deviceID, apiKey string) (*NotificationDevice, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, nil
	}
	res, err := m.db.Exec(`UPDATE notification_devices SET api_key_hash = $2, api_key_plain = '', updated_at = NOW() WHERE device_id = $1`, deviceID, hashDeviceKey(apiKey))
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotificationDeviceNotFound
	}
	return m.notificationDeviceByName(deviceID)
}

func (m *Manager) notificationDeviceByName(deviceID string) (*NotificationDevice, error) {
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
	if d.PackageFilter == nil {
		d.PackageFilter = []string{}
	}
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
		FROM notification_devices WHERE api_key_hash = $1
	`, hashDeviceKey(apiKey)).Scan(&d.ID, &d.DeviceID, &pfJSON, &d.Status, &d.CreatedAt, &d.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(pfJSON), &d.PackageFilter)
	return &d, nil
}

// TouchNotificationDevice records that the phone reached the panel with its key, whatever it sent
func (m *Manager) TouchNotificationDevice(id int64) {
	if !m.IsConnected() || m.db == nil {
		return
	}
	_, _ = m.db.Exec(`UPDATE notification_devices SET last_ping_at = NOW() WHERE id = $1`, id)
}

// ErrNotificationDeviceNotFound is an update of a device that was never registered, or was deleted
var ErrNotificationDeviceNotFound = errors.New("the notification device is not registered")

// UpdateNotificationDevice changes the status and the package filter of a device. An empty status leaves the status as it is;
// a nil filter leaves the filter as it is, and an empty one clears it, which means every package.
func (m *Manager) UpdateNotificationDevice(deviceID, status string, packageFilter *[]string) (*NotificationDevice, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, nil
	}
	var filterJSON any
	if packageFilter != nil {
		raw, _ := json.Marshal(*packageFilter)
		filterJSON = string(raw)
	}
	res, err := m.db.Exec(`
		UPDATE notification_devices
		SET status = CASE WHEN $2 <> '' THEN $2 ELSE status END,
			package_filter = CASE WHEN $3::text IS NOT NULL THEN $3::jsonb ELSE package_filter END,
			updated_at = NOW()
		WHERE device_id = $1
	`, deviceID, status, filterJSON)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotificationDeviceNotFound
	}

	var d NotificationDevice
	var pfJSON string
	err = m.db.QueryRow(`
		SELECT id, device_id, package_filter, status, created_at, updated_at
		FROM notification_devices WHERE device_id = $1
	`, deviceID).Scan(&d.ID, &d.DeviceID, &pfJSON, &d.Status, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(pfJSON), &d.PackageFilter)
	if d.PackageFilter == nil {
		d.PackageFilter = []string{}
	}
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
