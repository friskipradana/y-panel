package dbtest

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"sort"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database/migrations"
)

func columns(t *testing.T, db *sql.DB) map[string]string {
	t.Helper()
	rows, err := db.Query(`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var tbl, col, typ, nullable string
		if err := rows.Scan(&tbl, &col, &typ, &nullable); err != nil {
			t.Fatal(err)
		}
		out[tbl+"."+col] = typ + "/" + nullable
	}
	return out
}

// A new install runs the migrations before the agent ever starts, so the migrations alone must build every table and column that the
// agent's own schema bootstrap (ensureSchema) would have made. Anything listed here exists only in the bootstrap.
func TestMigrationsAloneBuildTheWholeSchema(t *testing.T) {
	admin := os.Getenv("REN_TEST_DATABASE_URL")
	if admin == "" {
		t.Skip("REN_TEST_DATABASE_URL is not set")
	}
	withBootstrap := New(t).DB()

	adminDB, err := sql.Open("postgres", admin)
	if err != nil {
		t.Fatal(err)
	}
	defer adminDB.Close()
	name := fmt.Sprintf("reneo_drift_%d", time.Now().UnixNano())
	if _, err := adminDB.Exec(`CREATE DATABASE ` + name); err != nil {
		t.Fatal(err)
	}
	defer adminDB.Exec(`DROP DATABASE IF EXISTS ` + name + ` WITH (FORCE)`)
	u, _ := url.Parse(admin)
	u.Path = "/" + name
	migOnly, err := migrations.Open(u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer migOnly.Close()
	if err := migrations.Up(migOnly); err != nil {
		t.Fatalf("migrations on an empty database: %v", err)
	}

	want, got := columns(t, withBootstrap), columns(t, migOnly)
	var missing, differ []string
	for k, v := range want {
		g, ok := got[k]
		switch {
		case !ok:
			missing = append(missing, k)
		case g != v:
			differ = append(differ, k+" migrations="+g+" bootstrap="+v)
		}
	}
	sort.Strings(missing)
	sort.Strings(differ)
	if len(missing) > 0 {
		t.Errorf("missing after migrations only (%d): %v", len(missing), missing)
	}
	if len(differ) > 0 {
		t.Errorf("different after migrations only (%d): %v", len(differ), differ)
	}
}
