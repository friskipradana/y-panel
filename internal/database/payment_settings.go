package database

import "database/sql"

// ─── Payment Settings ───────────────────────────────────────────────────────

// PaymentSetting represents a single payment configuration key-value pair.
type PaymentSetting struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	IsSecret    bool   `json:"isSecret"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

// GetPaymentSettings returns all payment configuration entries.
func (m *Manager) GetPaymentSettings() ([]PaymentSetting, error) {
	if !m.IsConnected() || m.db == nil {
		return []PaymentSetting{}, nil
	}
	rows, err := m.db.Query(`
		SELECT key, value, is_secret, label, description
		FROM payment_settings ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []PaymentSetting
	for rows.Next() {
		var s PaymentSetting
		if err := rows.Scan(&s.Key, &s.Value, &s.IsSecret, &s.Label, &s.Description); err != nil {
			return nil, err
		}
		// Mask secret values for frontend display
		if s.IsSecret && s.Value != "" {
			s.Value = maskSecret(s.Value)
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

// GetPaymentSettingValue returns the raw (unmasked) value for a single key.
func (m *Manager) GetPaymentSettingValue(key string) (string, error) {
	if !m.IsConnected() || m.db == nil {
		return "", nil
	}
	var value string
	err := m.db.QueryRow(`SELECT value FROM payment_settings WHERE key = $1`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

// GetPaymentSettingsMap returns all payment settings as a key→raw value map.
func (m *Manager) GetPaymentSettingsMap() (map[string]string, error) {
	if !m.IsConnected() || m.db == nil {
		return map[string]string{}, nil
	}
	rows, err := m.db.Query(`SELECT key, value FROM payment_settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		result[key] = value
	}
	return result, rows.Err()
}

// UpdatePaymentSetting upserts a single payment setting value.
func (m *Manager) UpdatePaymentSetting(key, value string) error {
	if !m.IsConnected() || m.db == nil {
		return nil
	}
	_, err := m.db.Exec(`
		UPDATE payment_settings SET value = $1, updated_at = NOW() WHERE key = $2
	`, value, key)
	return err
}

// UpdatePaymentSettingsBatch upserts multiple payment settings in a single transaction.
func (m *Manager) UpdatePaymentSettingsBatch(settings map[string]string) error {
	if !m.IsConnected() || m.db == nil {
		return nil
	}
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.Prepare(`UPDATE payment_settings SET value = $1, updated_at = NOW() WHERE key = $2`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for key, value := range settings {
		if _, err := stmt.Exec(value, key); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// maskSecret masks a secret value, showing only the last 4 characters.
func maskSecret(value string) string {
	if len(value) <= 4 {
		return "••••"
	}
	return "••••••••" + value[len(value)-4:]
}
