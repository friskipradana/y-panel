package runtimepath

import (
	"os"
	"testing"
)

func TestApplyEnvAliasesPrefersReneo(t *testing.T) {
	t.Setenv("PANEL_BIND_ADDR", "0.0.0.0:1111")
	t.Setenv("RENEO_BIND_ADDR", "127.0.0.1:2222")
	t.Setenv("RENEO_HOME", "/srv/reneo")
	os.Unsetenv("PANEL_HOME")

	ApplyEnvAliases()

	if got := os.Getenv("PANEL_BIND_ADDR"); got != "127.0.0.1:2222" {
		t.Errorf("PANEL_BIND_ADDR = %q, want the RENEO_ value", got)
	}
	if os.Getenv("PANEL_HOME") != "" {
		t.Error("RENEO_HOME is a runtimepath setting and must not become PANEL_HOME")
	}
	if got := InstallRoot(); got != "/srv/reneo" {
		t.Errorf("InstallRoot = %q", got)
	}
}

func TestGetenvFallsBackToLegacyPrefix(t *testing.T) {
	t.Setenv("PANEL_STATE_DIR", "/legacy/state")
	os.Unsetenv("RENEO_STATE_DIR")
	if got := StateDir(); got != "/legacy/state" {
		t.Errorf("StateDir = %q", got)
	}
	t.Setenv("RENEO_STATE_DIR", "/new/state")
	if got := StateDir(); got != "/new/state" {
		t.Errorf("StateDir with RENEO_ = %q", got)
	}
}

func TestResolveServiceAliasLeavesOtherUnits(t *testing.T) {
	t.Setenv("RENEO_SERVICE_NAME", "reneo-custom")
	if got := ResolveServiceAlias("ypanel"); got != "reneo-custom" {
		t.Errorf("alias = %q", got)
	}
	if got := ResolveServiceAlias("reneo.service"); got != "reneo-custom" {
		t.Errorf("alias .service = %q", got)
	}
	if got := ResolveServiceAlias("nginx"); got != "nginx" {
		t.Errorf("nginx = %q", got)
	}
}
