package migrations

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

// scratchDB makes an empty database on the server named by REN_TEST_DATABASE_URL and drops it when the test ends.
func scratchDB(t *testing.T) *sql.DB {
	t.Helper()
	admin := os.Getenv("REN_TEST_DATABASE_URL")
	if admin == "" {
		t.Skip("REN_TEST_DATABASE_URL is not set")
	}
	adminDB, err := sql.Open("postgres", admin)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("reneo_mig_%d", time.Now().UnixNano())
	if _, err := adminDB.Exec(`CREATE DATABASE ` + name); err != nil {
		t.Fatalf("cannot create the test database: %v", err)
	}
	u, err := url.Parse(admin)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	db, err := Open(u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = db.Close()
		_, _ = adminDB.Exec(`DROP DATABASE IF EXISTS ` + name + ` WITH (FORCE)`)
		_ = adminDB.Close()
	})
	return db
}

func TestUpFromEmptyThenDownThenUp(t *testing.T) {
	db := scratchDB(t)
	if err := Up(db); err != nil {
		t.Fatalf("up: %v", err)
	}
	latest, err := Version(db)
	if err != nil {
		t.Fatal(err)
	}
	versions, err := listEmbeddedMigrationVersions()
	if err != nil {
		t.Fatal(err)
	}
	if want := versions[len(versions)-1]; latest != want {
		t.Fatalf("version after up = %d, want %d", latest, want)
	}
	// every Down must undo its Up, so the chain can be rolled back one by one; version 1 is left in place, because dropping the base
	// tables is not a rollback any install wants and tables made by the agent bootstrap hang on them
	for i := len(versions) - 1; i >= 1; i-- {
		if err := Down(db); err != nil {
			t.Fatalf("down from version %d: %v", versions[i], err)
		}
	}
	if err := Up(db); err != nil {
		t.Fatalf("up again after rolling back to version 1: %v", err)
	}
}

// A database whose schema is already there but whose version table was lost (restored dump, manual repair) must still migrate:
// every statement has to tolerate objects that exist.
func TestUpOverExistingSchema(t *testing.T) {
	db := scratchDB(t)
	if err := Up(db); err != nil {
		t.Fatalf("up: %v", err)
	}
	if _, err := db.Exec(`DELETE FROM goose_db_version WHERE version_id > 0`); err != nil {
		t.Fatal(err)
	}
	if err := Up(db); err != nil {
		t.Fatalf("up over a schema that already exists: %v", err)
	}
}
