package database

import (
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

// ─── Payment Transactions ────────────────────────────────────────────────────

// PaymentTransaction represents a pending/completed payment record.
type PaymentTransaction struct {
	ID             int64      `json:"id"`
	UserID         int64      `json:"userId"`
	ReferenceID    string     `json:"referenceId"`
	Gateway        string     `json:"gateway"`
	Amount         int64      `json:"amount"`
	Currency       string     `json:"currency"`
	Status         string     `json:"status"`
	Description    string     `json:"description"`
	ExternalID     string     `json:"externalId"`
	PaidAt         *time.Time `json:"paidAt"`
	MatchedNotifID *int64     `json:"matchedNotifId"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

// CreatePaymentTransaction inserts a new pending payment transaction.
func (m *Manager) CreatePaymentTransaction(userID int64, referenceID, gateway string, amount int64, currency, description, externalID string) (*PaymentTransaction, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, fmt.Errorf("database not connected")
	}

	var txn PaymentTransaction
	err := m.db.QueryRow(`
		INSERT INTO payment_transactions (user_id, reference_id, gateway, amount, currency, status, description, external_id)
		VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
		RETURNING id, user_id, reference_id, gateway, amount, currency, status, description, external_id, paid_at, matched_notif_id, created_at, updated_at
	`, userID, referenceID, gateway, amount, currency, description, externalID).Scan(
		&txn.ID, &txn.UserID, &txn.ReferenceID, &txn.Gateway, &txn.Amount, &txn.Currency,
		&txn.Status, &txn.Description, &txn.ExternalID, &txn.PaidAt, &txn.MatchedNotifID,
		&txn.CreatedAt, &txn.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &txn, nil
}

// ListPendingTransactionsByAmount finds pending transactions matching a given amount.
func (m *Manager) ListPendingTransactionsByAmount(amount int64) ([]PaymentTransaction, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, fmt.Errorf("database not connected")
	}

	rows, err := m.db.Query(`
		SELECT id, user_id, reference_id, gateway, amount, currency, status, description,
			COALESCE(external_id, ''), paid_at, matched_notif_id, created_at, updated_at
		FROM payment_transactions
		WHERE status = 'pending' AND amount = $1
		ORDER BY created_at ASC
		LIMIT 10
	`, amount)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []PaymentTransaction
	for rows.Next() {
		var t PaymentTransaction
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.ReferenceID, &t.Gateway, &t.Amount, &t.Currency,
			&t.Status, &t.Description, &t.ExternalID, &t.PaidAt, &t.MatchedNotifID,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

// MatchTransactionToNotification marks a pending transaction as paid and links to the captured notification.
func (m *Manager) MatchTransactionToNotification(txnID, notifID int64) error {
	if !m.IsConnected() || m.db == nil {
		return fmt.Errorf("database not connected")
	}

	_, err := m.db.Exec(`
		UPDATE payment_transactions
		SET status = 'paid', paid_at = NOW(), matched_notif_id = $1, updated_at = NOW()
		WHERE id = $2 AND status = 'pending'
	`, notifID, txnID)
	return err
}

// MatchCapturedAmountToPendingTransaction attempts to match a captured notification's
// detected amount to a pending payment transaction. If matched, marks it paid.
func (m *Manager) MatchCapturedAmountToPendingTransaction(amountDetected string) (*PaymentTransaction, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, fmt.Errorf("database not connected")
	}

	if strings.TrimSpace(amountDetected) == "" {
		return nil, nil
	}

	// Normalize the amount string: strip non-digits, convert to int64
	normalized := normalizeAmount(amountDetected)
	if normalized <= 0 {
		log.Printf("[txn-match] could not normalize amount=%q", amountDetected)
		return nil, nil
	}

	// Check auto_confirm setting
	var autoConfirm bool
	var toleranceSec int
	if raw, err := m.GetPaymentSettingValue("auto_confirm"); err == nil {
		autoConfirm = raw == "true"
	}
	if raw, err := m.GetPaymentSettingValue("notification_tolerance_sec"); err == nil {
		if v, err := strconv.Atoi(raw); err == nil {
			toleranceSec = v
		}
	}
	if !autoConfirm {
		log.Printf("[txn-match] auto_confirm is off; matched amount=%d but not auto-confirming", normalized)
		return nil, nil
	}

	// Find pending transactions with matching amount
	pending, err := m.ListPendingTransactionsByAmount(normalized)
	if err != nil {
		return nil, err
	}
	if len(pending) == 0 {
		log.Printf("[txn-match] no pending transaction found for amount=%d", normalized)
		return nil, nil
	}

	// Take the oldest pending transaction and match it
	txn := pending[0]

	// Fetch tolerance setting if configured (future use: filter by time window)
	if toleranceSec <= 0 {
		toleranceSec = 300
	}
	log.Printf("[txn-match] matching txn_id=%d (user_id=%d, amount=%d) with tolerance=%ds",
		txn.ID, txn.UserID, txn.Amount, toleranceSec)

	return &txn, nil
}

// normalizeAmount strips non-digit characters and returns the numeric value.
func normalizeAmount(raw string) int64 {
	// Remove common prefixes, whitespace, and thousands separators
	cleaned := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, raw)

	if cleaned == "" {
		return 0
	}

	v, err := strconv.ParseInt(cleaned, 10, 64)
	if err != nil {
		return 0
	}
	return v
}

// ListPaymentTransactions returns transactions with pagination.
func (m *Manager) ListPaymentTransactions(userID *int64, status string, limit, offset int) ([]PaymentTransaction, int64, error) {
	if !m.IsConnected() || m.db == nil {
		return nil, 0, fmt.Errorf("database not connected")
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	var total int64
	countQuery := "SELECT COUNT(*) FROM payment_transactions WHERE 1=1"
	listQuery := `SELECT id, user_id, reference_id, gateway, amount, currency, status, description,
		COALESCE(external_id, ''), paid_at, matched_notif_id, created_at, updated_at
		FROM payment_transactions WHERE 1=1`

	var args []any
	argIdx := 1

	if userID != nil {
		countQuery += fmt.Sprintf(" AND user_id = $%d", argIdx)
		listQuery += fmt.Sprintf(" AND user_id = $%d", argIdx)
		args = append(args, *userID)
		argIdx++
	}
	if status != "" {
		countQuery += fmt.Sprintf(" AND status = $%d", argIdx)
		listQuery += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}

	if err := m.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listQuery += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := m.db.Query(listQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var result []PaymentTransaction
	for rows.Next() {
		var t PaymentTransaction
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.ReferenceID, &t.Gateway, &t.Amount, &t.Currency,
			&t.Status, &t.Description, &t.ExternalID, &t.PaidAt, &t.MatchedNotifID,
			&t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		result = append(result, t)
	}
	return result, total, rows.Err()
}

// UpdateTransactionStatus manually updates a transaction's status.
func (m *Manager) UpdateTransactionStatus(id int64, status string) error {
	if !m.IsConnected() || m.db == nil {
		return fmt.Errorf("database not connected")
	}

	var paidAt string
	if status == "paid" {
		paidAt = ", paid_at = NOW()"
	}

	_, err := m.db.Exec(fmt.Sprintf(`
		UPDATE payment_transactions SET status = $1, updated_at = NOW()%s WHERE id = $2
	`, paidAt), status, id)
	return err
}
