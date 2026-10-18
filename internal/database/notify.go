package database

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"
)

// The data of notice delivery: the queue, the channels, the recipients (migration 000021).

const (
	OutboxPending   = "pending"
	OutboxSending   = "sending"
	OutboxSent      = "sent"
	OutboxFailed    = "failed"
	OutboxCancelled = "cancelled"
)

type OutboxMessage struct {
	ID            int64           `json:"id"`
	Event         string          `json:"event"`
	UserID        int64           `json:"userId"`
	Username      string          `json:"username,omitempty"`
	Kind          string          `json:"kind"`
	Address       string          `json:"address"`
	Payload       json.RawMessage `json:"payload"`
	Key           string          `json:"-"`
	Priority      int             `json:"priority"`
	Status        string          `json:"status"`
	Attempts      int             `json:"attempts"`
	NextAttemptAt time.Time       `json:"nextAttemptAt"`
	ProviderID    string          `json:"providerId"`
	Error         string          `json:"error"`
	CreatedAt     time.Time       `json:"createdAt"`
	SentAt        *time.Time      `json:"sentAt"`
	// SenderUserID is the account whose WhatsApp session sends it; 0 is the recipient's own
	SenderUserID int64 `json:"-"`
	// ProviderStatus is what the channel said after sending: delivered, read, failed
	ProviderStatus string `json:"providerStatus"`
}

const outboxColumns = `o.id, o.event, o.user_id, o.kind, o.address, o.payload, o.idempotency_key, o.priority, o.status, o.attempts,
	o.next_attempt_at, o.provider_id, o.error, o.created_at, o.sent_at, o.sender_user_id, o.provider_status`

func scanOutbox(row rowScanner) (*OutboxMessage, error) {
	var m OutboxMessage
	var payload []byte
	if err := row.Scan(&m.ID, &m.Event, &m.UserID, &m.Kind, &m.Address, &payload, &m.Key, &m.Priority, &m.Status, &m.Attempts,
		&m.NextAttemptAt, &m.ProviderID, &m.Error, &m.CreatedAt, &m.SentAt, &m.SenderUserID, &m.ProviderStatus); err != nil {
		return nil, err
	}
	m.Payload = json.RawMessage(payload)
	return &m, nil
}

// EnqueueOutbox puts a message in the queue. A message whose key is already there is not added again; created says
// whether this call added it.
func (m *Manager) EnqueueOutbox(msg OutboxMessage) (id int64, created bool, err error) {
	if !m.IsConnected() {
		return 0, false, fmt.Errorf("database not connected")
	}
	payload := msg.Payload
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	err = m.db.QueryRow(`
		INSERT INTO notification_outbox (event, user_id, kind, address, payload, idempotency_key, priority, sender_user_id)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
		ON CONFLICT (idempotency_key) DO NOTHING
		RETURNING id
	`, msg.Event, msg.UserID, msg.Kind, msg.Address, string(payload), msg.Key, msg.Priority, msg.SenderUserID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return id, true, nil
}

// ClaimOutbox takes up to limit messages that are due, in one statement, so two workers never get the same one.
// A message waits while an older one for the same recipient is still due or being sent, which keeps the order of
// what a recipient gets. Messages another worker holds are skipped, not waited for.
func (m *Manager) ClaimOutbox(workerID string, limit int, lease time.Duration) ([]OutboxMessage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`
		WITH due AS (
			SELECT o.id FROM notification_outbox o
			WHERE o.status = 'pending' AND o.next_attempt_at <= NOW()
				AND NOT EXISTS (
					SELECT 1 FROM notification_outbox p
					WHERE p.kind = o.kind AND p.address = o.address AND p.id < o.id
						AND (p.status = 'sending' OR (p.status = 'pending' AND p.next_attempt_at <= NOW()))
				)
			ORDER BY o.priority, o.id
			LIMIT $1
			FOR UPDATE OF o SKIP LOCKED
		)
		UPDATE notification_outbox o
		SET status = 'sending', locked_by = $2, locked_until = NOW() + make_interval(secs => $3), attempts = o.attempts + 1
		FROM due WHERE o.id = due.id
		RETURNING `+outboxColumns+`
	`, limit, workerID, lease.Seconds())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []OutboxMessage
	for rows.Next() {
		msg, err := scanOutbox(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *msg)
	}
	return out, rows.Err()
}

// finishOutbox moves a message the worker still holds to its next state. A worker whose lease ran out and whose
// message another worker took gets false and must not report anything.
func (m *Manager) finishOutbox(id int64, workerID, query string, args ...any) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	res, err := m.db.Exec(query, append([]any{id, workerID}, args...)...)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func (m *Manager) CompleteOutbox(id int64, workerID, providerID string) (bool, error) {
	return m.finishOutbox(id, workerID, `UPDATE notification_outbox SET status = 'sent', sent_at = NOW(), provider_id = $3,
		error = '', locked_by = '', locked_until = NULL WHERE id = $1 AND status = 'sending' AND locked_by = $2`, providerID)
}

// RetryOutbox puts a message back to be tried again after a delay
func (m *Manager) RetryOutbox(id int64, workerID string, delay time.Duration, reason string) (bool, error) {
	return m.finishOutbox(id, workerID, `UPDATE notification_outbox SET status = 'pending', error = $3,
		next_attempt_at = NOW() + make_interval(secs => $4), locked_by = '', locked_until = NULL
		WHERE id = $1 AND status = 'sending' AND locked_by = $2`, reason, delay.Seconds())
}

// DeferOutbox puts a message back without counting the try, for a wait that is not a failure (the rate limit of a channel)
func (m *Manager) DeferOutbox(id int64, workerID string, delay time.Duration, reason string) (bool, error) {
	return m.finishOutbox(id, workerID, `UPDATE notification_outbox SET status = 'pending', error = $3, attempts = GREATEST(attempts - 1, 0),
		next_attempt_at = NOW() + make_interval(secs => $4), locked_by = '', locked_until = NULL
		WHERE id = $1 AND status = 'sending' AND locked_by = $2`, reason, delay.Seconds())
}

// StopOutbox ends a message that will not be sent: failed (tried enough or cannot work) or cancelled (no longer wanted)
func (m *Manager) StopOutbox(id int64, workerID, status, reason string) (bool, error) {
	if status != OutboxFailed && status != OutboxCancelled {
		return false, fmt.Errorf("a message is stopped as failed or cancelled, not %q", status)
	}
	return m.finishOutbox(id, workerID, `UPDATE notification_outbox SET status = $3, error = $4, locked_by = '', locked_until = NULL
		WHERE id = $1 AND status = 'sending' AND locked_by = $2`, status, reason)
}

// ReleaseExpiredOutboxLeases gives back the messages whose worker did not report in time (it died, or hung). A
// message that has used all its attempts is failed instead of tried again.
func (m *Manager) ReleaseExpiredOutboxLeases(maxAttempts int) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	res, err := m.db.Exec(`
		UPDATE notification_outbox
		SET status = CASE WHEN attempts >= $1 THEN 'failed' ELSE 'pending' END,
			error = CASE WHEN attempts >= $1 THEN 'the worker did not answer in time' ELSE error END,
			locked_by = '', locked_until = NULL
		WHERE status = 'sending' AND locked_until < NOW()
	`, maxAttempts)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// ReleaseWorkerOutbox gives back what one worker still holds, when it is stopped
func (m *Manager) ReleaseWorkerOutbox(workerID string) error {
	if !m.IsConnected() {
		return nil
	}
	_, err := m.db.Exec(`UPDATE notification_outbox SET status = 'pending', locked_by = '', locked_until = NULL
		WHERE status = 'sending' AND locked_by = $1`, workerID)
	return err
}

// ListOutbox returns the newest messages, optionally of one status
func (m *Manager) ListOutbox(status string, limit int) ([]OutboxMessage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `SELECT ` + outboxColumns + ` FROM notification_outbox o`
	var args []any
	if status != "" {
		query += ` WHERE o.status = $1`
		args = append(args, status)
	}
	rows, err := m.db.Query(query+fmt.Sprintf(` ORDER BY o.id DESC LIMIT %d`, limit), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OutboxMessage{}
	for rows.Next() {
		msg, err := scanOutbox(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *msg)
	}
	return out, rows.Err()
}

func (m *Manager) GetOutbox(id int64) (*OutboxMessage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	msg, err := scanOutbox(m.db.QueryRow(`SELECT `+outboxColumns+` FROM notification_outbox o WHERE o.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return msg, err
}

// RequeueOutbox sends a failed or cancelled message again, from the start
func (m *Manager) RequeueOutbox(id int64) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	res, err := m.db.Exec(`UPDATE notification_outbox SET status = 'pending', attempts = 0, error = '', next_attempt_at = NOW()
		WHERE id = $1 AND status IN ('failed', 'cancelled')`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// OutboxCounts says how many messages wait and how many failed, for the badge on the tab
func (m *Manager) OutboxCounts() (pending, failed int, err error) {
	if !m.IsConnected() {
		return 0, 0, fmt.Errorf("database not connected")
	}
	err = m.db.QueryRow(`SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'sending')), COUNT(*) FILTER (WHERE status = 'failed')
		FROM notification_outbox`).Scan(&pending, &failed)
	return pending, failed, err
}

// PurgeOutbox removes the messages that ended before the cutoff
func (m *Manager) PurgeOutbox(before time.Time) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	res, err := m.db.Exec(`DELETE FROM notification_outbox WHERE status IN ('sent', 'failed', 'cancelled') AND created_at < $1`, before)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// ─── Channels ─────────────────────────────────────────────────────────────────

type NotifyChannel struct {
	Kind            string          `json:"kind"`
	Enabled         bool            `json:"enabled"`
	Config          json.RawMessage `json:"config"`
	SecretEncrypted string          `json:"-"`
	Status          string          `json:"status"`
	LastError       string          `json:"lastError"`
	CheckedAt       *time.Time      `json:"checkedAt"`
}

func (m *Manager) GetNotifyChannel(kind string) (*NotifyChannel, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	var c NotifyChannel
	var config []byte
	err := m.db.QueryRow(`SELECT kind, enabled, config, secret_encrypted, status, last_error, checked_at FROM notification_channels WHERE kind = $1`, kind).
		Scan(&c.Kind, &c.Enabled, &config, &c.SecretEncrypted, &c.Status, &c.LastError, &c.CheckedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	c.Config = json.RawMessage(config)
	return &c, err
}

// SaveNotifyChannel stores a channel. A nil secret keeps the one stored.
func (m *Manager) SaveNotifyChannel(kind string, enabled bool, config json.RawMessage, secretEncrypted *string, status, lastError string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	if len(config) == 0 {
		config = json.RawMessage(`{}`)
	}
	secret := ""
	keep := secretEncrypted == nil
	if secretEncrypted != nil {
		secret = *secretEncrypted
	}
	_, err := m.db.Exec(`
		INSERT INTO notification_channels (kind, enabled, config, secret_encrypted, status, last_error, checked_at)
		VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW())
		ON CONFLICT (kind) DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config,
			secret_encrypted = CASE WHEN $7 THEN notification_channels.secret_encrypted ELSE EXCLUDED.secret_encrypted END,
			status = EXCLUDED.status, last_error = EXCLUDED.last_error, checked_at = NOW(), updated_at = NOW()
	`, kind, enabled, string(config), secret, status, lastError, keep)
	return err
}

// SetNotifyChannelStatus records what the last use of a channel found
func (m *Manager) SetNotifyChannelStatus(kind, status, lastError string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE notification_channels SET status = $2, last_error = $3, checked_at = NOW() WHERE kind = $1`, kind, status, lastError)
	return err
}

// ─── Recipients ───────────────────────────────────────────────────────────────

type NotifyRecipient struct {
	ID            int64      `json:"id"`
	UserID        int64      `json:"userId"`
	Kind          string     `json:"kind"`
	Address       string     `json:"address"`
	VerifiedAt    *time.Time `json:"verifiedAt"`
	MutedEvents   []string   `json:"mutedEvents"`
	Locale        string     `json:"locale"`
	BlockedAt     *time.Time `json:"blockedAt"`
	LinkCode      string     `json:"-"`
	LinkExpiresAt *time.Time `json:"linkExpiresAt"`
}

const recipientColumns = `id, user_id, kind, address, verified_at, muted_events, locale, blocked_at, link_code, link_expires_at`

func scanRecipient(row rowScanner) (*NotifyRecipient, error) {
	var r NotifyRecipient
	var muted pq.StringArray
	if err := row.Scan(&r.ID, &r.UserID, &r.Kind, &r.Address, &r.VerifiedAt, &muted, &r.Locale, &r.BlockedAt, &r.LinkCode, &r.LinkExpiresAt); err != nil {
		return nil, err
	}
	r.MutedEvents = []string(muted)
	if r.MutedEvents == nil {
		r.MutedEvents = []string{}
	}
	return &r, nil
}

func (m *Manager) GetNotifyRecipient(userID int64, kind string) (*NotifyRecipient, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	r, err := scanRecipient(m.db.QueryRow(`SELECT `+recipientColumns+` FROM notification_recipients WHERE user_id = $1 AND kind = $2`, userID, kind))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return r, err
}

// StartNotifyLink gives an account a code to complete its link with. An address that is already verified stays in use
// until the new link completes.
func (m *Manager) StartNotifyLink(userID int64, kind, code string, ttl time.Duration) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`
		INSERT INTO notification_recipients (user_id, kind, link_code, link_expires_at)
		VALUES ($1, $2, $3, NOW() + make_interval(secs => $4))
		ON CONFLICT (user_id, kind) DO UPDATE SET link_code = EXCLUDED.link_code, link_expires_at = EXCLUDED.link_expires_at, updated_at = NOW()
	`, userID, kind, code, ttl.Seconds())
	return err
}

// CompleteNotifyLink finishes the link of the account that holds the code, in one statement, so a code works once.
// It returns the account, or 0 when the code is unknown or has run out.
func (m *Manager) CompleteNotifyLink(kind, code, address string) (int64, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var userID int64
	err := m.db.QueryRow(`
		UPDATE notification_recipients
		SET address = $3, verified_at = NOW(), blocked_at = NULL, link_code = '', link_expires_at = NULL, updated_at = NOW()
		WHERE kind = $1 AND link_code = $2 AND link_code <> '' AND link_expires_at > NOW()
		RETURNING user_id
	`, kind, code, address).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return userID, err
}

func (m *Manager) SetNotifyMuted(userID int64, kind string, muted []string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	if muted == nil {
		muted = []string{}
	}
	res, err := m.db.Exec(`UPDATE notification_recipients SET muted_events = $3, updated_at = NOW() WHERE user_id = $1 AND kind = $2`, userID, kind, pq.Array(muted))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (m *Manager) DeleteNotifyRecipient(userID int64, kind string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM notification_recipients WHERE user_id = $1 AND kind = $2`, userID, kind)
	return err
}

// BlockNotifyRecipient stops sending to an address the channel says is no longer reachable
func (m *Manager) BlockNotifyRecipient(userID int64, kind, address string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE notification_recipients SET blocked_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND kind = $2 AND address = $3`, userID, kind, address)
	return err
}

// NotifyTargets lists where the given accounts want notices: verified, not blocked, on a channel that is switched on
func (m *Manager) NotifyTargets(userIDs []int64) ([]NotifyRecipient, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	if len(userIDs) == 0 {
		return nil, nil
	}
	rows, err := m.db.Query(`
		SELECT r.id, r.user_id, r.kind, r.address, r.verified_at, r.muted_events, r.locale, r.blocked_at, r.link_code, r.link_expires_at
		FROM notification_recipients r JOIN notification_channels c ON c.kind = r.kind AND c.enabled
		WHERE r.user_id = ANY($1) AND r.verified_at IS NOT NULL AND r.blocked_at IS NULL AND r.address <> ''
		ORDER BY r.user_id, r.kind
	`, pq.Array(userIDs))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []NotifyRecipient
	for rows.Next() {
		r, err := scanRecipient(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

// NotifyRecipientAt reads the recipient a message is addressed to, to be sure it may still be sent
func (m *Manager) NotifyRecipientAt(userID int64, kind, address string) (*NotifyRecipient, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	r, err := scanRecipient(m.db.QueryRow(`SELECT `+recipientColumns+` FROM notification_recipients
		WHERE user_id = $1 AND kind = $2 AND address = $3 AND verified_at IS NOT NULL`, userID, kind, address))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return r, err
}

// ActiveSuperadminIDs are the accounts that receive what concerns the seller
func (m *Manager) ActiveSuperadminIDs() ([]int64, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`SELECT id FROM users WHERE role = 'superadmin' AND status = 'active' ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ─── Settings, alert state, known devices ─────────────────────────────────────

func (m *Manager) GetNotifySetting(key string) (string, error) {
	if !m.IsConnected() {
		return "", fmt.Errorf("database not connected")
	}
	var value string
	err := m.db.QueryRow(`SELECT value FROM notification_settings WHERE key = $1`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return value, err
}

func (m *Manager) SetNotifySetting(key, value string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`INSERT INTO notification_settings (key, value) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, key, value)
	return err
}

func (m *Manager) DeleteNotifySetting(key string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM notification_settings WHERE key = $1`, key)
	return err
}

// AlertSentRecently says when an alert of this kind and scope was last sent, and at which level; ok is false when never
func (m *Manager) AlertSentRecently(detector, scope string) (level int, at time.Time, ok bool, err error) {
	if !m.IsConnected() {
		return 0, time.Time{}, false, fmt.Errorf("database not connected")
	}
	err = m.db.QueryRow(`SELECT level, last_sent_at FROM notification_alert_state WHERE detector = $1 AND scope = $2`, detector, scope).Scan(&level, &at)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, time.Time{}, false, nil
	}
	return level, at, err == nil, err
}

func (m *Manager) SaveAlertSent(detector, scope string, level int) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`INSERT INTO notification_alert_state (detector, scope, level, last_sent_at) VALUES ($1, $2, $3, NOW())
		ON CONFLICT (detector, scope) DO UPDATE SET level = EXCLUDED.level, last_sent_at = NOW()`, detector, scope, level)
	return err
}

// TouchKnownDevice remembers a device for an account. isNew says it had not been seen before, and others says the
// account had other devices (so a first sign-in is not a surprise).
func (m *Manager) TouchKnownDevice(userID int64, fingerprint string) (isNew, others bool, err error) {
	if !m.IsConnected() {
		return false, false, fmt.Errorf("database not connected")
	}
	if err = m.db.QueryRow(`SELECT EXISTS (SELECT 1 FROM known_devices WHERE user_id = $1 AND fingerprint <> $2 AND last_seen > NOW() - INTERVAL '90 days')`,
		userID, fingerprint).Scan(&others); err != nil {
		return false, false, err
	}
	// xmax is zero for a row this statement inserted, and not for one it updated; a device not seen for 30 days counts as new again
	err = m.db.QueryRow(`
		WITH prev AS (SELECT last_seen FROM known_devices WHERE user_id = $1 AND fingerprint = $2)
		INSERT INTO known_devices (user_id, fingerprint) VALUES ($1, $2)
		ON CONFLICT (user_id, fingerprint) DO UPDATE SET last_seen = NOW()
		RETURNING (xmax = 0) OR COALESCE((SELECT last_seen FROM prev) < NOW() - INTERVAL '30 days', FALSE)`, userID, fingerprint).Scan(&isNew)
	if err != nil {
		return false, false, err
	}
	return isNew, others, nil
}

// ForgetOldDevices drops devices not seen for 90 days
func (m *Manager) ForgetOldDevices() error {
	if !m.IsConnected() {
		return nil
	}
	_, err := m.db.Exec(`DELETE FROM known_devices WHERE last_seen < NOW() - INTERVAL '90 days'`)
	return err
}

// SaveBuyerContact keeps the number from the order form as an unverified place for the buyer's notices. A recipient the
// account already has is left alone.
func (m *Manager) SaveBuyerContact(userID int64, kind, address string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`INSERT INTO notification_recipients (user_id, kind, address) VALUES ($1, $2, $3) ON CONFLICT (user_id, kind) DO NOTHING`, userID, kind, address)
	return err
}

// CountBuyerNotices is how many notices to buyers a number got since a time; an unverified number is capped on it
func (m *Manager) CountBuyerNotices(kind, address string, since time.Time) (int, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var n int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM notification_outbox WHERE kind = $1 AND address = $2 AND event LIKE 'buyer.%' AND created_at >= $3`, kind, address, since).Scan(&n)
	return n, err
}

// WhatsAppSenderID is a superadmin whose WhatsApp session is connected, for the notices to buyers; 0 when there is none
func (m *Manager) WhatsAppSenderID() (int64, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	var id int64
	err := m.db.QueryRow(`
		SELECT w.user_id FROM whatsapp_sessions w JOIN users u ON u.id = w.user_id
		WHERE w.status = 'WORKING' AND u.role = 'superadmin' AND u.status = 'active' ORDER BY w.user_id LIMIT 1
	`).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return id, err
}

// ─── Answers from people ──────────────────────────────────────────────────────

func (m *Manager) AddNotifyOptOut(kind, address string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`INSERT INTO notification_optouts (kind, address) VALUES ($1, $2) ON CONFLICT DO NOTHING`, kind, address)
	return err
}

func (m *Manager) RemoveNotifyOptOut(kind, address string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`DELETE FROM notification_optouts WHERE kind = $1 AND address = $2`, kind, address)
	return err
}

func (m *Manager) IsNotifyOptedOut(kind, address string) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	var n int
	err := m.db.QueryRow(`SELECT COUNT(*) FROM notification_optouts WHERE kind = $1 AND address = $2`, kind, address).Scan(&n)
	return n > 0, err
}

// SetMutedAtAddress switches the given groups off (or on again, with none) for every account whose recipient on a
// channel is this address, and returns how many accounts it touched
func (m *Manager) SetMutedAtAddress(kind, address string, muted []string) (int64, error) {
	if !m.IsConnected() {
		return 0, fmt.Errorf("database not connected")
	}
	if muted == nil {
		muted = []string{}
	}
	res, err := m.db.Exec(`UPDATE notification_recipients SET muted_events = $3, updated_at = NOW() WHERE kind = $1 AND address = $2`, kind, address, pq.Array(muted))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// SetOutboxProviderStatus keeps what a channel said about a message it carried; a failure also shows as the message's error
func (m *Manager) SetOutboxProviderStatus(kind, providerID, status, reason string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE notification_outbox SET provider_status = $3, error = CASE WHEN $4 <> '' THEN $4 ELSE error END
		WHERE kind = $1 AND provider_id = $2 AND provider_id <> ''`, kind, providerID, status, reason)
	return err
}
