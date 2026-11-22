package docker

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// With docker at hand (DOCKER_LIVE=1): an old image under the tag of a newer one is updated, and the compose container is made again.
func TestUpdateContainerLive(t *testing.T) {
	if os.Getenv("DOCKER_LIVE") == "" {
		t.Skip("needs docker")
	}
	run := func(args ...string) string {
		out, err := exec.Command("docker", args...).CombinedOutput()
		if err != nil {
			t.Fatalf("docker %v: %s", args, out)
		}
		return strings.TrimSpace(string(out))
	}
	run("pull", "alpine:3.18")
	run("tag", "alpine:3.18", "alpine:3.19")
	dir := t.TempDir()
	compose := filepath.Join(dir, "compose.yml")
	if err := os.WriteFile(compose, []byte("services:\n  app:\n    image: alpine:3.19\n    container_name: zz-upd-app\n    command: sleep 600\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("docker", "compose", "-f", compose, "-p", "zzupd", "up", "-d")
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("compose up: %s", out)
	}
	t.Cleanup(func() {
		down := exec.Command("docker", "compose", "-f", compose, "-p", "zzupd", "down")
		down.Dir = dir
		_, _ = down.CombinedOutput()
		_, _ = exec.Command("docker", "rmi", "-f", "alpine:3.19", "alpine:3.18").CombinedOutput()
	})
	oldID := run("inspect", "-f", "{{.Id}}", "zz-upd-app")

	var events []UpdateEvent
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	if err := UpdateContainer(ctx, run("inspect", "-f", "{{.Id}}", "zz-upd-app"), func(e UpdateEvent) { events = append(events, e) }); err != nil {
		t.Fatal(err)
	}
	var logs, statuses int
	var done *UpdateEvent
	for i := range events {
		switch events[i].Type {
		case "log":
			logs++
		case "status":
			statuses++
		case "done":
			done = &events[i]
		}
	}
	if logs < 3 || statuses < 2 || done == nil || done.Changed == nil || !*done.Changed || done.Recreated == nil || !*done.Recreated {
		t.Fatalf("a download, a new container and its state were expected: %+v", events)
	}
	if run("inspect", "-f", "{{.Id}}", "zz-upd-app") == oldID {
		t.Fatal("the container was not made again")
	}
	if state := run("inspect", "-f", "{{.State.Status}}", "zz-upd-app"); state != "running" {
		t.Fatalf("the new container runs, got %s", state)
	}

	// a second update finds nothing new and leaves the container alone
	newID := run("inspect", "-f", "{{.Id}}", "zz-upd-app")
	events = nil
	if err := UpdateContainer(ctx, run("inspect", "-f", "{{.Id}}", "zz-upd-app"), func(e UpdateEvent) { events = append(events, e) }); err != nil {
		t.Fatal(err)
	}
	if run("inspect", "-f", "{{.Id}}", "zz-upd-app") != newID {
		t.Fatal("nothing new, so the container must stay")
	}
}
