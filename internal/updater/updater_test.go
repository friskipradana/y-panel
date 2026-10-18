package updater

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestCompare(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"3.4.0", "3.3.9", 1},
		{"v3.4.0", "3.4.0", 0},
		{"3.10.0", "3.9.0", 1},
		{"3.3.0", "3.4.0", -1},
		{"dev", "3.4.0", 0},
	}
	for _, c := range cases {
		if got := Compare(c.a, c.b); got != c.want {
			t.Errorf("Compare(%q,%q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestCheckReportsNewerRelease(t *testing.T) {
	calls := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(`{"tag_name":"v3.5.0","name":"v3.5.0","html_url":"https://example.test/r","body":"notes","published_at":"2026-10-15T00:00:00Z"}`))
	}))
	defer ts.Close()

	c := New()
	c.apiURL = ts.URL
	c.client = ts.Client()

	info := c.Check(context.Background(), "3.4.0", false)
	if !info.Available || info.Latest != "3.5.0" || info.Current != "3.4.0" || info.Notes != "notes" {
		t.Fatalf("info = %+v", info)
	}
	// second call is served from the cache
	c.Check(context.Background(), "3.4.0", false)
	if calls != 1 {
		t.Errorf("expected one upstream call, got %d", calls)
	}
	c.Check(context.Background(), "3.4.0", true)
	if calls != 2 {
		t.Errorf("force should refresh, calls=%d", calls)
	}
	if got := c.Check(context.Background(), "3.5.0", false); got.Available {
		t.Errorf("up to date reported as available: %+v", got)
	}
}

func TestCheckDisabledSkipsNetwork(t *testing.T) {
	t.Setenv("RENEO_UPDATE_CHECK", "false")
	c := New()
	c.apiURL = "http://127.0.0.1:1/never"
	info := c.Check(context.Background(), "3.4.0", true)
	if info.Enabled || info.Available || info.Latest != "" {
		t.Fatalf("disabled check returned %+v", info)
	}
}

func TestBuildCommandKeepsURLsOutOfScript(t *testing.T) {
	c := New()
	name, args, err := c.BuildCommand("v3.5.0", "/var/lib/reneo")
	if err != nil || name != "systemd-run" {
		t.Fatalf("name=%q err=%v", name, err)
	}
	joined := strings.Join(args, "\n")
	if !strings.Contains(joined, "releases/download/v3.5.0/reneo-installer.run") {
		t.Errorf("installer URL missing: %s", joined)
	}
	script := ""
	for i, a := range args {
		if a == "-c" && i+1 < len(args) {
			script = args[i+1]
		}
	}
	if strings.Contains(script, "github.com") || strings.Contains(script, "3.5.0") {
		t.Error("script text must not embed the URL or version")
	}

	for _, bad := range []string{"", "latest", "3.5", "3.5.0; reboot", "$(id)"} {
		if _, _, err := c.BuildCommand(bad, "/x"); err == nil {
			t.Errorf("version %q accepted", bad)
		}
	}
}

func TestInstallerURLLegacyAsset(t *testing.T) {
	c := New()
	url, _ := c.InstallerURL("0.22.0")
	if !strings.HasSuffix(url, "/ypanel-installer.run") {
		t.Errorf("pre-rename release should use the legacy asset: %s", url)
	}

	current, _ := c.InstallerURL("1.28.0")
	if !strings.HasSuffix(current, "/reneo-installer.run") {
		t.Errorf("renamed releases ship reneo-installer.run: %s", current)
	}
}

func TestSettleMarksDone(t *testing.T) {
	dir := t.TempDir()
	if err := writeState(dir, State{State: "running", From: "3.4.0", To: "3.5.0", StartedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	if got := Settle(dir, "3.4.0"); got.State != "running" {
		t.Errorf("still old version should stay running, got %s", got.State)
	}
	if got := Settle(dir, "3.5.0"); got.State != "done" {
		t.Errorf("new version should settle done, got %s", got.State)
	}
	if got := ReadState(dir); got.State != "done" {
		t.Errorf("state not persisted: %s", got.State)
	}
	_ = os.Remove(dir)
}
