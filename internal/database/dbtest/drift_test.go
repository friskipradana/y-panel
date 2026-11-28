package dbtest

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"sort"
	"testing"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
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
		// text and varchar behave the same here; which one a table got depends on who made it first
		if typ == "character varying" {
			typ = "text"
		}
		out[tbl+"."+col] = typ + "/" + nullable
	}
	return out
}

// A new install runs the migrations before the agent ever starts (the installer). The schema is made partly by the migrations and
// partly by the agent bootstrap (ensureSchema), so neither may depend on something only the other makes: both orders must work and
// end with the same schema.
func TestBothStartOrdersBuildTheSameSchema(t *testing.T) {
	admin := os.Getenv("REN_TEST_DATABASE_URL")
	if admin == "" {
		t.Skip("REN_TEST_DATABASE_URL is not set")
	}
	// agent bootstrap first, then the migrations
	agentFirst := New(t).DB()

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

	// the installer order: migrations on the empty database, then the agent starts
	migrate, err := migrations.Open(u.String())
	if err != nil {
		t.Fatal(err)
	}
	defer migrate.Close()
	if err := migrations.Up(migrate); err != nil {
		t.Fatalf("migrations on an empty database: %v", err)
	}
	m := database.New(database.Config{Enabled: true, DSN: u.String()})
	defer m.Close()
	if !m.IsConnected() || m.Status().LastError != "" {
		t.Fatalf("agent start on a migrated database: %+v", m.Status())
	}

	want, got := columns(t, agentFirst), columns(t, m.DB())
	var differ []string
	for k, v := range want {
		if got[k] != v {
			differ = append(differ, fmt.Sprintf("%s agentFirst=%s installer=%s", k, v, got[k]))
		}
	}
	for k, v := range got {
		if _, ok := want[k]; !ok {
			differ = append(differ, fmt.Sprintf("%s only after installer order (%s)", k, v))
		}
	}
	sort.Strings(differ)
	if len(differ) > 0 {
		t.Errorf("schemas differ (%d): %v", len(differ), differ)
	}
}
