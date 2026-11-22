package mcp

import "testing"

func TestParseDUSortsAndLimits(t *testing.T) {
	out := "1000\t/var/lib\n9000\t/var/log\n5000\t/var/cache\n20000\t/var\n"
	entries, total := parseDU(out, "/var", 2)
	if total != 20000 {
		t.Fatalf("total = %d", total)
	}
	if len(entries) != 2 || entries[0].Path != "/var/log" || entries[1].Path != "/var/cache" {
		t.Fatalf("entries = %+v", entries)
	}
	if entries[0].Share != 45.0 {
		t.Errorf("share = %v", entries[0].Share)
	}
}

func TestCleanAbsPath(t *testing.T) {
	if p, err := cleanAbsPath("/var/log/../lib"); err != nil || p != "/var/lib" {
		t.Errorf("clean = %q err=%v", p, err)
	}
	for _, bad := range []string{"var/log", "../etc", "/a\x00b"} {
		if _, err := cleanAbsPath(bad); err == nil {
			t.Errorf("expected rejection for %q", bad)
		}
	}
}

func TestFirewallRuleValidation(t *testing.T) {
	if _, err := validateFirewallRule(5432, "tcp", "", "", false); err == nil {
		t.Error("open postgres port must require confirmation")
	}
	if r, err := validateFirewallRule(5432, "tcp", "100.64.0.0/10", "db access", false); err != nil || r.From != "100.64.0.0/10" {
		t.Errorf("restricted rule = %+v err=%v", r, err)
	}
	if _, err := validateFirewallRule(5432, "tcp", "any", "", true); err != nil {
		t.Errorf("confirmed public rule rejected: %v", err)
	}
	if _, err := validateFirewallRule(8080, "tcp", "", "", false); err != nil {
		t.Errorf("ordinary port rejected: %v", err)
	}
	bad := []struct {
		port        int
		proto, from string
		comment     string
	}{
		{0, "tcp", "", ""},
		{70000, "tcp", "", ""},
		{80, "icmp", "", ""},
		{80, "tcp", "1.2.3.4; reboot", ""},
		{80, "tcp", "", "x'; ufw disable; '"},
	}
	for i, c := range bad {
		if _, err := validateFirewallRule(c.port, c.proto, c.from, c.comment, false); err == nil {
			t.Errorf("case %d: expected rejection %+v", i, c)
		}
	}
}

func TestPostgresValidation(t *testing.T) {
	if got, err := validatePostgresAddresses("127.0.0.1, 100.64.0.5", false); err != nil || got != "127.0.0.1,100.64.0.5" {
		t.Errorf("addresses = %q err=%v", got, err)
	}
	for _, bad := range []string{"*", "0.0.0.0", "", "'; DROP", "db.example.com"} {
		if _, err := validatePostgresAddresses(bad, false); err == nil {
			t.Errorf("expected rejection for %q", bad)
		}
	}
	if _, err := validatePostgresAddresses("*", true); err != nil {
		t.Errorf("confirmed * rejected: %v", err)
	}

	if n, err := validatePostgresHBA("app_db", "app-user", "203.0.113.7/32", false); err != nil || n != "203.0.113.7/32" {
		t.Errorf("hba = %q err=%v", n, err)
	}
	if _, err := validatePostgresHBA("app_db", "app", "0.0.0.0/0", false); err == nil {
		t.Error("0.0.0.0/0 must require confirmation")
	}
	for _, c := range [][3]string{{"a b", "u", "10.0.0.0/8"}, {"db", "u;x", "10.0.0.0/8"}, {"db", "u", "10.0.0.1"}} {
		if _, err := validatePostgresHBA(c[0], c[1], c[2], false); err == nil {
			t.Errorf("expected rejection for %v", c)
		}
	}
}
