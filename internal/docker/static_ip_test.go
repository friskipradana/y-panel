package docker

import (
	"strings"
	"testing"
)

func TestBuildComposeForImageWithStaticIP(t *testing.T) {
	owner := OwnerContext{UserID: 1, Username: "admin", Role: "superadmin", HomeDir: t.TempDir(), DockerRootDir: t.TempDir()}
	yml, err := buildComposeForImage(owner, "browser", "jlesage/firefox:latest", "reneo-static", "172.28.0.10", nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !strings.Contains(yml, "ipv4_address: \"172.28.0.10\"") {
		t.Fatalf("expected ipv4_address in compose yaml, got:\n%s", yml)
	}
	if !strings.Contains(yml, "external: true") {
		t.Fatalf("expected external network declaration, got:\n%s", yml)
	}
}

func TestValidateStaticIPAssignment(t *testing.T) {
	netName, ip, err := ValidateStaticIPAssignment("", "172.28.0.15")
	if err != nil || netName != DefaultStaticNetwork || ip != "172.28.0.15" {
		t.Fatalf("got (%q, %q, %v)", netName, ip, err)
	}
	if _, _, err := ValidateStaticIPAssignment("host", "172.28.0.15"); err == nil {
		t.Fatalf("expected host network with static IP to be rejected")
	}
	if _, _, err := ValidateStaticIPAssignment("reneo-static", "not-an-ip"); err == nil {
		t.Fatalf("expected invalid IPv4 to be rejected")
	}
}
