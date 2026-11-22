//go:build linux

package terminal

import (
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestApplyLinuxPTYAttrsUsesChildStdinFD(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "pts-mock")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer func() { _ = f.Close() }()

	if f.Fd() <= 2 {
		t.Fatalf("expected parent fd > 2, got %d", f.Fd())
	}

	cmd := exec.Command("/bin/sh", "-c", "true")
	applyLinuxPTYAttrs(cmd, f)

	if cmd.SysProcAttr == nil {
		t.Fatal("expected SysProcAttr to be initialized")
	}
	if !cmd.SysProcAttr.Setsid || !cmd.SysProcAttr.Setctty {
		t.Fatalf("expected Setsid and Setctty true, got %+v", cmd.SysProcAttr)
	}
	if cmd.SysProcAttr.Ctty != 0 {
		t.Fatalf("expected Ctty = 0 (child Stdin FD), got %d (parent pts fd=%d)", cmd.SysProcAttr.Ctty, f.Fd())
	}
}

func TestInjectSystemdRunIdentity(t *testing.T) {
	in := []string{"systemd-run", "--quiet", "--scope", "--slice=reneo-u1.slice", "--", "/bin/bash", "-i"}
	got := injectSystemdRunIdentity(in, "1001", "1001")
	want := []string{"systemd-run", "--quiet", "--scope", "--slice=reneo-u1.slice", "--uid=1001", "--gid=1001", "--", "/bin/bash", "-i"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestStartPTYWithHighParentFD(t *testing.T) {
	// Open extra files so ptmx/pts receive parent FDs well above 2.
	var blockers []*os.File
	tmpDir := t.TempDir()
	for i := 0; i < 12; i++ {
		f, err := os.Create(filepath.Join(tmpDir, "fd-blocker"))
		if err != nil {
			t.Fatalf("open blocker file: %v", err)
		}
		blockers = append(blockers, f)
	}
	defer func() {
		for _, f := range blockers {
			_ = f.Close()
		}
	}()

	cmd := exec.Command("/bin/sh", "-c", "printf pty-ok")
	ptmx, err := startPTY(cmd, "", 80, 24)
	if err != nil {
		t.Fatalf("startPTY failed: %v", err)
	}
	defer func() { _ = ptmx.Close() }()

	out, _ := io.ReadAll(ptmx)
	_ = cmd.Wait()
	if !strings.Contains(string(out), "pty-ok") {
		t.Fatalf("expected pty output to contain pty-ok, got %q", string(out))
	}
}

