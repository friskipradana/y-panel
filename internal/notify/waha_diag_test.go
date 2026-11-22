package notify

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func fakeDocker(t *testing.T, inspect, logs string, inspectErr error) {
	t.Helper()
	original := DockerRun
	DockerRun = func(_ context.Context, _ []string, args ...string) (string, error) {
		switch args[0] {
		case "inspect":
			return inspect, inspectErr
		case "logs":
			return logs, nil
		}
		return "", nil
	}
	t.Cleanup(func() { DockerRun = original })
}

func TestAContainerThatIsOnlyBootingIsNotAFailure(t *testing.T) {
	started := time.Now().Add(-10 * time.Second).UTC().Format(time.RFC3339Nano)
	fakeDocker(t, "running|0|"+started, "", nil)
	d := (&Service{}).diagnoseWaha(context.Background())
	if !d.known || !d.booting(time.Now()) {
		t.Fatalf("a container started ten seconds ago is booting: %+v", d)
	}
	// the same container a long time later, still not answering, is a problem
	if d.booting(time.Now().Add(5 * time.Minute)) {
		t.Fatal("after a few minutes it is no longer booting")
	}
}

func TestAContainerThatStoppedSaysHowItEnded(t *testing.T) {
	started := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)
	fakeDocker(t, "exited|137|"+started, "\x1b[32mINFO\x1b[39m starting\n\n\x1b[31mERROR\x1b[39m out of memory\n", nil)
	d := (&Service{}).diagnoseWaha(context.Background())
	if d.booting(time.Now()) {
		t.Fatal("a container that stopped is not booting")
	}
	if got := d.describe(); !strings.Contains(got, "stopped") || !strings.Contains(got, "137") {
		t.Fatalf("the exit code is said: %q", got)
	}
	if strings.Contains(d.logs, "\x1b") || !strings.Contains(d.logs, "ERROR out of memory") || strings.Count(d.logs, "\n") != 1 {
		t.Fatalf("the log is plain and one line to a line: %q", d.logs)
	}
	restarting := wahaDiagnosis{known: true, status: "restarting", exitCode: 1}
	if !strings.Contains(restarting.describe(), "keeps restarting") {
		t.Fatalf("a crash loop says so: %q", restarting.describe())
	}
}

func TestWithoutDockerNothingIsKnown(t *testing.T) {
	fakeDocker(t, "", "", errors.New("docker: executable file not found"))
	d := (&Service{}).diagnoseWaha(context.Background())
	if d.known || d.booting(time.Now()) || d.describe() != "" {
		t.Fatalf("an unreadable container is unknown, never booting: %+v", d)
	}
	fakeDocker(t, "garbage", "", nil)
	if (&Service{}).diagnoseWaha(context.Background()).known {
		t.Fatal("output that cannot be read is unknown")
	}
}

func TestTheTailKeepsTheLastLines(t *testing.T) {
	var log strings.Builder
	for i := 1; i <= 30; i++ {
		log.WriteString("line " + string(rune('a'+i%26)) + "\n")
	}
	if n := strings.Count(tailText(log.String(), 12), "\n") + 1; n != 12 {
		t.Fatalf("twelve lines, got %d", n)
	}
}
