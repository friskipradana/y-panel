package database

import (
	"context"
	"database/sql/driver"
	"errors"
	"net/url"
	"strings"
	"sync"

	"github.com/lib/pq"
)

// passwordConnector opens connections with the DSN it holds now, so the password of the role can change while the panel runs:
// connections made after the change use the new one, connections already open keep working.
type passwordConnector struct {
	mu  sync.RWMutex
	dsn string
}

func (c *passwordConnector) current() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.dsn
}

func (c *passwordConnector) Connect(ctx context.Context) (driver.Conn, error) {
	inner, err := pq.NewConnector(c.current())
	if err != nil {
		return nil, err
	}
	return inner.Connect(ctx)
}

func (c *passwordConnector) Driver() driver.Driver { return &pq.Driver{} }

// dsnWithPassword is the DSN with another password for the same role; only the URL form carries one that can be replaced
func dsnWithPassword(dsn, password string) (string, string, error) {
	parsed, err := url.Parse(dsn)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		return "", "", errors.New("the database address is not a postgres:// URL, so its password cannot be changed from here")
	}
	user := parsed.User.Username()
	if user == "" {
		return "", "", errors.New("the database address has no user")
	}
	parsed.User = url.UserPassword(user, password)
	return parsed.String(), user, nil
}

// ChangePassword gives the role the panel connects as a new password in PostgreSQL itself, and makes new connections use it.
// Changing only the configuration file would lock the panel out of its own database at the next restart.
func (m *Manager) ChangePassword(password string) error {
	if m == nil || m.db == nil || m.connector == nil {
		return errors.New("the database is not connected")
	}
	if strings.TrimSpace(password) == "" {
		return errors.New("the new password is empty")
	}
	next, user, err := dsnWithPassword(m.connector.current(), password)
	if err != nil {
		return err
	}
	if _, err := m.db.Exec(`ALTER ROLE ` + pq.QuoteIdentifier(user) + ` WITH PASSWORD ` + pq.QuoteLiteral(password)); err != nil {
		return err
	}
	m.connector.mu.Lock()
	m.connector.dsn = next
	m.connector.mu.Unlock()
	return nil
}

// Password is the one the panel connects with now, for putting it back when the configuration cannot be written
func (m *Manager) Password() string {
	if m == nil || m.connector == nil {
		return ""
	}
	parsed, err := url.Parse(m.connector.current())
	if err != nil || parsed.User == nil {
		return ""
	}
	password, _ := parsed.User.Password()
	return password
}
