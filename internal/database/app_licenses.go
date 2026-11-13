package database

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
)

// AppLicense represents a managed license and subscription for a Reneo catalog application.
type AppLicense struct {
	ID          int64           `json:"id"`
	UserID      int64           `json:"userId"`
	CatalogID   string          `json:"catalogId"`
	AppName     string          `json:"appName"`
	LicenseKey  string          `json:"licenseKey"`
	Status      string          `json:"status"` // "ACTIVE" | "TRIAL" | "EXPIRED"
	PlanName    string          `json:"planName"`
	Period      string          `json:"period"` // "monthly" | "quarterly" | "annual" | "trial"
	PriceAmount int64           `json:"priceAmount"`
	StartedAt   string          `json:"startedAt"`
	ExpiresAt   string          `json:"expiresAt"`
	DaysLeft    int             `json:"daysLeft"`
	IsExpired   bool            `json:"isExpired"`
	Features    json.RawMessage `json:"features"`
	CreatedAt   string          `json:"createdAt"`
	UpdatedAt   string          `json:"updatedAt"`
}

const appLicenseCols = `id, user_id, catalog_id, app_name, license_key, status, plan_name, period, price_amount, started_at, expires_at, features, created_at, updated_at`

func generateLicenseKey(catalogID string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	hexStr := strings.ToUpper(hex.EncodeToString(b))
	prefix := "RN"
	if strings.HasPrefix(strings.ToLower(catalogID), "reneo-") {
		clean := strings.ToUpper(strings.TrimPrefix(catalogID, "reneo-"))
		prefix = "RN-" + clean
	} else {
		prefix = "RN-" + strings.ToUpper(catalogID)
	}
	if len(prefix) > 8 {
		prefix = prefix[:8]
	}
	return fmt.Sprintf("%s-%s-%s", prefix, hexStr[:4], hexStr[4:8])
}

func scanAppLicense(row interface{ Scan(dest ...any) error }) (*AppLicense, error) {
	var item AppLicense
	var startedAt, expiresAt, createdAt, updatedAt time.Time
	var featuresBytes []byte

	err := row.Scan(
		&item.ID, &item.UserID, &item.CatalogID, &item.AppName, &item.LicenseKey,
		&item.Status, &item.PlanName, &item.Period, &item.PriceAmount,
		&startedAt, &expiresAt, &featuresBytes, &createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}

	item.StartedAt = startedAt.UTC().Format(time.RFC3339)
	item.ExpiresAt = expiresAt.UTC().Format(time.RFC3339)
	item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	item.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)

	if len(featuresBytes) > 0 {
		item.Features = json.RawMessage(featuresBytes)
	} else {
		item.Features = json.RawMessage(`{}`)
	}

	now := time.Now()
	if now.After(expiresAt) {
		item.IsExpired = true
		item.DaysLeft = 0
		if item.Status == "ACTIVE" {
			item.Status = "EXPIRED"
		}
	} else {
		item.IsExpired = false
		days := int(math.Ceil(expiresAt.Sub(now).Hours() / 24.0))
		if days < 0 {
			days = 0
		}
		item.DaysLeft = days
	}

	return &item, nil
}

// EnsureDefaultLicenses seeds active licenses if none exist for a user.
func (m *Manager) EnsureDefaultLicenses(userID int64) error {
	if m == nil || !m.IsConnected() {
		return nil
	}

	// Check if reneo-crm license exists
	var count int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM app_licenses WHERE user_id = $1 AND catalog_id = 'reneo-crm'`, userID).Scan(&count)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	if count == 0 {
		now := time.Now()
		expiresAt := now.AddDate(0, 1, 0) // 1 month initial active license
		key := generateLicenseKey("reneo-crm")
		featuresJSON := `{"unlimitedBroadcast":true,"birthdayBot":true,"liveChat":true,"maxContacts":10000,"wahaSync":true}`

		_, err = m.db.Exec(`
			INSERT INTO app_licenses (user_id, catalog_id, app_name, license_key, status, plan_name, period, price_amount, started_at, expires_at, features)
			VALUES ($1, 'reneo-crm', 'Reneo CRM Services', $2, 'ACTIVE', 'Bulanan (Pro)', 'monthly', 99000, $3, $4, $5::jsonb)
			ON CONFLICT (user_id, catalog_id) DO NOTHING
		`, userID, key, now, expiresAt, featuresJSON)
		if err != nil {
			return err
		}
	}

	return nil
}

// ListAppLicenses returns all managed app licenses for a user.
func (m *Manager) ListAppLicenses(userID int64) ([]AppLicense, error) {
	if m == nil || !m.IsConnected() {
		return []AppLicense{}, nil
	}

	_ = m.EnsureDefaultLicenses(userID)

	rows, err := m.db.Query(
		`SELECT `+appLicenseCols+` FROM app_licenses WHERE user_id = $1 ORDER BY id ASC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AppLicense, 0)
	for rows.Next() {
		item, err := scanAppLicense(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

// GetAppLicense retrieves a license for a specific catalog app.
func (m *Manager) GetAppLicense(userID int64, catalogID string) (*AppLicense, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}

	_ = m.EnsureDefaultLicenses(userID)

	row := m.db.QueryRow(
		`SELECT `+appLicenseCols+` FROM app_licenses WHERE user_id = $1 AND catalog_id = $2`,
		userID, catalogID,
	)
	item, err := scanAppLicense(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

// RenewAppLicense extends the subscription period for an app license.
func (m *Manager) RenewAppLicense(userID int64, catalogID string, months int, planName string, period string, priceAmount int64) (*AppLicense, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}

	existing, err := m.GetAppLicense(userID, catalogID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	var newExpiresAt time.Time

	if existing == nil {
		// Create new license
		newExpiresAt = now.AddDate(0, months, 0)
		key := generateLicenseKey(catalogID)
		if planName == "" {
			planName = "Bulanan (Pro)"
		}
		if period == "" {
			period = "monthly"
		}
		if priceAmount <= 0 {
			priceAmount = 99000
		}
		featuresJSON := `{"unlimitedBroadcast":true,"birthdayBot":true,"liveChat":true,"maxContacts":10000,"wahaSync":true}`

		_, err = m.db.Exec(`
			INSERT INTO app_licenses (user_id, catalog_id, app_name, license_key, status, plan_name, period, price_amount, started_at, expires_at, features)
			VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, $8, $9, $10::jsonb)
		`, userID, catalogID, catalogID, key, planName, period, priceAmount, now, newExpiresAt, featuresJSON)
		if err != nil {
			return nil, err
		}
		return m.GetAppLicense(userID, catalogID)
	}

	// Calculate new expiry date based on existing status
	curExpiry, err := time.Parse(time.RFC3339, existing.ExpiresAt)
	if err != nil || curExpiry.Before(now) {
		newExpiresAt = now.AddDate(0, months, 0)
	} else {
		newExpiresAt = curExpiry.AddDate(0, months, 0)
	}

	if planName == "" {
		planName = existing.PlanName
	}
	if period == "" {
		period = existing.Period
	}
	if priceAmount <= 0 {
		priceAmount = existing.PriceAmount
	}

	_, err = m.db.Exec(`
		UPDATE app_licenses
		SET status = 'ACTIVE',
		    plan_name = $1,
		    period = $2,
		    price_amount = $3,
		    expires_at = $4,
		    updated_at = NOW()
		WHERE user_id = $5 AND catalog_id = $6
	`, planName, period, priceAmount, newExpiresAt, userID, catalogID)
	if err != nil {
		return nil, err
	}

	return m.GetAppLicense(userID, catalogID)
}
