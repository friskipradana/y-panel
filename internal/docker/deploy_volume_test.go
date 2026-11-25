package docker

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveVolumeHostPathRoleScope(t *testing.T) {
	homeDir := t.TempDir()
	hostMount := filepath.Join(filepath.Dir(homeDir), "opt-browser-config")

	superOwner := OwnerContext{Role: "superadmin", HomeDir: homeDir}
	got, err := resolveVolumeHostPath(superOwner, hostMount)
	if err != nil {
		t.Fatalf("expected superadmin to mount host path %q, got err: %v", hostMount, err)
	}
	if got != filepath.Clean(hostMount) {
		t.Fatalf("got %q want %q", got, filepath.Clean(hostMount))
	}

	userOwner := OwnerContext{Role: "user", HomeDir: homeDir}
	if _, err := resolveVolumeHostPath(userOwner, hostMount); err == nil || !strings.Contains(err.Error(), "berada di luar root user") {
		t.Fatalf("expected non-superadmin host mount to be rejected, got err=%v", err)
	}
}
