package database

import (
	"database/sql"
	"net/url"
	"os"
	"strings"
	"testing"
)

// Changing the password of the role the panel uses must change it in PostgreSQL, or the next start cannot connect.
// Skipped without REN_TEST_DATABASE_URL.
func TestChangePasswordChangesTheRoleInPostgres(t *testing.T) {
	admin := os.Getenv("REN_TEST_DATABASE_URL")
	if admin == "" {
		t.Skip("REN_TEST_DATABASE_URL is not set")
	}
	adminDB, err := sql.Open("postgres", admin)
	if err != nil {
		t.Fatal(err)
	}
	defer adminDB.Close()
	// a role and a database of its own, so the test touches nothing else on the server
	name := "rot_" + strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(t.Name(), "/", "_"), "Test", ""))[:12]
	role := name
	_, _ = adminDB.Exec(`DROP DATABASE IF EXISTS ` + name + ` WITH (FORCE)`)
	_, _ = adminDB.Exec(`DROP ROLE IF EXISTS ` + role)
	if _, err := adminDB.Exec(`CREATE ROLE ` + role + ` SUPERUSER LOGIN PASSWORD 'old-secret-1'`); err != nil {
		t.Fatal(err)
	}
	if _, err := adminDB.Exec(`CREATE DATABASE ` + name + ` OWNER ` + role); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, _ = adminDB.Exec(`DROP DATABASE IF EXISTS ` + name + ` WITH (FORCE)`)
		_, _ = adminDB.Exec(`DROP ROLE IF EXISTS ` + role)
	}()

	u, _ := url.Parse(admin)
	u.Path = "/" + name
	u.User = url.UserPassword(role, "old-secret-1")
	m := New(Config{Enabled: true, DSN: u.String()})
	if !m.IsConnected() {
		t.Fatalf("not connected: %v", m.Status())
	}
	defer m.Close()

	var before string
	if err := adminDB.QueryRow(`SELECT rolpassword FROM pg_authid WHERE rolname = $1`, role).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if err := m.ChangePassword("new-secret-2"); err != nil {
		t.Fatal(err)
	}
	if m.Password() != "new-secret-2" {
		t.Fatalf("the panel keeps the new password: %q", m.Password())
	}
	// a connection made now (the pool is flushed) authenticates with the new password
	m.db.SetMaxIdleConns(0)
	m.db.SetMaxIdleConns(5)
	var one int
	if err := m.db.QueryRow(`SELECT 1`).Scan(&one); err != nil || one != 1 {
		t.Fatalf("the panel still reaches its database: %v", err)
	}
	// the role itself has another password now (a test server may trust every connection, so the stored hash is what shows it)
	var after string
	if err := adminDB.QueryRow(`SELECT rolpassword FROM pg_authid WHERE rolname = $1`, role).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if after == "" || after == before {
		t.Fatalf("the role keeps its old password in PostgreSQL: %q", after)
	}
}
