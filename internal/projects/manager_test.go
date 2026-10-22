package projects

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func unixOnly(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("projects run under sh and process groups")
	}
}

func customProject(t *testing.T, id int64, script string) *database.Project {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "start.sh"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return &database.Project{ID: id, ProjectType: "custom", WorkingDir: dir, AssignedPort: 0}
}

func TestStopEndsTheWholeGroup(t *testing.T) {
	unixOnly(t)
	m := NewManager(t.TempDir())
	p := customProject(t, 1, "#!/bin/sh\nsleep 60 &\nwait\n")
	if err := m.Start(nil, p); err != nil {
		t.Fatal(err)
	}
	if !m.Snapshot(p.ID, "active").Running {
		t.Fatal("a started project should be running")
	}
	if err := m.Stop(p.ID); err != nil {
		t.Fatal(err)
	}
	if m.Snapshot(p.ID, "stopped").Running {
		t.Fatal("a stopped project should not be running")
	}
}

func TestStartTwiceKeepsOneProcess(t *testing.T) {
	unixOnly(t)
	m := NewManager(t.TempDir())
	p := customProject(t, 2, "#!/bin/sh\nexec sleep 60\n")
	if err := m.Start(nil, p); err != nil {
		t.Fatal(err)
	}
	defer m.Stop(p.ID)
	m.mu.RLock()
	first := m.procs[procKey(p.ID)]
	m.mu.RUnlock()
	if err := m.Start(nil, p); err != nil {
		t.Fatal(err)
	}
	m.mu.RLock()
	second := m.procs[procKey(p.ID)]
	m.mu.RUnlock()
	if first != second {
		t.Fatal("a second start must not launch another process")
	}
}

func TestEarlyExitIsAnErrorWithTheLog(t *testing.T) {
	unixOnly(t)
	m := NewManager(t.TempDir())
	p := customProject(t, 3, "#!/bin/sh\necho boom-from-the-app\nexit 3\n")
	ready, err := m.StartAndWait(nil, p, 5*time.Second)
	if ready || err == nil {
		t.Fatalf("ready=%v err=%v, want a failed start", ready, err)
	}
	if !strings.Contains(err.Error(), "boom-from-the-app") {
		t.Fatalf("the error should carry the end of the log, got %q", err)
	}
	if m.Snapshot(p.ID, "active").Running {
		t.Fatal("a project that failed to start must not be left supervised")
	}
}

func TestCrashedProjectIsStartedAgain(t *testing.T) {
	unixOnly(t)
	m := NewManager(t.TempDir())
	marker := filepath.Join(t.TempDir(), "runs")
	p := customProject(t, 4, "#!/bin/sh\necho x >> "+marker+"\nif [ $(wc -l < "+marker+") -lt 2 ]; then exit 1; fi\nexec sleep 60\n")
	if err := m.Start(nil, p); err != nil {
		t.Fatal(err)
	}
	defer m.Stop(p.ID)
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		if data, _ := os.ReadFile(marker); strings.Count(string(data), "x") >= 2 {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("the project was not started again after it ended on its own")
}

func TestReadLogReturnsTheTail(t *testing.T) {
	m := NewManager(t.TempDir())
	for i := 0; i < 5; i++ {
		m.logLine(9, "line %d", i)
	}
	lines, err := m.ReadLog(9, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 || !strings.HasSuffix(lines[1], "line 4") {
		t.Fatalf("got %v", lines)
	}
	m.RemoveLog(9)
	if lines, _ := m.ReadLog(9, 5); len(lines) != 0 {
		t.Fatalf("a removed log should read empty, got %v", lines)
	}
}

func TestRunnable(t *testing.T) {
	for _, kind := range []string{"static", "nodejs", "python", "php", "custom"} {
		if !Runnable(kind) {
			t.Errorf("%s should be runnable", kind)
		}
	}
	for _, kind := range []string{"docker", "proxy", ""} {
		if Runnable(kind) {
			t.Errorf("%q should not be runnable", kind)
		}
	}
}
