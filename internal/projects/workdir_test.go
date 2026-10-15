package projects

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestResolveWorkingDirConfinesToHome(t *testing.T) {
	home := t.TempDir()
	inside := filepath.Join(home, "project", "site")
	got, inHome, err := ResolveWorkingDir(inside, home, false)
	if err != nil || !inHome {
		t.Fatalf("inside home rejected: dir=%q inHome=%v err=%v", got, inHome, err)
	}

	outside := t.TempDir()
	if _, _, err := ResolveWorkingDir(outside, home, false); err == nil {
		t.Fatal("a directory outside home must be refused for regular users")
	}
	if _, _, err := ResolveWorkingDir("relative/path", home, true); err == nil {
		t.Fatal("relative paths must be refused")
	}
}

func TestResolveWorkingDirBlocksSystemRoots(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("system roots are Linux paths")
	}
	home := t.TempDir()
	for _, bad := range []string{"/", "/etc", "/etc/sudoers.d", "/root/.ssh", "/opt/reneo/state", "/var/lib/postgresql"} {
		if _, _, err := ResolveWorkingDir(bad, home, true); err == nil {
			t.Errorf("%q must be refused even for the superadmin", bad)
		}
	}
}

func TestResolveWorkingDirFollowsSymlinks(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need privileges on Windows")
	}
	home := t.TempDir()
	elsewhere := t.TempDir()
	link := filepath.Join(home, "escape")
	if err := os.Symlink(elsewhere, link); err != nil {
		t.Skip("cannot create symlink:", err)
	}
	if _, inHome, err := ResolveWorkingDir(filepath.Join(link, "app"), home, false); err == nil && inHome {
		t.Fatal("a symlink out of home must not count as inside home")
	}
}

func TestRuntimeEnvDropsAgentSecrets(t *testing.T) {
	t.Setenv("PANEL_SESSION_SECRET", "s3cret")
	t.Setenv("PANEL_DATABASE_DSN", "postgres://x")
	t.Setenv("RENEO_DEMO_PASSWORD", "demo")
	env := strings.Join(RuntimeEnv(10001), "\n")
	for _, leaked := range []string{"PANEL_", "RENEO_", "s3cret", "postgres://"} {
		if strings.Contains(env, leaked) {
			t.Fatalf("project environment leaks %q", leaked)
		}
	}
	if !strings.Contains(env, "PORT=10001") {
		t.Fatal("PORT missing")
	}
}
