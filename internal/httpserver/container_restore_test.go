package httpserver

import (
	"errors"
	"os"
	"os/exec"
	"strings"
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

func TestRestoreAfterFailedReplaceWithoutAPreviousContainerKeepsTheError(t *testing.T) {
	boom := errors.New("deploy failed")
	if got := restoreAfterFailedReplace(docker.OwnerContext{}, nil, boom); got != boom {
		t.Fatalf("nothing to put back, the error is unchanged: %v", got)
	}
	if got := restoreAfterFailedReplace(docker.OwnerContext{}, &docker.ContainerConfig{}, boom); got != boom {
		t.Fatalf("an empty config cannot be put back: %v", got)
	}
}

// With docker at hand (DOCKER_LIVE=1): an edit that fails after the old container was removed puts the old one back.
func TestRestoreAfterFailedReplaceLive(t *testing.T) {
	if os.Getenv("DOCKER_LIVE") == "" {
		t.Skip("needs docker")
	}
	owner := docker.OwnerContext{UserID: 1, Username: "tester", Role: "superadmin", HomeDir: t.TempDir(), DockerRootDir: t.TempDir(), CPULimitPct: 100, MemoryLimitMB: 128}
	if out, err := exec.Command("docker", "pull", "alpine:3.19").CombinedOutput(); err != nil {
		t.Fatalf("pull: %s", out)
	}
	t.Cleanup(func() {
		_, _ = exec.Command("docker", "rm", "-f", "zz-restore-app").CombinedOutput()
		_ = exec.Command("docker", "rmi", "-f", "alpine:3.19").Run()
	})
	original := docker.DeployImageRequest{Name: "zz-restore-app", Image: "alpine:3.19", Network: "bridge", EnvMode: "form", Env: []docker.EnvVar{{Key: "KEEP", Value: "yes"}}}
	if _, err := docker.DeployFromImage(owner, original); err != nil {
		t.Fatalf("first deploy: %v", err)
	}
	previous, err := docker.InspectContainerConfig("zz-restore-app")
	if err != nil {
		t.Fatal(err)
	}
	if err := docker.DeleteContainer("zz-restore-app", false, false); err != nil {
		t.Fatal(err)
	}
	got := restoreAfterFailedReplace(owner, previous, errors.New("the new deploy failed"))
	if got == nil || !strings.Contains(got.Error(), "put back as it was") {
		t.Fatalf("the error says the container was put back: %v", got)
	}
	out, err := exec.Command("docker", "inspect", "-f", "{{.Name}} {{.Config.Image}} {{range .Config.Env}}{{.}} {{end}}", "zz-restore-app").Output()
	if err != nil || !strings.Contains(string(out), "alpine:3.19") || !strings.Contains(string(out), "KEEP=yes") {
		t.Fatalf("the container is back with its image and environment: %q %v", out, err)
	}
}
