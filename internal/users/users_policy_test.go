package users

import (
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestCanManage(t *testing.T) {
	user := &database.User{ID: 3, Role: "user"}
	admin := &database.User{ID: 2, Role: "admin"}
	root := &database.User{ID: 1, Role: "superadmin"}

	cases := []struct {
		name      string
		actorID   int64
		actorRole string
		target    *database.User
		selfOK    bool
		wantErr   bool
	}{
		{"admin manages user", 2, "admin", user, false, false},
		{"admin cannot manage admin", 2, "admin", &database.User{ID: 9, Role: "admin"}, false, true},
		{"admin cannot manage superadmin", 2, "admin", root, false, true},
		{"superadmin manages admin", 1, "superadmin", admin, false, false},
		{"self destructive blocked", 1, "superadmin", root, false, true},
		{"self harmless allowed", 2, "admin", admin, true, false},
		{"user cannot manage anyone", 3, "user", &database.User{ID: 4, Role: "user"}, false, true},
	}
	for _, c := range cases {
		err := CanManage(c.actorID, c.actorRole, c.target, c.selfOK)
		if (err != nil) != c.wantErr {
			t.Errorf("%s: err=%v wantErr=%v", c.name, err, c.wantErr)
		}
	}
}

func TestCanAssignRole(t *testing.T) {
	if CanAssignRole("admin", "admin") == nil {
		t.Error("admin must not grant admin")
	}
	if CanAssignRole("superadmin", "superadmin") == nil {
		t.Error("nobody grants superadmin here")
	}
	if CanAssignRole("superadmin", "admin") != nil || CanAssignRole("admin", "user") != nil {
		t.Error("valid grants rejected")
	}
}

func TestValidateQuota(t *testing.T) {
	ok := database.UserQuota{MaxProjects: 5, MaxTunnels: 5, DiskQuotaMB: 5120, CPULimitPct: 100, MemoryLimitMB: 512}
	if err := ValidateQuota(ok); err != nil {
		t.Fatalf("valid quota rejected: %v", err)
	}
	bad := ok
	bad.MaxProjects = -1
	if ValidateQuota(bad) == nil {
		t.Error("negative maxProjects accepted")
	}
	bad = ok
	bad.CPULimitPct = 0
	if ValidateQuota(bad) == nil {
		t.Error("zero cpu limit accepted")
	}
}
