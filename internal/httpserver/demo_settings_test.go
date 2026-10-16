package httpserver

import (
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
)

func TestDemoSettingsFollowFileOverEnv(t *testing.T) {
	s := &Server{cfg: config.Config{StateDir: t.TempDir(), DemoPassword: "from-env-pass", DemoUsername: "demo"}}

	if got, stored := s.loadDemoSettings(); !got.Enabled || stored {
		t.Fatalf("env only: enabled=%v stored=%v", got.Enabled, stored)
	}
	if s.demoUsername() != "demo" {
		t.Fatalf("expected demo name while on, got %q", s.demoUsername())
	}

	if err := s.saveDemoSettings(demoSettings{Enabled: false, Provisioned: true, Username: "demo", Password: "from-env-pass"}); err != nil {
		t.Fatal(err)
	}
	if s.demoUsername() != "" {
		t.Fatalf("switched off: demoUsername should be empty, got %q", s.demoUsername())
	}
	if s.demoLockedName() != "demo" {
		t.Fatalf("switched off: the account must stay locked, got %q", s.demoLockedName())
	}
}

func TestDemoNotLockedWithoutDemo(t *testing.T) {
	s := &Server{cfg: config.Config{StateDir: t.TempDir()}}
	if s.demoUsername() != "" || s.demoLockedName() != "" {
		t.Fatal("no demo configured: nothing may be locked")
	}
}

func TestRandomDemoPasswordIsValid(t *testing.T) {
	pw, err := randomDemoPassword()
	if err != nil || len(pw) != 16 {
		t.Fatalf("password %q err %v", pw, err)
	}
}
