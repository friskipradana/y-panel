// Package auth provides multi-user authentication backed by PostgreSQL.
// Sessions are persisted in the database so they survive agent restarts.
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/osuser"
)

const (
	bcryptCost     = 12
	SuperadminRole = "superadmin"
	AdminRole      = "admin"
	UserRole       = "user"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserSuspended      = errors.New("account suspended")
	ErrUserNotFound       = errors.New("user not found")
)

// Manager handles multi-user authentication operations.
type Manager struct {
	db  *database.Manager
	ttl time.Duration
}

// NewManager creates an auth Manager using the given database and session TTL.
func NewManager(db *database.Manager, ttl time.Duration) *Manager {
	return &Manager{db: db, ttl: ttl}
}

// HasUsers reports whether at least one user exists.
func (m *Manager) HasUsers() bool {
	if m == nil || m.db == nil {
		return false
	}
	return m.db.HasUsers()
}

// Login validates credentials and returns a session token.
func (m *Manager) Login(username, password, ip, ua string) (string, *database.User, error) {
	username = strings.TrimSpace(username)
	if username == "" || password == "" {
		return "", nil, ErrInvalidCredentials
	}

	u, err := m.db.GetUserByUsername(username)
	if err != nil || u == nil {
		// Also try by email
		u, err = m.db.GetUserByEmail(username)
		if err != nil || u == nil {
			return "", nil, ErrInvalidCredentials
		}
	}

	if u.Status == "suspended" {
		return "", nil, ErrUserSuspended
	}

	hash, err := m.db.GetUserPasswordHash(u.ID)
	if err != nil {
		return "", nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return "", nil, ErrInvalidCredentials
	}

	token, err := randomToken(32)
	if err != nil {
		return "", nil, fmt.Errorf("token generation failed: %w", err)
	}

	if err := m.db.CreateSession(u.ID, token, ip, ua, m.ttl); err != nil {
		return "", nil, fmt.Errorf("session create failed: %w", err)
	}

	m.db.TouchUserLogin(u.ID)
	m.db.CleanExpiredSessions()

	return token, u, nil
}

// Validate checks a session token and returns the authenticated user.
func (m *Manager) Validate(token string) (*database.User, bool) {
	if token == "" {
		return nil, false
	}
	return m.db.GetSessionUser(token)
}

// Logout invalidates a session token.
func (m *Manager) Logout(token string) {
	m.db.DeleteSession(token)
}

// CreateUser creates a new user (for admin-driven user creation).
func (m *Manager) CreateUser(username, email, password, role, displayName string) (*database.User, error) {
	username = strings.TrimSpace(username)
	email = strings.TrimSpace(strings.ToLower(email))
	if username == "" || email == "" || password == "" {
		return nil, errors.New("username, email, and password are required")
	}
	if !isValidRole(role) {
		role = UserRole
	}
	hash, err := HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash failed: %w", err)
	}
	u, err := m.db.CreateUser(username, email, hash, role, displayName)
	if err != nil {
		return nil, err
	}
	if _, err := osuser.EnsureUser(u.Username, u.DisplayName); err != nil {
		return u, fmt.Errorf("user created in panel, but OS account provisioning failed: %w", err)
	}
	return u, nil
}

// ChangePassword updates a user's password after verifying the current one.
func (m *Manager) ChangePassword(userID int64, currentPassword, newPassword string) error {
	hash, err := m.db.GetUserPasswordHash(userID)
	if err != nil {
		return ErrUserNotFound
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(currentPassword)); err != nil {
		return errors.New("current password is incorrect")
	}
	newHash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	return m.db.UpdateUserPasswordHash(userID, newHash)
}

// ResetPassword sets a new password for any user (admin operation, no current password required).
func (m *Manager) ResetPassword(userID int64, newPassword string) error {
	newHash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	return m.db.UpdateUserPasswordHash(userID, newHash)
}

// IsAdmin returns true if the user has admin or superadmin role.
func IsAdmin(role string) bool {
	return role == AdminRole || role == SuperadminRole
}

// IsSuperAdmin returns true only for superadmin role.
func IsSuperAdmin(role string) bool {
	return role == SuperadminRole
}

// HasRole checks if a role string is at least the required level.
// Order: user < admin < superadmin
func HasRole(userRole, requiredRole string) bool {
	levels := map[string]int{
		UserRole:       1,
		AdminRole:      2,
		SuperadminRole: 3,
	}
	return levels[userRole] >= levels[requiredRole]
}

// HashPassword hashes a password with bcrypt.
func HashPassword(password string) (string, error) {
	if len(password) < 8 {
		return "", errors.New("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func isValidRole(role string) bool {
	return role == UserRole || role == AdminRole || role == SuperadminRole
}

func randomToken(length int) (string, error) {
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
