package httpserver

import (
	"testing"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
)

func TestDatabaseAccessKey(t *testing.T) {
	s := &Server{cfg: config.Config{EncryptionKey: "k1"}}
	a, b := s.databaseAccessKey(1), s.databaseAccessKey(2)
	if len(a) != dbAccessKeyLen || a == b {
		t.Fatalf("keys must be fixed length and distinct: %q %q", a, b)
	}
	if a != s.databaseAccessKey(1) {
		t.Fatal("key must be stable for an ID")
	}
	other := &Server{cfg: config.Config{EncryptionKey: "k2"}}
	if other.databaseAccessKey(1) == a {
		t.Fatal("key must depend on the secret")
	}
}
