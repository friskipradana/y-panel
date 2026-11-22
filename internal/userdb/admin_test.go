package userdb

import (
	"strings"
	"testing"
)

func engineOf(t *testing.T, id string) Engine {
	t.Helper()
	e, ok := Lookup(id)
	if !ok {
		t.Fatalf("engine %s missing", id)
	}
	return e
}

func TestBuildCreateTablePostgres(t *testing.T) {
	sql, err := BuildCreateTable(engineOf(t, "postgres"), "orders", []Column{
		{Name: "id", Type: "bigint", PrimaryKey: true, AutoIncrement: true},
		{Name: "customer", Type: "varchar", Length: 120},
		{Name: "paid", Type: "boolean", Nullable: true, Default: "false"},
		{Name: "created_at", Type: "timestamp", Default: "CURRENT_TIMESTAMP"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`CREATE TABLE "orders"`, `"id" BIGSERIAL NOT NULL`, `VARCHAR(120)`, `PRIMARY KEY ("id")`, `DEFAULT CURRENT_TIMESTAMP`} {
		if !strings.Contains(sql, want) {
			t.Errorf("missing %q in:\n%s", want, sql)
		}
	}
}

func TestBuildCreateTableMySQLAutoIncrement(t *testing.T) {
	sql, err := BuildCreateTable(engineOf(t, "mysql"), "items", []Column{
		{Name: "id", Type: "integer", PrimaryKey: true, AutoIncrement: true},
		{Name: "data", Type: "json", Nullable: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sql, "`id` INTEGER AUTO_INCREMENT NOT NULL") || !strings.Contains(sql, "`data` JSON") {
		t.Fatalf("unexpected sql:\n%s", sql)
	}
}

func TestBuildCreateTableRejectsInjection(t *testing.T) {
	e := engineOf(t, "postgres")
	bad := []struct {
		name  string
		table string
		cols  []Column
	}{
		{"table", `users"; DROP TABLE x;--`, []Column{{Name: "a", Type: "text"}}},
		{"column", "t", []Column{{Name: `a" text); DROP TABLE y;--`, Type: "text"}}},
		{"type", "t", []Column{{Name: "a", Type: "text); DROP TABLE z;--"}}},
		{"default", "t", []Column{{Name: "a", Type: "text", Default: "x'); DROP TABLE q;--"}}},
		{"duplicate", "t", []Column{{Name: "a", Type: "text"}, {Name: "A", Type: "text"}}},
		{"empty", "t", nil},
	}
	for _, c := range bad {
		if _, err := BuildCreateTable(e, c.table, c.cols); err == nil {
			t.Errorf("%s injection was accepted", c.name)
		}
	}
}

func TestBuildCreateUserPresets(t *testing.T) {
	pg, err := BuildCreateUser(engineOf(t, "postgres"), "shop", "reporter", "S3curePass1", AccessRead)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(pg, "\n")
	if !strings.Contains(joined, `CREATE ROLE "reporter" LOGIN PASSWORD 'S3curePass1'`) || !strings.Contains(joined, "GRANT SELECT ON ALL TABLES") {
		t.Fatalf("postgres read preset wrong:\n%s", joined)
	}
	if strings.Contains(joined, "INSERT") {
		t.Fatalf("read preset must not grant writes:\n%s", joined)
	}

	my, err := BuildCreateUser(engineOf(t, "mariadb"), "shop", "writer", "S3curePass1", AccessWrite)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.Join(my, "\n"), "GRANT SELECT, INSERT, UPDATE, DELETE ON `shop`.* TO 'writer'@'%'") {
		t.Fatalf("mariadb write preset wrong: %v", my)
	}
}

func TestPasswordAndIdentifierValidation(t *testing.T) {
	for _, bad := range []string{"short", "has space 123", "quote'd1234", `back\slash1`, "semi;colon1", "$(cmd)12345", strings.Repeat("a", 70)} {
		if ValidatePassword(bad) == nil {
			t.Errorf("password %q must be rejected", bad)
		}
	}
	if ValidatePassword("Good-Pass_1.2") != nil {
		t.Error("valid password rejected")
	}
	for _, bad := range []string{"", "1abc", "a-b", "a b", "a;b", strings.Repeat("a", 64)} {
		if ValidateIdentifier(bad) == nil {
			t.Errorf("identifier %q must be rejected", bad)
		}
	}
}

func TestParseTSVUnescapesAndTruncates(t *testing.T) {
	out := []byte("id\tname\n1\ta\\tb\n2\t\\N\n3\tz\n")
	res := parseTSV(out, 2)
	if len(res.Columns) != 2 || len(res.Rows) != 2 || !res.Truncated {
		t.Fatalf("unexpected result %+v", res)
	}
	if res.Rows[0][1] != "a\tb" || res.Rows[1][1] != "NULL" {
		t.Fatalf("unescape failed: %+v", res.Rows)
	}
}

func TestParseCSV(t *testing.T) {
	res := parseCSV([]byte("id,name\n1,\"a,b\"\n2,c\n"), 10)
	if len(res.Rows) != 2 || res.Rows[0][1] != "a,b" {
		t.Fatalf("unexpected result %+v", res)
	}
}
