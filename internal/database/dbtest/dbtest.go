// Package dbtest gives tests a throwaway PostgreSQL database with every migration applied.
package dbtest

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/database/migrations"
)

// New creates a database on the server named by REN_TEST_DATABASE_URL (for example
// postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable), applies the migrations and drops it when the test ends.
// Without the variable the test is skipped.
func New(t *testing.T) *database.Manager {
	t.Helper()
	admin := os.Getenv("REN_TEST_DATABASE_URL")
	if admin == "" {
		t.Skip("REN_TEST_DATABASE_URL is not set")
	}
	adminDB, err := sql.Open("postgres", admin)
	if err != nil {
		t.Fatal(err)
	}
	// the clock alone is not enough: packages run in parallel, and on Windows two can read the same instant
	suffix := make([]byte, 4)
	_, _ = rand.Read(suffix)
	name := fmt.Sprintf("reneo_test_%d_%s", time.Now().UnixNano(), hex.EncodeToString(suffix))
	if _, err := adminDB.Exec(`CREATE DATABASE ` + name); err != nil {
		t.Fatalf("cannot create the test database: %v", err)
	}
	u, err := url.Parse(admin)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	m := database.New(database.Config{Enabled: true, DSN: u.String()})
	if !m.IsConnected() {
		t.Fatalf("test database not connected: %v", m.Status())
	}
	// the schema comes from the migrations, the way the agent applies it at start
	migDB, err := migrations.Open(u.String())
	if err != nil {
		t.Fatal(err)
	}
	if err := migrations.Up(migDB); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	_ = migDB.Close()
	t.Cleanup(func() {
		_ = m.Close()
		_, _ = adminDB.Exec(`DROP DATABASE IF EXISTS ` + name + ` WITH (FORCE)`)
		_ = adminDB.Close()
	})
	return m
}
