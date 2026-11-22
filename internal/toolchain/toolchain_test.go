package toolchain

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestCleanKeepsGoodChoicesAndRefusesBadOnes(t *testing.T) {
	good, err := Prefs{
		Path:  []string{" ~/bin ", "$HOME/tools/bin", "/opt/custom/bin", ""},
		Env:   map[string]string{"NODE_ENV": "production", "API_URL": "https://x.test/a b"},
		Shell: "alias ll='ls -la'\r\n\r\n",
	}.Clean()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(good.Path, "|") != "~/bin|~/tools/bin|/opt/custom/bin" || good.Shell != "alias ll='ls -la'" {
		t.Fatalf("normalised choices: %+v", good)
	}
	for name, bad := range map[string]Prefs{
		"relative folder":   {Path: []string{"bin"}},
		"folder with a dot": {Path: []string{"~/../etc"}},
		"folder with quote": {Path: []string{`/x";rm -rf /;"`}},
		"bad key":           {Env: map[string]string{"1BAD": "x"}},
		"reserved PATH":     {Env: map[string]string{"PATH": "/x"}},
		"reserved preload":  {Env: map[string]string{"LD_PRELOAD": "/x.so"}},
		"newline in value":  {Env: map[string]string{"A": "x\ny"}},
		"huge shell":        {Shell: strings.Repeat("x", maxShellBytes+1)},
	} {
		if _, err := bad.Clean(); err == nil {
			t.Errorf("%s must be refused", name)
		}
	}
}

func TestEnvScriptQuotesAndKeepsTheOrder(t *testing.T) {
	script := EnvScript(Prefs{Path: []string{"~/extra"}, Env: map[string]string{"MSG": "it's fine; $(not run)"}, Shell: "alias a=b"})
	for _, want := range []string{
		`export MSG='it'\''s fine; $(not run)'`,
		`export NPM_CONFIG_PREFIX="$HOME/.reneo/npm-global"`,
		`reneo_path_add "$HOME/extra"`,
		"alias a=b",
	} {
		if !strings.Contains(script, want) {
			t.Errorf("missing %q in:\n%s", want, script)
		}
	}
	// the tool folders are added after the extra ones, so they come first on the PATH
	if strings.Index(script, `reneo_path_add "$HOME/extra"`) > strings.Index(script, `reneo_path_add "$HOME/.reneo/bin"`) {
		t.Fatalf("order of the PATH:\n%s", script)
	}
}

func TestEnvForPutsTheToolsFirstAndAddsTheVariables(t *testing.T) {
	home := t.TempDir()
	if err := os.MkdirAll(filepath.Join(home, ".reneo"), 0o755); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(Prefs{Path: []string{"~/mine"}, Env: map[string]string{"FOO": "bar"}})
	if err := os.WriteFile(filepath.Join(home, ".reneo", "toolchain.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	env := EnvFor([]string{"PATH=/usr/bin:/bin", "LANG=C.UTF-8"}, home)
	joined := strings.Join(env, "\n")
	if runtime.GOOS == "windows" {
		t.Skip("the preferences are read on linux")
	}
	for _, want := range []string{"FOO=bar", "BUN_INSTALL=" + filepath.Join(home, ".bun"), "NPM_CONFIG_PREFIX=" + filepath.Join(home, ".reneo", "npm-global"), "LANG=C.UTF-8"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in %v", want, env)
		}
	}
	var path string
	for _, e := range env {
		if strings.HasPrefix(e, "PATH=") {
			path = e
		}
	}
	if !strings.HasPrefix(path, "PATH="+filepath.Join(home, ".reneo", "bin")+":") || !strings.HasSuffix(path, ":/usr/bin:/bin") || !strings.Contains(path, filepath.Join(home, "mine")) {
		t.Fatalf("the PATH starts with the tools and ends with what was there: %s", path)
	}
}

func TestResolveCommandPrefersTheAccountsOwnTool(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("needs unix modes")
	}
	home := t.TempDir()
	bin := filepath.Join(home, ".reneo", "node", "current", "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bin, "node"), []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bin, "notexec"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := ResolveCommand("node", home); got != filepath.Join(bin, "node") {
		t.Fatalf("got %q", got)
	}
	for _, name := range []string{"npm", "notexec", "", "/usr/bin/node", "../node"} {
		if got := ResolveCommand(name, home); got != "" {
			t.Errorf("%q must not resolve, got %q", name, got)
		}
	}
}

func TestPrefsAreNotReadThroughALinkOutOfTheHome(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlinks need privileges on windows")
	}
	home := t.TempDir()
	secret := filepath.Join(t.TempDir(), "secret.json")
	_ = os.WriteFile(secret, []byte(`{"path":[],"env":{"STOLEN":"yes"},"shell":""}`), 0o600)
	_ = os.MkdirAll(filepath.Join(home, ".reneo"), 0o755)
	if err := os.Symlink(secret, filepath.Join(home, ".reneo", "toolchain.json")); err != nil {
		t.Fatal(err)
	}
	if prefs := LoadPrefs(home); len(prefs.Env) != 0 {
		t.Fatalf("a link out of the home must not be followed: %+v", prefs)
	}
}

func TestResolveNode(t *testing.T) {
	var releases []nodeRelease
	_ = json.Unmarshal([]byte(`[
		{"version":"v25.1.0","lts":false},
		{"version":"v24.11.0","lts":"Krypton"},
		{"version":"v22.20.0","lts":"Jod"},
		{"version":"v22.11.0","lts":"Jod"},
		{"version":"v20.19.0","lts":"Iron"}]`), &releases)
	for spec, want := range map[string]string{"": "v24.11.0", "lts": "v24.11.0", "latest": "v25.1.0", "22": "v22.20.0", "22.11": "v22.11.0", "v22.11.0": "v22.11.0", "20": "v20.19.0"} {
		got, err := ResolveNode(spec, releases)
		if err != nil || got != want {
			t.Errorf("%q: got %q, %v; want %s", spec, got, err, want)
		}
	}
	if _, err := ResolveNode("2", releases); err == nil {
		t.Error("2 is not a release line: v22 must not match v2")
	}
	if _, err := ResolveNode("99", releases); err == nil {
		t.Error("an unknown version is refused")
	}
}

func TestValidVersion(t *testing.T) {
	for spec, want := range map[string]bool{"": true, "lts": true, "LATEST": true, "22": true, "v22.1": true, "1.2.3": true, "1.2.3.4": false, "x": false, "1; rm": false, "$(id)": false} {
		if ValidVersion(spec) != want {
			t.Errorf("%q: want %v", spec, want)
		}
	}
}

// localRunner runs scripts with bash as the current user, in a home of its own (no account is made)
func localRunner(home string) Runner {
	return func(ctx context.Context, script string, env []string, emit func(string)) error {
		cmd := exec.CommandContext(ctx, "bash", "-c", script)
		cmd.Dir = home
		cmd.Env = EnvFor(append([]string{"PATH=/usr/local/bin:/usr/bin:/bin", "HOME=" + home, "LANG=C.UTF-8"}, env...), home)
		out := &lineSplitter{emit: emit}
		cmd.Stdout, cmd.Stderr = out, out
		err := cmd.Run()
		out.flush()
		return err
	}
}

type lineSplitter struct {
	emit func(string)
	buf  []byte
}

func (w *lineSplitter) Write(p []byte) (int, error) {
	for _, b := range p {
		if b == '\n' || b == '\r' {
			w.flush()
			continue
		}
		w.buf = append(w.buf, b)
	}
	return len(p), nil
}

func (w *lineSplitter) flush() {
	if line := strings.TrimSpace(string(w.buf)); line != "" {
		w.emit(line)
	}
	w.buf = w.buf[:0]
}

func TestApplyWritesTheFilesAndHooksTheShellOnce(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("needs bash")
	}
	home := t.TempDir()
	_ = os.WriteFile(filepath.Join(home, ".bashrc"), []byte("# my bashrc\nalias x=y\n"), 0o644)
	run := localRunner(home)
	prefs := Prefs{Path: []string{"~/mine"}, Env: map[string]string{"HELLO": "world"}, Shell: "alias hi='echo hi'"}
	for i := 0; i < 2; i++ {
		if err := Apply(context.Background(), run, prefs); err != nil {
			t.Fatal(err)
		}
	}
	rc, _ := os.ReadFile(filepath.Join(home, ".bashrc"))
	if strings.Count(string(rc), "reneo toolchain >>>") != 1 || !strings.HasPrefix(string(rc), "# >>> reneo toolchain >>>") || !strings.Contains(string(rc), "alias x=y") {
		t.Fatalf("the hook is added once, at the top, and the rc is kept:\n%s", rc)
	}
	if profile, _ := os.ReadFile(filepath.Join(home, ".profile")); !strings.Contains(string(profile), "reneo toolchain >>>") {
		t.Fatal(".profile is hooked too")
	}
	// a new shell sees the tools, the folder, the variable and the alias
	out, err := exec.Command("env", "HOME="+home, "bash", "-c", `. "$HOME/.reneo/env.sh"; echo "$PATH|$HELLO|$NPM_CONFIG_PREFIX"; alias hi`).CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	line := string(out)
	if !strings.Contains(line, filepath.Join(home, ".reneo", "node", "current", "bin")) || !strings.Contains(line, "|world|") || !strings.Contains(line, filepath.Join(home, "mine")) {
		t.Fatalf("env.sh does its work: %s", line)
	}
	if got := LoadPrefs(home); got.Env["HELLO"] != "world" || len(got.Path) != 1 {
		t.Fatalf("the choices are kept: %+v", got)
	}
}

// With bash, curl and the network at hand (TOOLCHAIN_LIVE=1): the real installs, in a home of their own.
func TestInstallRemoveLive(t *testing.T) {
	if os.Getenv("TOOLCHAIN_LIVE") == "" {
		t.Skip("needs the network")
	}
	home := t.TempDir()
	run := localRunner(home)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	defer cancel()
	var log []string
	emit := func(l string) { log = append(log, l) }
	if err := Apply(ctx, run, Prefs{}); err != nil {
		t.Fatal(err)
	}
	for _, step := range []struct{ tool, version string }{{"node", "22"}, {"pm2", ""}, {"uv", ""}, {"bun", ""}} {
		if err := Install(ctx, run, step.tool, step.version, emit); err != nil {
			t.Fatalf("install %s: %v\n%s", step.tool, err, strings.Join(log, "\n"))
		}
	}
	statuses, checks, err := Inspect(ctx, run, home)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]Status{}
	for _, s := range statuses {
		got[s.ID] = s
	}
	for _, id := range []string{"node", "pm2", "uv", "bun"} {
		if !got[id].Installed || got[id].Source != "personal" || got[id].Version == "" {
			t.Errorf("%s should be installed in the home: %+v", id, got[id])
		}
	}
	if !strings.HasPrefix(got["node"].Version, "22.") {
		t.Errorf("node 22 was asked for: %s", got["node"].Version)
	}
	if len(checks) == 0 {
		t.Error("the checks of the system are listed")
	}
	for _, id := range []string{"pm2", "node", "uv", "bun"} {
		if err := Remove(ctx, run, id, emit); err != nil {
			t.Fatalf("remove %s: %v", id, err)
		}
	}
	statuses, _, _ = Inspect(ctx, run, home)
	for _, s := range statuses {
		if (s.ID == "node" || s.ID == "pm2" || s.ID == "uv" || s.ID == "bun") && s.Source == "personal" {
			t.Errorf("%s was removed but is still found: %+v", s.ID, s)
		}
	}
}
