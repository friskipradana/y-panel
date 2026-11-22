//go:build linux

package osuser

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/toolchain"
)

// As root, with useradd and runuser at hand (RENEO_ROOT_LIVE=1): a real account gets the hook in its rc files, writes its own
// files, and a command run for it finds its own tools first.
func TestAccountToolchainLive(t *testing.T) {
	if os.Getenv("RENEO_ROOT_LIVE") == "" || os.Geteuid() != 0 {
		t.Skip("needs root and RENEO_ROOT_LIVE=1")
	}
	mapped, err := EnsureUser("tclive", "Toolchain live test")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = exec.Command("userdel", "-r", mapped).Run() })
	home := ResolveHomeDir("tclive")

	run := func(ctx context.Context, script string, env []string, emit func(string)) error {
		cmd := exec.CommandContext(ctx, "/bin/bash", "-c", script)
		cmd.Dir = home
		cmd.Env = BaseEnv(env...)
		wrapped, err := WrapCommand(cmd, mapped)
		if err != nil {
			return err
		}
		out, err := wrapped.CombinedOutput()
		for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			if line != "" {
				emit(line)
			}
		}
		return err
	}
	if err := toolchain.Apply(context.Background(), run, toolchain.Prefs{Env: map[string]string{"GREETING": "hello"}, Path: []string{"~/own-bin"}}); err != nil {
		t.Fatal(err)
	}
	// the files are the account's own
	info, err := os.Stat(filepath.Join(home, ".reneo", "env.sh"))
	if err != nil {
		t.Fatal(err)
	}
	if owner := exec.Command("stat", "-c", "%U", filepath.Join(home, ".reneo", "env.sh")); owner != nil {
		out, _ := owner.Output()
		if strings.TrimSpace(string(out)) != mapped {
			t.Fatalf("env.sh belongs to %q, not to the account (%v)", strings.TrimSpace(string(out)), info.Mode())
		}
	}
	// a login shell of the account, as over ssh, finds the folders and the variable without the panel
	out, err := exec.Command("runuser", "-l", mapped, "-c", `echo "$PATH|$GREETING"`).CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	login := strings.TrimSpace(string(out))
	if !strings.Contains(login, filepath.Join(home, ".reneo", "node", "current", "bin")) || !strings.HasSuffix(login, "|hello") || !strings.Contains(login, filepath.Join(home, "own-bin")) {
		t.Fatalf("a login shell gets the tools: %s", login)
	}

	// the account's own node is the one a command called "node" runs
	bin := filepath.Join(home, ".reneo", "node", "current", "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bin, "node"), []byte("#!/bin/sh\necho my-own-node\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	_ = exec.Command("chown", "-R", mapped, filepath.Join(home, ".reneo")).Run()
	cmd := exec.Command("node", "--version")
	cmd.Env = BaseEnv()
	wrapped, err := WrapCommand(cmd, mapped)
	if err != nil {
		t.Fatal(err)
	}
	got, err := wrapped.CombinedOutput()
	if err != nil || strings.TrimSpace(string(got)) != "my-own-node" {
		t.Fatalf("the command must run the node of the account: %q, %v", got, err)
	}
	// and what a wrapped command sees on its PATH starts with the tools
	probe := exec.Command("/bin/sh", "-c", `echo "$PATH|$GREETING|$NPM_CONFIG_PREFIX"`)
	probe.Env = BaseEnv()
	wrappedProbe, _ := WrapCommand(probe, mapped)
	seen, _ := wrappedProbe.CombinedOutput()
	if !strings.HasPrefix(strings.TrimSpace(string(seen)), filepath.Join(home, ".reneo", "bin")+":") || !strings.Contains(string(seen), "|hello|") {
		t.Fatalf("the environment of a wrapped command: %s", seen)
	}
}
