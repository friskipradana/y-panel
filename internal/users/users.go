// Package users provides user management, quota management, and
// per-user Cloudflare configuration for Reneo.
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

// Quota limits keep a typo from granting or removing capacity by orders of magnitude.
const (
	maxQuotaProjects  = 1000
	maxQuotaTunnels   = 1000
	maxQuotaDatabases = 200
	maxQuotaDiskMB    = 100 * 1024 * 1024
	maxQuotaCPUPct    = 6400
	maxQuotaMemoryMB  = 4 * 1024 * 1024
)

// ValidateQuota rejects negative or absurd quota values.
func ValidateQuota(q database.UserQuota) error {
	switch {
	case q.MaxProjects < 0 || q.MaxProjects > maxQuotaProjects:
		return fmt.Errorf("maxProjects must be between 0 and %d", maxQuotaProjects)
	case q.MaxTunnels < 0 || q.MaxTunnels > maxQuotaTunnels:
		return fmt.Errorf("maxTunnels must be between 0 and %d", maxQuotaTunnels)
	case q.MaxDatabases < 0 || q.MaxDatabases > maxQuotaDatabases:
		return fmt.Errorf("maxDatabases must be between 0 and %d", maxQuotaDatabases)
	case q.DiskQuotaMB < 0 || q.DiskQuotaMB > maxQuotaDiskMB:
		return fmt.Errorf("diskQuotaMb must be between 0 and %d", maxQuotaDiskMB)
	case q.CPULimitPct < 1 || q.CPULimitPct > maxQuotaCPUPct:
		return fmt.Errorf("cpuLimitPct must be between 1 and %d", maxQuotaCPUPct)
	case q.MemoryLimitMB < 0 || q.MemoryLimitMB > maxQuotaMemoryMB:
		return fmt.Errorf("memoryLimitMb must be between 0 and %d", maxQuotaMemoryMB)
	}
	return nil
}

var (
	ErrCannotManageSelf = errors.New("you cannot change your own role or status, or delete yourself")
	ErrInsufficientRole = errors.New("your role cannot manage this account")
	ErrRoleNotGrantable = errors.New("your role cannot assign this role")
)

// CanManage decides whether an actor may suspend, delete, reset the password of or
// edit the target. Superadmin manages everyone; admin manages plain users only.
// selfOK allows harmless self-edits (display name, password).
func CanManage(actorID int64, actorRole string, target *database.User, selfOK bool) error {
	if target == nil {
		return errors.New("user not found")
	}
	if target.ID == actorID {
		if selfOK {
			return nil
		}
		return ErrCannotManageSelf
	}
	if actorRole == "superadmin" {
		return nil
	}
	if actorRole == "admin" && target.Role == "user" {
		return nil
	}
	return ErrInsufficientRole
}

// CanAssignRole limits which roles an actor may hand out: only the superadmin
// grants admin, and nobody grants superadmin through this path.
func CanAssignRole(actorRole, newRole string) error {
	switch newRole {
	case "user":
		return nil
	case "admin":
		if actorRole == "superadmin" {
			return nil
		}
	}
	return ErrRoleNotGrantable
}
