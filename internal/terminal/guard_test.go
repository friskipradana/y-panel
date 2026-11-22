package terminal

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func TestValidSSHTarget(t *testing.T) {
	good := []string{"example.com", "root@example.com", "deploy_1@10.0.0.5", "a-b.c@host-1.internal"}
	bad := []string{"", "-oProxyCommand=id", "-v", "user@-host", "a b", "host;id", "host$(id)", "host`id`", "user@host:22", "@host", "user@", "a@b@c", "host\nid", "../x"}
	for _, target := range good {
		if !validSSHTarget(target) {
			t.Errorf("%q should be accepted", target)
		}
	}
	for _, target := range bad {
		if validSSHTarget(target) {
			t.Errorf("%q should be refused", target)
		}
	}
}

func TestResolveCwdConfinesToHome(t *testing.T) {
	base := t.TempDir()
	home := filepath.Join(base, "home", "panel-a")
	other := filepath.Join(base, "home", "panel-b")
	for _, dir := range []string{filepath.Join(home, "app"), other} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	if got, err := resolveCwd(home, "", false); err != nil || got != home {
		t.Fatalf("empty request should give the home, got %q err=%v", got, err)
	}
	if _, err := resolveCwd(home, filepath.Join(home, "app"), false); err != nil {
		t.Fatalf("a folder inside the home should work: %v", err)
	}
	for _, request := range []string{other, base, "relative/path", filepath.Join(home, "missing"), filepath.Join(home, "..", "panel-b")} {
		_, err := resolveCwd(home, request, false)
		if err == nil {
			t.Errorf("%q must be refused for a regular account", request)
		} else if !errors.Is(err, ErrInvalid) {
			t.Errorf("%q: error should be ErrInvalid, got %v", request, err)
		}
	}
	if got, err := resolveCwd(home, other, true); err != nil || got == "" {
		t.Fatalf("the superadmin may use any folder: %v", err)
	}
}

func TestResolveCwdRefusesSymlinkOutOfHome(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need privileges on windows")
	}
	base := t.TempDir()
	home := filepath.Join(base, "home")
	secret := filepath.Join(base, "secret")
	for _, dir := range []string{home, secret} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	link := filepath.Join(home, "escape")
	if err := os.Symlink(secret, link); err != nil {
		t.Fatal(err)
	}
	if _, err := resolveCwd(home, link, false); err == nil {
		t.Fatal("a symlink that leaves the home must be refused")
	}
}

func TestClampSize(t *testing.T) {
	cols, rows := clampSize(1, 1)
	if cols != 20 || rows != 8 {
		t.Fatalf("minimum not applied: %d x %d", cols, rows)
	}
	cols, rows = clampSize(1<<30, 1<<30)
	if cols != maxCols || rows != maxRows {
		t.Fatalf("maximum not applied: %d x %d", cols, rows)
	}
}

func fakeSession(id string, owner int64) *Session {
	return &Session{id: id, owner: owner, cmd: &exec.Cmd{}}
}

func TestAuthorizeAndCloseOwned(t *testing.T) {
	m := &Manager{sessions: map[string]*Session{}}
	m.sessions["a1"] = fakeSession("a1", 1)
	m.sessions["a2"] = fakeSession("a2", 1)
	m.sessions["b1"] = fakeSession("b1", 2)

	if err := m.Authorize("a1", 1); err != nil {
		t.Fatalf("owner refused: %v", err)
	}
	// a foreign id answers like an unknown one
	foreign, missing := m.Authorize("a1", 2), m.Authorize("zzz", 2)
	if foreign == nil || missing == nil || foreign.Error() != missing.Error() {
		t.Fatalf("foreign=%v missing=%v", foreign, missing)
	}
	if m.Authorize("a1", 0) == nil {
		t.Fatal("an anonymous caller must never own a session")
	}

	if n := m.CloseOwned(1); n != 2 {
		t.Fatalf("closed %d sessions, want 2", n)
	}
	if _, err := m.get("a1"); err == nil {
		t.Fatal("a1 should be gone")
	}
	if _, err := m.get("b1"); err != nil {
		t.Fatal("another account's session must stay")
	}
}

func TestCheckCapacity(t *testing.T) {
	m := &Manager{sessions: map[string]*Session{}}
	for i := 0; i < maxSessionsPerOwner; i++ {
		id := string(rune('a' + i))
		m.sessions[id] = fakeSession(id, 1)
	}
	if err := m.checkCapacity(1); !errors.Is(err, ErrTooManySessions) {
		t.Fatalf("the owner is over the limit, got %v", err)
	}
	if err := m.checkCapacity(2); err != nil {
		t.Fatalf("another account is not affected: %v", err)
	}
}

func TestStartNeedsOwner(t *testing.T) {
	m := &Manager{sessions: map[string]*Session{}}
	if _, err := m.Start(StartRequest{PanelUsername: "x"}); err == nil {
		t.Fatal("a session without an owner must not start")
	}
	if _, err := m.Start(StartRequest{OwnerID: 1, PanelUsername: "x", Target: "-oProxyCommand=id"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("an option-like target must be refused, got %v", err)
	}
}
