package database

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// UserTelegramBot is the Telegram bot an account brought: the token stays encrypted, and the notices of the account
// leave from this bot while the plan allows it.
type UserTelegramBot struct {
	UserID      int64      `json:"userId"`
	TokenEnc    string     `json:"-"`
	BotUsername string     `json:"botUsername"`
	BotName     string     `json:"botName"`
	Enabled     bool       `json:"enabled"`
	Offset      int64      `json:"-"`
	Status      string     `json:"status"`
	LastError   string     `json:"lastError"`
	CheckedAt   *time.Time `json:"checkedAt"`
}

const botColumns = `user_id, token_enc, bot_username, bot_name, enabled, update_offset, status, last_error, checked_at`

func scanBot(row rowScanner) (*UserTelegramBot, error) {
	var b UserTelegramBot
	if err := row.Scan(&b.UserID, &b.TokenEnc, &b.BotUsername, &b.BotName, &b.Enabled, &b.Offset, &b.Status, &b.LastError, &b.CheckedAt); err != nil {
		return nil, err
	}
	return &b, nil
}

func (m *Manager) GetUserTelegramBot(userID int64) (*UserTelegramBot, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	b, err := scanBot(m.db.QueryRow(`SELECT `+botColumns+` FROM user_telegram_bots WHERE user_id = $1`, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return b, err
}

// SaveUserTelegramBot stores the bot of an account. A nil token keeps the saved one and only changes the switch.
func (m *Manager) SaveUserTelegramBot(userID int64, tokenEnc *string, username, name string, enabled bool) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	if tokenEnc == nil {
		res, err := m.db.Exec(`UPDATE user_telegram_bots SET enabled = $2, updated_at = NOW() WHERE user_id = $1`, userID, enabled)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return sql.ErrNoRows
		}
		return nil
	}
	// a new token is a new bot: updates already read belong to the old one, and what was linked through it is gone
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`
		INSERT INTO user_telegram_bots (user_id, token_enc, bot_username, bot_name, enabled, update_offset, status, last_error, checked_at)
		VALUES ($1, $2, $3, $4, $5, 0, 'active', '', NOW())
		ON CONFLICT (user_id) DO UPDATE SET token_enc = EXCLUDED.token_enc, bot_username = EXCLUDED.bot_username, bot_name = EXCLUDED.bot_name,
			enabled = EXCLUDED.enabled, update_offset = 0, status = 'active', last_error = '', checked_at = NOW(), updated_at = NOW()
	`, userID, *tokenEnc, username, name, enabled); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM notification_recipients WHERE user_id = $1 AND kind = 'telegram' AND own_bot`, userID); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteUserTelegramBot removes the bot of an account and the chat that was linked through it
func (m *Manager) DeleteUserTelegramBot(userID int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM notification_recipients WHERE user_id = $1 AND kind = 'telegram' AND own_bot`, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM user_telegram_bots WHERE user_id = $1`, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func (m *Manager) SetUserTelegramBotOffset(userID, offset int64) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE user_telegram_bots SET update_offset = $2 WHERE user_id = $1`, userID, offset)
	return err
}

func (m *Manager) SetUserTelegramBotStatus(userID int64, status, lastError string) error {
	if !m.IsConnected() {
		return fmt.Errorf("database not connected")
	}
	_, err := m.db.Exec(`UPDATE user_telegram_bots SET status = $2, last_error = $3, checked_at = NOW() WHERE user_id = $1`, userID, status, lastError)
	return err
}

// ownNotifyAllowedSQL is true for an account whose plan (the trial plan while a trial runs) includes bringing its own
// notification bot, and which is active and not suspended for an ended plan; the account id is the argument at that position
const ownNotifyAllowedSQL = `EXISTS (
	SELECT 1 FROM user_plans up
	JOIN hosting_plans p ON p.id = COALESCE(CASE WHEN up.trial_ends_at > NOW() THEN up.trial_plan_id END, up.plan_id)
	JOIN users u ON u.id = up.user_id
	WHERE up.user_id = %s AND p.own_notify AND u.status = 'active' AND NOT up.suspended_for_expiry)`

// OwnNotifyAllowed says whether the plan of an account includes bringing its own notification bot
func (m *Manager) OwnNotifyAllowed(userID int64) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	var ok bool
	err := m.db.QueryRow(`SELECT `+fmt.Sprintf(ownNotifyAllowedSQL, "$1"), userID).Scan(&ok)
	return ok, err
}

// ListUserTelegramBotsToRead lists the bots worth reading: on, the plan allows them, and something waits for them (a link
// or a chat that may answer "stop")
func (m *Manager) ListUserTelegramBotsToRead() ([]UserTelegramBot, error) {
	if !m.IsConnected() {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := m.db.Query(`SELECT ` + botColumns + ` FROM user_telegram_bots b WHERE b.enabled AND ` + fmt.Sprintf(ownNotifyAllowedSQL, "b.user_id") + `
		AND EXISTS (SELECT 1 FROM notification_recipients r WHERE r.user_id = b.user_id AND r.kind = 'telegram' AND (r.own_bot OR r.link_code <> ''))
		ORDER BY b.user_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []UserTelegramBot
	for rows.Next() {
		b, err := scanBot(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

// CompleteNotifyLinkOwn finishes the link of one account through its own bot: only that account's code counts, and the chat
// is marked as reachable by that bot only
func (m *Manager) CompleteNotifyLinkOwn(userID int64, code, address string) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	res, err := m.db.Exec(`
		UPDATE notification_recipients
		SET address = $3, verified_at = NOW(), blocked_at = NULL, link_code = '', link_expires_at = NULL, own_bot = true, updated_at = NOW()
		WHERE user_id = $1 AND kind = 'telegram' AND link_code = $2 AND link_code <> '' AND link_expires_at > NOW()
	`, userID, code, address)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// UserTelegramBotTaken says whether another account already uses the bot with this username
func (m *Manager) UserTelegramBotTaken(userID int64, username string) (bool, error) {
	if !m.IsConnected() {
		return false, fmt.Errorf("database not connected")
	}
	var taken bool
	err := m.db.QueryRow(`SELECT EXISTS (SELECT 1 FROM user_telegram_bots WHERE user_id <> $1 AND LOWER(bot_username) = LOWER($2))`, userID, username).Scan(&taken)
	return taken, err
}
