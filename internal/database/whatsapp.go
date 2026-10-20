package database

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"
)

// The WhatsApp session of each account on the WAHA container (migration 000022).

type WhatsAppSession struct {
	UserID      int64     `json:"userId"`
	SessionName string    `json:"sessionName"`
	Status      string    `json:"status"`
	Phone       string    `json:"phone"`
	UpdatedAt   time.Time `json:"updatedAt"`
	// the key of this session in WAHA (its id there, and the key itself encrypted); never leaves the agent
	APIKeyID        string `json:"-"`
	APIKeyEncrypted string `json:"-"`
	// when the wait for a scan began, the QR code last shown, and how many different ones were shown after the first
	ScanStartedAt *time.Time `json:"-"`
	QRHash        string     `json:"-"`
	QRChanges     int        `json:"-"`
}

const sessionColumns = `user_id, session_name, status, phone, updated_at, api_key_id, api_key_encrypted, scan_started_at, qr_hash, qr_changes`

func scanSession(row rowScanner) (*WhatsAppSession, error) {
	var s WhatsAppSession
	err := row.Scan(&s.UserID, &s.SessionName, &s.Status, &s.Phone, &s.UpdatedAt, &s.APIKeyID, &s.APIKeyEncrypted, &s.ScanStartedAt, &s.QRHash, &s.QRChanges)
	return &s, err
}

func (m *Manager) GetWhatsAppSession(userID int64) (*WhatsAppSession, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	s, err := scanSession(m.db.QueryRow(`SELECT `+sessionColumns+` FROM whatsapp_sessions WHERE user_id = $1`, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// EnsureWhatsAppSession gives the account its session row. Pressing connect twice, or from two devices, gets the same
// row: the account is the key. A name another account already holds gets the account id added.
func (m *Manager) EnsureWhatsAppSession(userID int64, name string) (*WhatsAppSession, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	for _, candidate := range []string{name, fmt.Sprintf("%s-%d", name, userID)} {
		_, err := m.db.Exec(`INSERT INTO whatsapp_sessions (user_id, session_name) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, userID, candidate)
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" {
			continue
		}
		if err != nil {
			return nil, err
		}
		return m.GetWhatsAppSession(userID)
	}
	return nil, errors.New("no free session name")
}

func (m *Manager) UpdateWhatsAppSession(userID int64, status, phone string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE whatsapp_sessions SET status = $2, phone = CASE WHEN $3 <> '' THEN $3 ELSE phone END, updated_at = NOW() WHERE user_id = $1`, userID, status, phone)
	return err
}

func (m *Manager) DeleteWhatsAppSession(userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM whatsapp_sessions WHERE user_id = $1`, userID)
	return err
}

func (m *Manager) CountWhatsAppSessions() (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var n int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM whatsapp_sessions`).Scan(&n)
	return n, err
}

// ConnectNotifyRecipient makes the number of a connected session the place of the account's notices; connecting
// again keeps what the account switched off
func (m *Manager) ConnectNotifyRecipient(userID int64, kind, address string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO notification_recipients (user_id, kind, address, verified_at, via_server)
		VALUES ($1, $2, $3, NOW(), false)
		ON CONFLICT (user_id, kind) DO UPDATE SET address = EXCLUDED.address, via_server = false,
			verified_at = CASE WHEN notification_recipients.address = EXCLUDED.address AND notification_recipients.verified_at IS NOT NULL
				THEN notification_recipients.verified_at ELSE NOW() END,
			blocked_at = NULL,
			link_code = '', link_expires_at = NULL, updated_at = NOW()
	`, userID, kind, address)
	return err
}

// WhatsAppSessionNamed says whether a session of that name belongs to an account
func (m *Manager) WhatsAppSessionNamed(name string) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	var n int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM whatsapp_sessions WHERE session_name = $1`, name).Scan(&n)
	return n > 0, err
}

// SetWhatsAppSessionKey keeps the key WAHA made for a session
func (m *Manager) SetWhatsAppSessionKey(userID int64, keyID, encrypted string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE whatsapp_sessions SET api_key_id = $2, api_key_encrypted = $3, updated_at = NOW() WHERE user_id = $1`, userID, keyID, encrypted)
	return err
}

// GetWhatsAppSessionByName finds the session of that name, nil when none is ours
func (m *Manager) GetWhatsAppSessionByName(name string) (*WhatsAppSession, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	s, err := scanSession(m.db.QueryRow(`SELECT `+sessionColumns+` FROM whatsapp_sessions WHERE session_name = $1`, name))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// StartWhatsAppScan notes that the session began to wait for a scan now, with no code shown yet
func (m *Manager) StartWhatsAppScan(userID int64, at time.Time) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE whatsapp_sessions SET scan_started_at = $2, qr_hash = '', qr_changes = 0 WHERE user_id = $1`, userID, at)
	return err
}

// EndWhatsAppScan forgets the wait: the session was scanned, stopped, or ended
func (m *Manager) EndWhatsAppScan(userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE whatsapp_sessions SET scan_started_at = NULL, qr_hash = '', qr_changes = 0 WHERE user_id = $1`, userID)
	return err
}

// NoteWhatsAppQR records a code that was shown and says how many times it has changed since the first one
func (m *Manager) NoteWhatsAppQR(userID int64, hash string) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var changes int
	err := m.db.QueryRow(`
		UPDATE whatsapp_sessions
		SET qr_changes = CASE WHEN qr_hash <> '' AND qr_hash <> $2 THEN qr_changes + 1 ELSE qr_changes END, qr_hash = $2
		WHERE user_id = $1 RETURNING qr_changes
	`, userID, hash).Scan(&changes)
	return changes, err
}
