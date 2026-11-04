package database

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// EmailMessage represents an inbound or outbound email stored in the panel.
type EmailMessage struct {
	ID         int64     `json:"id"`
	AccountID  int64     `json:"accountId"`
	Direction  string    `json:"direction"` // "inbound" | "outbound"
	FromAddr   string    `json:"fromAddr"`
	FromName   string    `json:"fromName"`
	ToAddr     string    `json:"toAddr"`
	Subject    string    `json:"subject"`
	Snippet    string    `json:"snippet"`
	BodyText   string    `json:"bodyText"`
	BodyHTML   string    `json:"bodyHtml"`
	IsRead     bool      `json:"isRead"`
	IsStarred  bool      `json:"isStarred"`
	MessageID  string    `json:"messageId"`
	ReceivedAt time.Time `json:"receivedAt"`
	CreatedAt  time.Time `json:"createdAt"`
}

type EmailMessageFilter struct {
	Direction string
	Query     string
	UnreadOnly bool
	Limit     int
	Offset    int
}

const emailMessageColumns = `id, account_id, direction, from_addr, from_name, to_addr, subject, snippet, body_text, body_html, is_read, is_starred, message_id, received_at, created_at`

func scanEmailMessage(row rowScanner) (*EmailMessage, error) {
	var m EmailMessage
	if err := row.Scan(
		&m.ID, &m.AccountID, &m.Direction, &m.FromAddr, &m.FromName, &m.ToAddr,
		&m.Subject, &m.Snippet, &m.BodyText, &m.BodyHTML, &m.IsRead, &m.IsStarred,
		&m.MessageID, &m.ReceivedAt, &m.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &m, nil
}

func (m *Manager) ListEmailMessages(filter EmailMessageFilter) ([]EmailMessage, int, error) {
	if !m.IsConnected() {
		return []EmailMessage{}, 0, nil
	}
	where := []string{"1=1"}
	args := []any{}
	idx := 1

	if filter.Direction != "" {
		where = append(where, fmt.Sprintf("direction = $%d", idx))
		args = append(args, filter.Direction)
		idx++
	}
	if filter.UnreadOnly {
		where = append(where, "is_read = false")
	}
	if q := strings.TrimSpace(filter.Query); q != "" {
		where = append(where, fmt.Sprintf("(LOWER(subject) LIKE $%d OR LOWER(from_addr) LIKE $%d OR LOWER(from_name) LIKE $%d OR LOWER(snippet) LIKE $%d)", idx, idx, idx, idx))
		args = append(args, "%"+strings.ToLower(q)+"%")
		idx++
	}

	whereClause := strings.Join(where, " AND ")

	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM email_messages WHERE %s", whereClause)
	if err := m.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	query := fmt.Sprintf("SELECT %s FROM email_messages WHERE %s ORDER BY received_at DESC LIMIT %d OFFSET %d", emailMessageColumns, whereClause, limit, filter.Offset)

	rows, err := m.db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := make([]EmailMessage, 0)
	for rows.Next() {
		item, err := scanEmailMessage(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *item)
	}
	return out, total, rows.Err()
}

func (m *Manager) GetEmailMessage(id int64) (*EmailMessage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	item, err := scanEmailMessage(m.db.QueryRow(fmt.Sprintf("SELECT %s FROM email_messages WHERE id = $1", emailMessageColumns), id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

func (m *Manager) InsertEmailMessage(msg EmailMessage) (*EmailMessage, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	snippet := msg.Snippet
	if snippet == "" {
		snippet = strings.TrimSpace(msg.BodyText)
		if len(snippet) > 180 {
			snippet = snippet[:180] + "..."
		}
	}
	receivedAt := msg.ReceivedAt
	if receivedAt.IsZero() {
		receivedAt = time.Now()
	}

	var id int64
	err := m.db.QueryRow(`
		INSERT INTO email_messages (account_id, direction, from_addr, from_name, to_addr, subject, snippet, body_text, body_html, is_read, is_starred, message_id, received_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id
	`, msg.AccountID, msg.Direction, msg.FromAddr, msg.FromName, msg.ToAddr, msg.Subject, snippet, msg.BodyText, msg.BodyHTML, msg.IsRead, msg.IsStarred, msg.MessageID, receivedAt).Scan(&id)
	if err != nil {
		return nil, err
	}
	return m.GetEmailMessage(id)
}

func (m *Manager) MarkEmailMessageRead(id int64, read bool) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("UPDATE email_messages SET is_read = $2 WHERE id = $1", id, read)
	return err
}

func (m *Manager) DeleteEmailMessage(id int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec("DELETE FROM email_messages WHERE id = $1", id)
	return err
}

