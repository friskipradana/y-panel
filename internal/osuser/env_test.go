package osuser

import (
	"os/exec"
	"runtime"
	"strings"
	"testing"
)

func TestBaseEnvLeaksNothing(t *testing.T) {
	t.Setenv("PANEL_SESSION_SECRET", "top-secret")
	t.Setenv("PANEL_DATABASE_URL", "postgres://user:pw@db/panel")
	env := BaseEnv("TERM=xterm-256color")
	joined := strings.Join(env, "\n")
	for _, secret := range []string{"top-secret", "postgres://", "PANEL_"} {
		if strings.Contains(joined, secret) {
			t.Fatalf("the base environment carries %q:\n%s", secret, joined)
		}
	}
	if !strings.Contains(joined, "PATH=/usr/local/sbin") || !strings.Contains(joined, "TERM=xterm-256color") {
		t.Fatalf("path or extras missing:\n%s", joined)
	}
}

func TestWrapCommandWithoutEnvDoesNotInherit(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("accounts are mapped on linux only")
	}
	t.Setenv("PANEL_SESSION_SECRET", "top-secret")
	wrapped, err := WrapCommand(exec.Command("/bin/sh", "-c", "true"), "panel-test")
	if err != nil {
		t.Fatal(err)
	}
	if wrapped.Env == nil {
		t.Fatal("a nil environment would make the child inherit the agent's")
	}
	if strings.Contains(strings.Join(wrapped.Env, "\n"), "top-secret") {
		t.Fatal("the agent's secret reached the child")
	}
}
