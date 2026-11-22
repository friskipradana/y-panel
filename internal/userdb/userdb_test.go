package userdb

import (
	"strings"
	"testing"
)

func TestValidateName(t *testing.T) {
	for _, ok := range []string{"shop-db", "abc", "orders2"} {
		if err := ValidateName(ok); err != nil {
			t.Errorf("%q rejected: %v", ok, err)
		}
	}
	for _, bad := range []string{"", "ab", "Shop", "1db", "a_b", "has space", "x;rm", strings.Repeat("a", 40)} {
		if ValidateName(bad) == nil {
			t.Errorf("%q must be rejected", bad)
		}
	}
}

func TestValidateVersionRejectsRegistryAndDigest(t *testing.T) {
	for _, bad := range []string{"evil.io/img:1", "sha256:abc", "latest --privileged", "a b"} {
		if ValidateVersion(bad) == nil {
			t.Errorf("%q must be rejected", bad)
		}
	}
	if ValidateVersion("16-alpine") != nil || ValidateVersion("") != nil {
		t.Error("plain tags must pass")
	}
}

func TestRunArgsBindLocalhostAndHideSecrets(t *testing.T) {
	engine, _ := Lookup("postgres")
	spec := Spec{ID: 7, OwnerID: 3, Engine: engine, HostPort: 20001, Database: "shop", User: "shop", Password: "S3cretValue", MemoryMB: 512, CPULimit: 1}
	joined := strings.Join(spec.RunArgs(), " ")
	if !strings.Contains(joined, "127.0.0.1:20001:5432") {
		t.Fatalf("database must bind to localhost only: %s", joined)
	}
	if strings.Contains(joined, "S3cretValue") {
		t.Fatalf("password must not appear in docker arguments: %s", joined)
	}
	for _, want := range []string{"--name reneo-db-7", "reneo.owner=3", "panel.owner_id=3", "panel.source=database", "--memory 512m", "postgres:16.9", "-e POSTGRES_PASSWORD"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in %s", want, joined)
		}
	}
}

func TestRedisPasswordNotInArgs(t *testing.T) {
	engine, _ := Lookup("redis")
	spec := Spec{ID: 9, OwnerID: 1, Engine: engine, HostPort: 20002, Password: "RedisSecret1"}
	joined := strings.Join(spec.RunArgs(), " ")
	if strings.Contains(joined, "RedisSecret1") {
		t.Fatalf("redis password leaked into arguments: %s", joined)
	}
	if !strings.Contains(joined, `--requirepass "$REDIS_PASSWORD"`) {
		t.Fatalf("redis must read the password from its environment: %s", joined)
	}
}

func TestRandomPasswordLength(t *testing.T) {
	a, err := RandomPassword(24)
	if err != nil || len(a) != 24 {
		t.Fatalf("got %q err=%v", a, err)
	}
	b, _ := RandomPassword(24)
	if a == b {
		t.Fatal("two passwords must differ")
	}
}
