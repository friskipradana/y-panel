package database

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
)

const emailConfigKey = "email_server_config"

// EmailServerConfig stores the host-wide Email Server configuration (Cloudflare or IP Mail Server).
type EmailServerConfig struct {
	Enabled         bool   `json:"enabled"`
	Method          string `json:"method"` // "cloudflare" | "ip"
	Domain          string `json:"domain"`
	FromName        string `json:"fromName"`
	FromAddress     string `json:"fromAddress"`
	CFZoneID        string `json:"cfZoneId"`
	CFCatchAll      bool   `json:"cfCatchAll"`
	CFForwardTo     string `json:"cfForwardTo"`
	CFOutboundRelay string `json:"cfOutboundRelay"` // "smtp" | "worker"
	MailHostname    string `json:"mailHostname"`
	PublicIP        string `json:"publicIp"`
	SMTPHost        string `json:"smtpHost"`
	SMTPPort        int    `json:"smtpPort"`
	SubmissionPort  int    `json:"submissionPort"`
	SMTPSPort       int    `json:"smtpsPort"`
	IMAPPort        int    `json:"imapPort"`
	TLSMode         string `json:"tlsMode"` // "starttls" | "tls" | "none"
	SMTPUser        string `json:"smtpUser"`
	SMTPPasswordEnc string `json:"smtpPasswordEnc,omitempty"`
	SMTPPasswordSet bool   `json:"smtpPasswordSet"`
	DKIMSelector    string `json:"dkimSelector"`
	DKIMPublicKey   string `json:"dkimPublicKey"`
	UpdatedAt       string `json:"updatedAt"`
}

func DefaultEmailServerConfig() EmailServerConfig {
	return EmailServerConfig{
		Enabled:         false,
		Method:          "cloudflare",
		Domain:          "",
		FromName:        "Reneo Mail",
		FromAddress:     "",
		CFZoneID:        "",
		CFCatchAll:      false,
		CFForwardTo:     "",
		CFOutboundRelay: "smtp",
		MailHostname:    "",
		PublicIP:        "",
		SMTPHost:        "127.0.0.1",
		SMTPPort:        25,
		SubmissionPort:  587,
		SMTPSPort:       465,
		IMAPPort:        993,
		TLSMode:         "starttls",
		SMTPUser:        "",
		DKIMSelector:    "default",
		DKIMPublicKey:   "",
	}
}

func (m *Manager) GetEmailServerConfig() (EmailServerConfig, error) {
	cfg := DefaultEmailServerConfig()
	if !m.IsConnected() {
		return cfg, nil
	}
	raw, err := m.GetHostingState(emailConfigKey)
	if err != nil {
		return cfg, err
	}
	if strings.TrimSpace(raw) == "" {
		return cfg, nil
	}
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return DefaultEmailServerConfig(), nil
	}
	if cfg.Method != "cloudflare" && cfg.Method != "ip" {
		cfg.Method = "cloudflare"
	}
	if cfg.SMTPPort <= 0 {
		cfg.SMTPPort = 25
	}
	if cfg.SubmissionPort <= 0 {
		cfg.SubmissionPort = 587
	}
	if cfg.SMTPSPort <= 0 {
		cfg.SMTPSPort = 465
	}
	if cfg.IMAPPort <= 0 {
		cfg.IMAPPort = 993
	}
	if cfg.TLSMode == "" {
		cfg.TLSMode = "starttls"
	}
	if cfg.DKIMSelector == "" {
		cfg.DKIMSelector = "default"
	}
	cfg.SMTPPasswordSet = cfg.SMTPPasswordEnc != ""
	return cfg, nil
}

func (m *Manager) SaveEmailServerConfig(cfg EmailServerConfig) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	cfg.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	cfg.SMTPPasswordSet = cfg.SMTPPasswordEnc != ""
	payload, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	return m.SetHostingState(emailConfigKey, string(payload))
}

// EmailAccount represents a mailbox or forwarding address managed in Reneo.
type EmailAccount struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"userId"`
	Username    string    `json:"username"`
	LocalPart   string    `json:"localPart"`
	Domain      string    `json:"domain"`
	Address     string    `json:"address"`
	DisplayName string    `json:"displayName"`
	Mode        string    `json:"mode"` // "mailbox" | "forward"
	ForwardTo   string    `json:"forwardTo"`
	PasswordSet bool      `json:"passwordSet"`
	QuotaMB     int       `json:"quotaMb"`
	Enabled     bool      `json:"enabled"`
	Note        string    `json:"note"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

var ErrEmailAddressTaken = errors.New("email address is already registered")

const emailAccountColumns = `e.id, e.user_id, COALESCE(u.username, ''), e.local_part, e.domain, e.address,
	e.display_name, e.mode, e.forward_to, (e.password_enc <> ''), e.quota_mb, e.enabled, e.note, e.created_at, e.updated_at`

const emailAccountFrom = ` FROM email_accounts e LEFT JOIN users u ON u.id = e.user_id`

func scanEmailAccount(row rowScanner) (*EmailAccount, error) {
	var a EmailAccount
	if err := row.Scan(
		&a.ID, &a.UserID, &a.Username, &a.LocalPart, &a.Domain, &a.Address,
		&a.DisplayName, &a.Mode, &a.ForwardTo, &a.PasswordSet, &a.QuotaMB,
		&a.Enabled, &a.Note, &a.CreatedAt, &a.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &a, nil
}

// ListEmailAccounts returns all email accounts (when userID == 0) or those belonging to userID.
func (m *Manager) ListEmailAccounts(userID int64) ([]EmailAccount, error) {
	if !m.IsConnected() {
		return []EmailAccount{}, nil
	}
	query := `SELECT ` + emailAccountColumns + emailAccountFrom
	var args []any
	if userID > 0 {
		query += ` WHERE e.user_id = $1`
		args = append(args, userID)
	}
	query += ` ORDER BY e.domain ASC, e.local_part ASC`
	rows, err := m.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]EmailAccount, 0)
	for rows.Next() {
		item, err := scanEmailAccount(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *item)
	}
	return out, rows.Err()
}

func (m *Manager) GetEmailAccount(id int64) (*EmailAccount, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	item, err := scanEmailAccount(m.db.QueryRow(`SELECT `+emailAccountColumns+emailAccountFrom+` WHERE e.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

func (m *Manager) CreateEmailAccount(a EmailAccount, passwordEnc string) (*EmailAccount, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var id int64
	err := m.db.QueryRow(`
		INSERT INTO email_accounts (user_id, local_part, domain, address, display_name, mode, forward_to, password_enc, quota_mb, enabled, note)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id
	`, a.UserID, a.LocalPart, a.Domain, a.Address, a.DisplayName, a.Mode, a.ForwardTo, passwordEnc, a.QuotaMB, a.Enabled, a.Note).Scan(&id)
	if err != nil {
		var pqErr *pq.Error
		if (errors.As(err, &pqErr) && pqErr.Code == "23505") || strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
			return nil, ErrEmailAddressTaken
		}
		return nil, err
	}
	return m.GetEmailAccount(id)
}

func (m *Manager) UpdateEmailAccount(id int64, displayName, mode, forwardTo string, quotaMB int, enabled bool, note string, passwordEnc *string) (*EmailAccount, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if passwordEnc != nil {
		_, err := m.db.Exec(`
			UPDATE email_accounts
			SET display_name = $2, mode = $3, forward_to = $4, quota_mb = $5, enabled = $6, note = $7, password_enc = $8, updated_at = NOW()
			WHERE id = $1
		`, id, displayName, mode, forwardTo, quotaMB, enabled, note, *passwordEnc)
		if err != nil {
			return nil, err
		}
	} else {
		_, err := m.db.Exec(`
			UPDATE email_accounts
			SET display_name = $2, mode = $3, forward_to = $4, quota_mb = $5, enabled = $6, note = $7, updated_at = NOW()
			WHERE id = $1
		`, id, displayName, mode, forwardTo, quotaMB, enabled, note)
		if err != nil {
			return nil, err
		}
	}
	return m.GetEmailAccount(id)
}

func (m *Manager) DeleteEmailAccount(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM email_accounts WHERE id = $1`, id)
	return err
}

