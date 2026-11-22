package httpserver

import (
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func TestOwnerScopeRoles(t *testing.T) {
	s := &Server{}

	super := s.ownerScopeFor(&database.User{ID: 1, Role: auth.SuperadminRole})
	if !super.all || !super.has(999) {
		t.Fatal("superadmin must see every account")
	}

	// without a database an admin falls back to itself: never wider than its subtree
	admin := s.ownerScopeFor(&database.User{ID: 2, Role: auth.AdminRole})
	if admin.all || !admin.has(2) || admin.has(3) {
		t.Fatalf("admin scope should be itself only here, got %+v", admin)
	}

	user := s.ownerScopeFor(&database.User{ID: 5, Role: auth.UserRole})
	if user.all || !user.has(5) || user.has(2) {
		t.Fatalf("user scope should be itself, got %+v", user)
	}

	none := s.ownerScopeFor(nil)
	if none.all || none.has(0) {
		t.Fatal("no actor, no scope")
	}
}

func TestUserRoleCapabilities(t *testing.T) {
	for _, c := range []string{auth.CapabilityTerminalAccess, auth.CapabilityFilesWrite, auth.CapabilityDockerDeploy, auth.CapabilityDockerLifecycle} {
		if !auth.HasCapability(auth.UserRole, c) {
			t.Errorf("user should have %s", c)
		}
	}
	for _, c := range []string{auth.CapabilitySystemSettingsWrite, auth.CapabilityTerminalRemote, auth.CapabilityDatabaseTruncate, auth.CapabilityPanelPrimaryReset} {
		if auth.HasCapability(auth.UserRole, c) || auth.HasCapability(auth.AdminRole, c) {
			t.Errorf("%s must stay with the superadmin", c)
		}
	}
}
