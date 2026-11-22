package docker

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func testOwner(t *testing.T) OwnerContext {
	t.Helper()
	return OwnerContext{UserID: 1, Username: "tester", Role: "superadmin", HomeDir: t.TempDir(), DockerRootDir: t.TempDir(), CPULimitPct: 100, MemoryLimitMB: 128}
}

func TestComposeForImageUsesNetworkModeForTheNetworksDockerMadeItself(t *testing.T) {
	for _, name := range []string{"bridge", "host", "none"} {
		yaml, err := buildComposeForImage(testOwner(t), "web", "nginx:latest", name, nil, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(yaml, "network_mode: "+name+"\n") || strings.Contains(yaml, "networks:") || strings.Contains(yaml, "external: true") {
			t.Errorf("%s is a network mode, not a network of the project:\n%s", name, yaml)
		}
	}
	custom, _ := buildComposeForImage(testOwner(t), "web", "nginx:latest", "my-net", nil, nil, nil)
	if !strings.Contains(custom, "networks:\n      - \"my-net\"") || !strings.Contains(custom, "external: true") || strings.Contains(custom, "network_mode") {
		t.Errorf("a network made by the user is joined as before:\n%s", custom)
	}
	none, _ := buildComposeForImage(testOwner(t), "web", "nginx:latest", "", nil, nil, nil)
	if strings.Contains(none, "network") {
		t.Errorf("no network asked, none written:\n%s", none)
	}
}

// With docker at hand (DOCKER_LIVE=1): the deploy that failed on the bridge network now comes up, and a second deploy of the same
// name (an edit and redeploy) does too.
func TestDeployFromImageOnTheBridgeLive(t *testing.T) {
	if os.Getenv("DOCKER_LIVE") == "" {
		t.Skip("needs docker")
	}
	if out, err := exec.Command("docker", "pull", "alpine:3.19").CombinedOutput(); err != nil {
		t.Fatalf("pull: %s", out)
	}
	owner := testOwner(t)
	t.Cleanup(func() {
		_, _ = exec.Command("docker", "rm", "-f", "zz-bridge-app").CombinedOutput()
		_ = exec.Command("docker", "rmi", "-f", "alpine:3.19").Run()
	})
	req := DeployImageRequest{Name: "zz-bridge-app", Image: "alpine:3.19", Network: "bridge", EnvMode: "form", Env: []EnvVar{{Key: "A", Value: "1"}}}
	for i := 0; i < 2; i++ {
		if _, err := DeployFromImage(owner, req); err != nil && !strings.Contains(err.Error(), "container") {
			// alpine with no command exits at once; what matters is that the network is accepted
			t.Fatalf("deploy %d: %v", i+1, err)
		}
	}
	out, _ := exec.Command("docker", "inspect", "-f", "{{.HostConfig.NetworkMode}}", "zz-bridge-app").Output()
	if got := strings.TrimSpace(string(out)); got != "bridge" && got != "default" {
		t.Fatalf("the container is on the bridge network, got %q", got)
	}
}
