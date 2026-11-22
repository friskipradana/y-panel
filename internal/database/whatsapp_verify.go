package database

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// WhatsAppVerification is a code sent to a number that waits to be typed back
type WhatsAppVerification struct {
	UserID     int64
	Phone      string
	CodeHash   string
	Attempts   int
	ExpiresAt  time.Time
	SentAt     time.Time
	SendsToday int
	SendsDay   time.Time
}

func (m *Manager) GetWhatsAppVerification(userID int64) (*WhatsAppVerification, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var v WhatsAppVerification
	err := m.db.QueryRow(`SELECT user_id, phone, code_hash, attempts, expires_at, sent_at, sends_today, sends_day FROM whatsapp_verifications WHERE user_id = $1`, userID).
		Scan(&v.UserID, &v.Phone, &v.CodeHash, &v.Attempts, &v.ExpiresAt, &v.SentAt, &v.SendsToday, &v.SendsDay)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &v, err
}

// SaveWhatsAppVerification keeps a new code for an account (the old one stops working) and counts the send for today
func (m *Manager) SaveWhatsAppVerification(userID int64, phone, codeHash string, expiresAt time.Time) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO whatsapp_verifications (user_id, phone, code_hash, attempts, expires_at, sent_at, sends_day, sends_today)
		VALUES ($1, $2, $3, 0, $4, NOW(), CURRENT_DATE, 1)
		ON CONFLICT (user_id) DO UPDATE SET phone = EXCLUDED.phone, code_hash = EXCLUDED.code_hash, attempts = 0,
			expires_at = EXCLUDED.expires_at, sent_at = NOW(),
			sends_today = CASE WHEN whatsapp_verifications.sends_day = CURRENT_DATE THEN whatsapp_verifications.sends_today + 1 ELSE 1 END,
			sends_day = CURRENT_DATE
	`, userID, phone, codeHash, expiresAt)
	return err
}

// CountWhatsAppVerificationAttempt adds one wrong try and returns how many there are now
func (m *Manager) CountWhatsAppVerificationAttempt(userID int64) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var n int
	err := m.db.QueryRow(`UPDATE whatsapp_verifications SET attempts = attempts + 1 WHERE user_id = $1 RETURNING attempts`, userID).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return n, err
}

func (m *Manager) DeleteWhatsAppVerification(userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM whatsapp_verifications WHERE user_id = $1`, userID)
	return err
}

// ConnectServerWhatsApp keeps a verified number for the notices an account gets from the WhatsApp of the server
func (m *Manager) ConnectServerWhatsApp(userID int64, kind, address string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO notification_recipients (user_id, kind, address, verified_at, via_server)
		VALUES ($1, $2, $3, NOW(), true)
		ON CONFLICT (user_id, kind) DO UPDATE SET address = EXCLUDED.address, verified_at = NOW(), via_server = true,
			blocked_at = NULL, link_code = '', link_expires_at = NULL, updated_at = NOW()
	`, userID, kind, address)
	return err
}
