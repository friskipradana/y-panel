// Package users provides user management, quota management, and
// per-user Cloudflare configuration for ServerPanel Pro.
package users

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

var (
	usernameRe = regexp.MustCompile(`^[a-z0-9_-]{3,30}$`)
	emailRe    = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
)

// ValidateUsername checks that a username meets panel naming rules.
func ValidateUsername(username string) error {
	if !usernameRe.MatchString(username) {
		return errors.New("username must be 3–30 characters, lowercase letters, numbers, hyphens, or underscores only")
	}
	return nil
}

// ValidateEmail checks that an email address looks valid.
func ValidateEmail(email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if !emailRe.MatchString(email) {
		return errors.New("invalid email address")
	}
	return nil
}

// ValidatePassword enforces minimum password requirements.
func ValidatePassword(password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	return nil
}

// SuspendUser sets a user's status to 'suspended'.
func SuspendUser(db *database.Manager, id int64) error {
	if db == nil {
		return fmt.Errorf("database not available")
	}
	return db.UpdateUser(id, map[string]any{"status": "suspended"})
}

// ActivateUser sets a user's status to 'active'.
func ActivateUser(db *database.Manager, id int64) error {
	if db == nil {
		return fmt.Errorf("database not available")
	}
	return db.UpdateUser(id, map[string]any{"status": "active"})
}
