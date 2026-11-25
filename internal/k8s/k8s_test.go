package k8s

import (
	"strings"
	"testing"
)

func TestParseKubeconfigMeta(t *testing.T) {
	valid := `
apiVersion: v1
kind: Config
clusters:
- name: prod
  cluster:
    server: https://10.0.0.5:6443
users:
- name: admin
`
	srv, err := ParseKubeconfigMeta(valid)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if srv != "https://10.0.0.5:6443" {
		t.Fatalf("got server %q", srv)
	}
	if _, err := ParseKubeconfigMeta("not a kubeconfig"); err == nil {
		t.Fatal("expected error for invalid kubeconfig")
	}
}

func TestBuildProjectManifest(t *testing.T) {
	manifest, name, ns, err := BuildProjectManifest(ProjectDeploySpec{
		Name:        "My App_Web",
		Namespace:   "production",
		Image:       "nginx:alpine",
		Port:        8080,
		Replicas:    2,
		ServiceType: "NodePort",
		Env:         map[string]string{"NODE_ENV": "production"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if name != "my-app-web" || ns != "production" {
		t.Fatalf("unexpected name/ns: %q / %q", name, ns)
	}
	for _, want := range []string{"kind: Deployment", "kind: Service", "replicas: 2", "containerPort: 8080", "type: NodePort", "NODE_ENV"} {
		if !strings.Contains(manifest, want) {
			t.Errorf("manifest missing %q:\n%s", want, manifest)
		}
	}
}

func TestValidationHelpers(t *testing.T) {
	if !ValidNamespace("kube-system") || ValidNamespace("../etc") || ValidNamespace("BAD_NS") {
		t.Fatal("ValidNamespace failed")
	}
	if !ValidResourceName("api-server-1.pod") || ValidResourceName("bad;rm -rf") {
		t.Fatal("ValidResourceName failed")
	}
	if k, ok := NormalizeKind("Deployment"); !ok || k != "deployment" {
		t.Fatal("NormalizeKind failed")
	}
}

func TestGenerateDockerfile(t *testing.T) {
	dir := t.TempDir()
	staticDF := GenerateDockerfile(dir, "static", true, "", 80)
	if !strings.Contains(staticDF, "FROM nginx:alpine") || !strings.Contains(staticDF, "/index.html;") {
		t.Fatalf("unexpected static SPA Dockerfile:\n%s", staticDF)
	}
	nodeDF := GenerateDockerfile(dir, "nodejs", false, "node server.js", 3000)
	if !strings.Contains(nodeDF, "FROM node:20-alpine") || !strings.Contains(nodeDF, "node server.js") {
		t.Fatalf("unexpected node Dockerfile:\n%s", nodeDF)
	}
}
