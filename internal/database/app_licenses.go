package database

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strings"
	"time"
)

// ErrActiveLicenseExists is returned when creating or activating a second active license for the same app.
var ErrActiveLicenseExists = errors.New("aplikasi ini sudah memiliki 1 sesi lisensi aktif; hanya 1 lisensi aktif yang diizinkan per aplikasi")

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

// AppLicensePlan represents an available pricing tier / package for an application.
type AppLicensePlan struct {
	ID          int64           `json:"id"`
	CatalogID   string          `json:"catalogId"`
	Slug        string          `json:"slug"`
	Name        string          `json:"name"`
	Tagline     string          `json:"tagline"`
	Period      string          `json:"period"` // "monthly", "quarterly", "annual", "trial"
	Months      int             `json:"months"`
	TrialDays   int             `json:"trialDays"`
	PriceAmount int64           `json:"priceAmount"`
	Features    json.RawMessage `json:"features"`
	Highlighted bool            `json:"highlighted"`
	IsActive    bool            `json:"isActive"`
	SortOrder   int             `json:"sortOrder"`
	CreatedAt   string          `json:"createdAt"`
	UpdatedAt   string          `json:"updatedAt"`
}

// AppLicenseOrder represents an order / invoice issued for an application license subscription.
type AppLicenseOrder struct {
	ID            int64      `json:"id"`
	PublicID      string     `json:"publicId"`
	InvoiceNumber string     `json:"invoiceNumber"`
	UserID        int64      `json:"userId"`
	CatalogID     string     `json:"catalogId"`
	AppName       string     `json:"appName"`
	PlanSlug      string     `json:"planSlug"`
	PlanName      string     `json:"planName"`
	Period        string     `json:"period"`
	Months        int        `json:"months"`
	AmountList    int64      `json:"amountList"`
	UniqueCode    int        `json:"uniqueCode"`
	AmountTotal   int64      `json:"amountTotal"`
	Status        string     `json:"status"` // "pending" | "paid" | "cancelled"
	PaymentMethod string     `json:"paymentMethod"`
	BuyerName     string     `json:"buyerName"`
	BuyerEmail    string     `json:"buyerEmail"`
	BuyerPhone    string     `json:"buyerPhone"`
	CreatedAt     time.Time  `json:"createdAt"`
	ExpiresAt     time.Time  `json:"expiresAt"`
	PaidAt        *time.Time `json:"paidAt"`
	CreatedIP     string     `json:"-"`
}

const appLicenseCols = `id, user_id, catalog_id, app_name, license_key, status, plan_name, period, price_amount, started_at, expires_at, features, created_at, updated_at`
const appLicensePlanCols = `id, catalog_id, slug, name, tagline, period, months, price_amount, features, highlighted, is_active, sort_order, created_at, updated_at`
const appLicenseOrderCols = `id, public_id, invoice_number, user_id, catalog_id, app_name, plan_slug, plan_name, period, months, amount_list, unique_code, amount_total, status, payment_method, buyer_name, buyer_email, buyer_phone, created_at, expires_at, paid_at, created_ip`

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

func generateAppPublicID() string {
	raw := make([]byte, 12)
	_, _ = rand.Read(raw)
	return hex.EncodeToString(raw)
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

func scanAppLicensePlan(row interface{ Scan(dest ...any) error }) (*AppLicensePlan, error) {
	var p AppLicensePlan
	var featuresBytes []byte
	var createdAt, updatedAt time.Time

	err := row.Scan(
		&p.ID, &p.CatalogID, &p.Slug, &p.Name, &p.Tagline, &p.Period, &p.Months,
		&p.PriceAmount, &featuresBytes, &p.Highlighted, &p.IsActive, &p.SortOrder,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return nil, err
	}

	p.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	p.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	if !strings.EqualFold(p.Period, "trial") {
		p.TrialDays = 7
	}

	if len(featuresBytes) > 0 {
		p.Features = json.RawMessage(featuresBytes)
	} else {
		p.Features = json.RawMessage(`{}`)
	}

	return &p, nil
}

func scanAppLicenseOrder(row interface{ Scan(dest ...any) error }) (*AppLicenseOrder, error) {
	var o AppLicenseOrder
	var paidAt sql.NullTime

	err := row.Scan(
		&o.ID, &o.PublicID, &o.InvoiceNumber, &o.UserID, &o.CatalogID, &o.AppName,
		&o.PlanSlug, &o.PlanName, &o.Period, &o.Months, &o.AmountList, &o.UniqueCode,
		&o.AmountTotal, &o.Status, &o.PaymentMethod, &o.BuyerName, &o.BuyerEmail, &o.BuyerPhone,
		&o.CreatedAt, &o.ExpiresAt, &paidAt, &o.CreatedIP,
	)
	if err != nil {
		return nil, err
	}

	if paidAt.Valid {
		o.PaidAt = &paidAt.Time
	}

	return &o, nil
}

// EnsureDefaultLicenses seeds active licenses if none exist for a user.
func (m *Manager) EnsureDefaultLicenses(userID int64) error {
	if m == nil || !m.IsConnected() {
		return nil
	}

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
			ON CONFLICT (license_key) DO NOTHING
		`, userID, key, now, expiresAt, featuresJSON)
		if err != nil {
			return err
		}
	}

	return nil
}

// EnsureDefaultAppLicensePlans seeds the available pricing packages for catalog apps (e.g. reneo-crm).
func (m *Manager) EnsureDefaultAppLicensePlans(catalogID string) error {
	if m == nil || !m.IsConnected() {
		return nil
	}

	// Purge any accidental non-reneo-crm plans or licenses from testing
	_, _ = m.db.Exec(`DELETE FROM app_license_plans WHERE catalog_id != 'reneo-crm'`)
	_, _ = m.db.Exec(`DELETE FROM app_licenses WHERE catalog_id != 'reneo-crm'`)
	_, _ = m.db.Exec(`DELETE FROM app_license_orders WHERE catalog_id != 'reneo-crm'`)

	if catalogID != "reneo-crm" {
		return nil
	}

	var count int
	_ = m.db.QueryRow(`SELECT COUNT(*) FROM app_license_plans WHERE catalog_id = 'reneo-crm'`).Scan(&count)
	if count > 0 {
		return nil
	}

	defaultPlans := []struct {
		slug        string
		name        string
		tagline     string
		period      string
		months      int
		price       int64
		highlighted bool
		sortOrder   int
		features    string
	}{
		{
			slug:        "starter-monthly",
			name:        "Starter Bulanan",
			tagline:     "Cocok untuk UMKM pemula yang mulai mengelola kontak & broadcast WhatsApp.",
			period:      "monthly",
			months:      1,
			price:       49000,
			highlighted: false,
			sortOrder:   1,
			features:    `{"unlimitedBroadcast":false,"maxContacts":1000,"birthdayBot":true,"liveChat":false,"multiSession":false,"maxSessions":1,"multiAgent":false,"maxAgents":1,"wahaSync":true,"supportPriority":"standard"}`,
		},
		{
			slug:        "pro-monthly",
			name:        "Pro Bulanan",
			tagline:     "Fitur komprehensif lengkap: broadcast tanpa batas, bot ultah, multi-sesi, dan Live Chat CRM.",
			period:      "monthly",
			months:      1,
			price:       99000,
			highlighted: true,
			sortOrder:   2,
			features:    `{"unlimitedBroadcast":true,"maxContacts":10000,"birthdayBot":true,"liveChat":true,"multiSession":true,"maxSessions":5,"multiAgent":true,"maxAgents":5,"wahaSync":true,"supportPriority":"fast"}`,
		},
		{
			slug:        "enterprise-annual",
			name:        "Enterprise Tahunan",
			tagline:     "Paket tahunan hemat 17%: kapasitas kontak masif, multi-sesi hingga 25 akun, & support prioritas.",
			period:      "annual",
			months:      12,
			price:       990000,
			highlighted: false,
			sortOrder:   3,
			features:    `{"unlimitedBroadcast":true,"maxContacts":50000,"birthdayBot":true,"liveChat":true,"multiSession":true,"maxSessions":25,"multiAgent":true,"maxAgents":25,"wahaSync":true,"supportPriority":"vip"}`,
		},
	}

	for _, p := range defaultPlans {
		_, _ = m.db.Exec(`
			INSERT INTO app_license_plans (catalog_id, slug, name, tagline, period, months, price_amount, features, highlighted, is_active, sort_order)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, true, $10)
			ON CONFLICT (catalog_id, slug) DO NOTHING
		`, catalogID, p.slug, p.name, p.tagline, p.period, p.months, p.price, p.features, p.highlighted, p.sortOrder)
	}

	return nil
}

// ListAppLicensePlans returns active pricing packages for an app.
func (m *Manager) ListAppLicensePlans(catalogID string) ([]AppLicensePlan, error) {
	if m == nil || !m.IsConnected() {
		// Mock default plans if DB is not connected
		return []AppLicensePlan{
			{
				ID: 1, CatalogID: catalogID, Slug: "starter-monthly", Name: "Starter Bulanan",
				Tagline: "Cocok untuk UMKM pemula", Period: "monthly", Months: 1, TrialDays: 7, PriceAmount: 49000,
				Features: json.RawMessage(`{"unlimitedBroadcast":false,"maxContacts":1000,"birthdayBot":true,"liveChat":false,"multiSession":false,"maxSessions":1,"multiAgent":false,"maxAgents":1,"wahaSync":true}`),
				Highlighted: false, IsActive: true, SortOrder: 1,
			},
			{
				ID: 2, CatalogID: catalogID, Slug: "pro-monthly", Name: "Pro Bulanan",
				Tagline: "Fitur komprehensif lengkap", Period: "monthly", Months: 1, TrialDays: 7, PriceAmount: 99000,
				Features: json.RawMessage(`{"unlimitedBroadcast":true,"maxContacts":10000,"birthdayBot":true,"liveChat":true,"multiSession":true,"maxSessions":5,"multiAgent":true,"maxAgents":5,"wahaSync":true}`),
				Highlighted: true, IsActive: true, SortOrder: 2,
			},
			{
				ID: 3, CatalogID: catalogID, Slug: "enterprise-annual", Name: "Enterprise Tahunan",
				Tagline: "Paket tahunan hemat 17%", Period: "annual", Months: 12, TrialDays: 7, PriceAmount: 990000,
				Features: json.RawMessage(`{"unlimitedBroadcast":true,"maxContacts":50000,"birthdayBot":true,"liveChat":true,"multiSession":true,"maxSessions":25,"multiAgent":true,"maxAgents":25,"wahaSync":true}`),
				Highlighted: false, IsActive: true, SortOrder: 3,
			},
		}, nil
	}

	_ = m.EnsureDefaultAppLicensePlans(catalogID)

	rows, err := m.db.Query(`
		SELECT `+appLicensePlanCols+`
		FROM app_license_plans
		WHERE catalog_id = $1 AND is_active = true
		ORDER BY sort_order ASC, id ASC
	`, catalogID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AppLicensePlan, 0)
	for rows.Next() {
		p, err := scanAppLicensePlan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// GetAppLicensePlan retrieves a specific plan by catalog ID and slug.
func (m *Manager) GetAppLicensePlan(catalogID, slug string) (*AppLicensePlan, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}

	_ = m.EnsureDefaultAppLicensePlans(catalogID)

	row := m.db.QueryRow(`
		SELECT `+appLicensePlanCols+`
		FROM app_license_plans
		WHERE catalog_id = $1 AND slug = $2
	`, catalogID, slug)
	p, err := scanAppLicensePlan(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return p, err
}

// ListAppLicenses returns all managed app licenses for a user, optionally filtered by catalogID.
func (m *Manager) ListAppLicenses(userID int64, catalogID string) ([]AppLicense, error) {
	if m == nil || !m.IsConnected() {
		return []AppLicense{}, nil
	}

	query := `SELECT ` + appLicenseCols + ` FROM app_licenses WHERE user_id = $1`
	args := []any{userID}
	if catalogID != "" {
		query += ` AND catalog_id = $2`
		args = append(args, catalogID)
	}
	query += ` ORDER BY id DESC`

	rows, err := m.db.Query(query, args...)
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

// GetAppLicense retrieves the latest license for a specific catalog app.
func (m *Manager) GetAppLicense(userID int64, catalogID string) (*AppLicense, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}

	row := m.db.QueryRow(
		`SELECT `+appLicenseCols+` FROM app_licenses WHERE user_id = $1 AND catalog_id = $2 ORDER BY id DESC LIMIT 1`,
		userID, catalogID,
	)
	item, err := scanAppLicense(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

// GetAppLicenseByID retrieves a license by its primary key ID.
func (m *Manager) GetAppLicenseByID(id int64) (*AppLicense, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}
	row := m.db.QueryRow(`SELECT `+appLicenseCols+` FROM app_licenses WHERE id = $1`, id)
	item, err := scanAppLicense(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

// GetAppLicenseByKey retrieves a license by its unique license_key.
func (m *Manager) GetAppLicenseByKey(licenseKey string) (*AppLicense, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}
	row := m.db.QueryRow(`SELECT `+appLicenseCols+` FROM app_licenses WHERE license_key = $1`, licenseKey)
	item, err := scanAppLicense(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

func (m *Manager) hasOtherActiveLicense(userID int64, catalogID string, excludeID int64) (bool, error) {
	if m == nil || !m.IsConnected() {
		return false, nil
	}
	var count int
	err := m.db.QueryRow(`
		SELECT COUNT(*)
		FROM app_licenses
		WHERE user_id = $1
		  AND catalog_id = $2
		  AND id <> $3
		  AND UPPER(status) IN ('ACTIVE', 'TRIAL')
		  AND expires_at > NOW()
	`, userID, catalogID, excludeID).Scan(&count)
	return count > 0, err
}

// CreateAppLicense creates a brand new license for any application.
func (m *Manager) CreateAppLicense(item AppLicense) (*AppLicense, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}
	if item.CatalogID == "" {
		return nil, errors.New("catalogId is required")
	}
	if item.AppName == "" {
		item.AppName = item.CatalogID
	}
	if item.LicenseKey == "" {
		item.LicenseKey = generateLicenseKey(item.CatalogID)
	}
	if item.Status == "" {
		item.Status = "ACTIVE"
	}
	if item.PlanName == "" {
		item.PlanName = "Kustom"
	}
	if item.Period == "" {
		item.Period = "monthly"
	}

	if strings.EqualFold(item.Status, "ACTIVE") || strings.EqualFold(item.Status, "TRIAL") {
		if exists, err := m.hasOtherActiveLicense(item.UserID, item.CatalogID, 0); err == nil && exists {
			return nil, ErrActiveLicenseExists
		}
	}

	now := time.Now()
	var expiresAt time.Time
	if item.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, item.ExpiresAt)
		if err == nil {
			expiresAt = t
		} else {
			expiresAt = now.AddDate(0, 1, 0)
		}
	} else {
		expiresAt = now.AddDate(0, 1, 0)
	}

	startedAt := now
	if item.StartedAt != "" {
		t, err := time.Parse(time.RFC3339, item.StartedAt)
		if err == nil {
			startedAt = t
		}
	}

	featJSON := string(item.Features)
	if featJSON == "" || featJSON == "null" {
		featJSON = "{}"
	}

	var id int64
	err := m.db.QueryRow(`
		INSERT INTO app_licenses (user_id, catalog_id, app_name, license_key, status, plan_name, period, price_amount, started_at, expires_at, features)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
		RETURNING id
	`, item.UserID, item.CatalogID, item.AppName, item.LicenseKey, item.Status, item.PlanName, item.Period, item.PriceAmount, startedAt, expiresAt, featJSON).Scan(&id)
	if err != nil {
		return nil, err
	}

	return m.GetAppLicenseByID(id)
}

// UpdateAppLicense modifies an existing license.
func (m *Manager) UpdateAppLicense(id int64, userID int64, isAdmin bool, item AppLicense) (*AppLicense, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}

	if strings.EqualFold(item.Status, "ACTIVE") || strings.EqualFold(item.Status, "TRIAL") {
		existing, err := m.GetAppLicenseByID(id)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			if exists, err := m.hasOtherActiveLicense(existing.UserID, existing.CatalogID, id); err == nil && exists {
				return nil, ErrActiveLicenseExists
			}
		}
	}

	var expiresAt time.Time
	if item.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, item.ExpiresAt)
		if err == nil {
			expiresAt = t
		}
	}

	featJSON := string(item.Features)
	if featJSON == "" || featJSON == "null" {
		featJSON = "{}"
	}

	query := `
		UPDATE app_licenses
		SET app_name = COALESCE(NULLIF($1, ''), app_name),
		    status = COALESCE(NULLIF($2, ''), status),
		    plan_name = COALESCE(NULLIF($3, ''), plan_name),
		    period = COALESCE(NULLIF($4, ''), period),
		    price_amount = CASE WHEN $5 >= 0 THEN $5 ELSE price_amount END,
		    features = $6::jsonb,
		    updated_at = NOW()
	`
	args := []any{item.AppName, item.Status, item.PlanName, item.Period, item.PriceAmount, featJSON}

	if !expiresAt.IsZero() {
		if isAdmin {
			query += `, expires_at = $7 WHERE id = $8`
			args = append(args, expiresAt, id)
		} else {
			query += `, expires_at = $7 WHERE id = $8 AND user_id = $9`
			args = append(args, expiresAt, id, userID)
		}
	} else {
		if isAdmin {
			query += ` WHERE id = $7`
			args = append(args, id)
		} else {
			query += ` WHERE id = $7 AND user_id = $8`
			args = append(args, id, userID)
		}
	}

	res, err := m.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return nil, errors.New("license not found or unauthorized")
	}

	return m.GetAppLicenseByID(id)
}

// DeleteAppLicense removes a license permanently.
func (m *Manager) DeleteAppLicense(id int64, userID int64, isAdmin bool) error {
	if m == nil || !m.IsConnected() {
		return errors.New("database not connected")
	}
	var res sql.Result
	var err error
	if isAdmin {
		res, err = m.db.Exec(`DELETE FROM app_licenses WHERE id = $1`, id)
	} else {
		res, err = m.db.Exec(`DELETE FROM app_licenses WHERE id = $1 AND user_id = $2`, id, userID)
	}
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("license not found or unauthorized")
	}
	return nil
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
		WHERE id = $5
	`, planName, period, priceAmount, newExpiresAt, existing.ID)
	if err != nil {
		return nil, err
	}

	return m.GetAppLicenseByID(existing.ID)
}

// CreateAppLicensePlan creates or updates an app license plan.
func (m *Manager) CreateAppLicensePlan(p AppLicensePlan) (*AppLicensePlan, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}
	if p.CatalogID == "" {
		return nil, errors.New("catalogId is required")
	}
	if p.Slug == "" {
		p.Slug = strings.ToLower(strings.ReplaceAll(p.Name, " ", "-"))
	}
	if p.Months <= 0 {
		p.Months = 1
	}
	featJSON := string(p.Features)
	if featJSON == "" || featJSON == "null" {
		featJSON = "{}"
	}
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO app_license_plans (catalog_id, slug, name, tagline, period, months, price_amount, features, highlighted, is_active, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
		ON CONFLICT (catalog_id, slug) DO UPDATE
		SET name = EXCLUDED.name,
		    tagline = EXCLUDED.tagline,
		    period = EXCLUDED.period,
		    months = EXCLUDED.months,
		    price_amount = EXCLUDED.price_amount,
		    features = EXCLUDED.features,
		    highlighted = EXCLUDED.highlighted,
		    is_active = EXCLUDED.is_active,
		    updated_at = NOW()
		RETURNING id
	`, p.CatalogID, p.Slug, p.Name, p.Tagline, p.Period, p.Months, p.PriceAmount, featJSON, p.Highlighted, p.IsActive, p.SortOrder).Scan(&id)
	if err != nil {
		return nil, err
	}
	row := m.db.QueryRow(`SELECT `+appLicensePlanCols+` FROM app_license_plans WHERE id = $1`, id)
	return scanAppLicensePlan(row)
}

// UpdateAppLicensePlan updates an existing pricing plan by ID.
func (m *Manager) UpdateAppLicensePlan(id int64, p AppLicensePlan) (*AppLicensePlan, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}
	if p.Months <= 0 {
		p.Months = 1
	}
	featJSON := string(p.Features)
	if featJSON == "" || featJSON == "null" {
		featJSON = "{}"
	}
	res, err := m.db.Exec(`
		UPDATE app_license_plans
		SET name = COALESCE(NULLIF($1, ''), name),
		    tagline = $2,
		    period = COALESCE(NULLIF($3, ''), period),
		    months = $4,
		    price_amount = CASE WHEN $5 >= 0 THEN $5 ELSE price_amount END,
		    features = $6::jsonb,
		    highlighted = $7,
		    is_active = $8,
		    updated_at = NOW()
		WHERE id = $9
	`, p.Name, p.Tagline, p.Period, p.Months, p.PriceAmount, featJSON, p.Highlighted, p.IsActive, id)
	if err != nil {
		return nil, err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return nil, errors.New("plan not found")
	}
	row := m.db.QueryRow(`SELECT `+appLicensePlanCols+` FROM app_license_plans WHERE id = $1`, id)
	return scanAppLicensePlan(row)
}

// DeleteAppLicensePlan deletes a pricing plan by ID.
func (m *Manager) DeleteAppLicensePlan(id int64) error {
	if m == nil || !m.IsConnected() {
		return errors.New("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM app_license_plans WHERE id = $1`, id)
	return err
}

// ListDistinctAppCatalogIDs returns a slice of all distinct catalog IDs with licenses or plans.
func (m *Manager) ListDistinctAppCatalogIDs() ([]string, error) {
	return []string{"reneo-crm"}, nil
}

// CreateAppLicenseOrder creates an order and issues an invoice with unique payment code.
func (m *Manager) CreateAppLicenseOrder(o AppLicenseOrder) (*AppLicenseOrder, error) {
	if m == nil || !m.IsConnected() {
		// Mock response if DB is not connected
		now := time.Now()
		o.ID = 1
		o.PublicID = generateAppPublicID()
		o.InvoiceNumber = fmt.Sprintf("INV-CRM-%s-%04d", now.Format("200601"), 1)
		o.CreatedAt = now
		o.ExpiresAt = now.Add(24 * time.Hour)
		o.UniqueCode = 123
		o.AmountTotal = o.AmountList + int64(o.UniqueCode)
		o.Status = "pending"
		return &o, nil
	}

	publicID := generateAppPublicID()

	// Pick a unique 3-digit code (e.g. 100-999) to make the total uniquely identifiable
	codeBig, _ := rand.Int(rand.Reader, big.NewInt(899))
	uniqueCode := int(codeBig.Int64()) + 100
	amountTotal := o.AmountList + int64(uniqueCode)

	now := time.Now()
	expiresAt := now.Add(24 * time.Hour) // 24 hours payment deadline

	var nextID int64
	err := m.db.QueryRow(`SELECT COALESCE(MAX(id), 0) + 1 FROM app_license_orders`).Scan(&nextID)
	if err != nil {
		nextID = 1
	}

	invoiceNum := fmt.Sprintf("INV-%s-%s-%05d", strings.ToUpper(strings.TrimPrefix(o.CatalogID, "reneo-")), now.Format("200601"), nextID)

	var id int64
	err = m.db.QueryRow(`
		INSERT INTO app_license_orders (
			public_id, invoice_number, user_id, catalog_id, app_name, plan_slug, plan_name,
			period, months, amount_list, unique_code, amount_total, status, payment_method,
			buyer_name, buyer_email, buyer_phone, created_at, expires_at, created_ip
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, $14, $15, $16, $17, $18, $19
		) RETURNING id
	`, publicID, invoiceNum, o.UserID, o.CatalogID, o.AppName, o.PlanSlug, o.PlanName,
		o.Period, o.Months, o.AmountList, uniqueCode, amountTotal, o.PaymentMethod,
		o.BuyerName, o.BuyerEmail, o.BuyerPhone, now, expiresAt, o.CreatedIP).Scan(&id)

	if err != nil {
		return nil, err
	}

	return m.GetAppLicenseOrderByPublicID(publicID)
}

// GetAppLicenseOrderByPublicID retrieves an order by its unique publicId.
func (m *Manager) GetAppLicenseOrderByPublicID(publicID string) (*AppLicenseOrder, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}

	row := m.db.QueryRow(`
		SELECT `+appLicenseOrderCols+`
		FROM app_license_orders
		WHERE public_id = $1
	`, publicID)

	o, err := scanAppLicenseOrder(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return o, err
}

// ListAppLicenseOrders lists license orders for a user.
func (m *Manager) ListAppLicenseOrders(userID int64, catalogID string) ([]AppLicenseOrder, error) {
	if m == nil || !m.IsConnected() {
		return []AppLicenseOrder{}, nil
	}

	query := `SELECT ` + appLicenseOrderCols + ` FROM app_license_orders WHERE user_id = $1`
	args := []any{userID}

	if catalogID != "" {
		query += ` AND catalog_id = $2`
		args = append(args, catalogID)
	}

	query += ` ORDER BY id DESC LIMIT 50`

	rows, err := m.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]AppLicenseOrder, 0)
	for rows.Next() {
		o, err := scanAppLicenseOrder(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, rows.Err()
}

// MarkAppLicenseOrderPaid marks an order as paid and immediately extends/activates the app license.
func (m *Manager) MarkAppLicenseOrderPaid(publicID string, paymentMethod string) (*AppLicenseOrder, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}

	order, err := m.GetAppLicenseOrderByPublicID(publicID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, errors.New("order not found")
	}

	now := time.Now()
	_, err = m.db.Exec(`
		UPDATE app_license_orders
		SET status = 'paid',
		    paid_at = $1,
		    payment_method = COALESCE(NULLIF($2, ''), payment_method)
		WHERE public_id = $3
	`, now, paymentMethod, publicID)
	if err != nil {
		return nil, err
	}

	// Now renew / extend the actual license
	_, err = m.RenewAppLicense(order.UserID, order.CatalogID, order.Months, order.PlanName, order.Period, order.AmountList)
	if err != nil {
		return nil, fmt.Errorf("order marked paid but failed to renew license: %w", err)
	}

	return m.GetAppLicenseOrderByPublicID(publicID)
}

// CancelAppLicenseOrder cancels a pending license order.
func (m *Manager) CancelAppLicenseOrder(publicID string, userID int64, isAdmin bool) (*AppLicenseOrder, error) {
	if m == nil || !m.IsConnected() {
		return nil, errors.New("database not connected")
	}

	order, err := m.GetAppLicenseOrderByPublicID(publicID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, errors.New("order not found")
	}
	if !isAdmin && order.UserID != userID {
		return nil, errors.New("unauthorized")
	}
	if order.Status != "pending" {
		return nil, fmt.Errorf("order cannot be cancelled because status is %s", order.Status)
	}

	res, err := m.db.Exec(`
		UPDATE app_license_orders
		SET status = 'cancelled'
		WHERE public_id = $1 AND status = 'pending'
	`, publicID)
	if err != nil {
		return nil, err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return nil, errors.New("order not found or not pending")
	}

	return m.GetAppLicenseOrderByPublicID(publicID)
}
