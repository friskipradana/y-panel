package ufw

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

const verbose = `Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
`

const numberedOut = `Status: active

     To                         Action      From
     --                         ------      ----
[ 1] 22/tcp                     ALLOW IN    Anywhere
[ 2] 80,443/tcp                 ALLOW IN    Anywhere                   # Reneo public proxy
[ 3] 3306/tcp                   ALLOW IN    10.0.0.5
[ 4] 53/udp                     DENY IN     Anywhere
[ 5] 22/tcp (v6)                ALLOW IN    Anywhere (v6)
[ 6] Anywhere                   ALLOW OUT   203.0.113.7
[ 7] 8787/tcp                   LIMIT IN    Anywhere
[ 8] 9090/tcp                   ALLOW IN    2001:db8::/32
`

func TestParseVerboseAndNumbered(t *testing.T) {
	on, in, out, routed, logging := parseVerbose(verbose)
	if !on || in != "deny" || out != "allow" || routed != "disabled" || logging != "low" {
		t.Fatalf("verbose: %v %s %s %s %s", on, in, out, routed, logging)
	}
	rules := parseNumbered(numberedOut)
	if len(rules) != 8 {
		t.Fatalf("rules: %+v", rules)
	}
	if r := rules[1]; r.Number != 2 || r.To != "80,443/tcp" || r.Action != "ALLOW IN" || r.From != "Anywhere" || r.Comment != "Reneo public proxy" {
		t.Fatalf("rule 2: %+v", r)
	}
	if r := rules[4]; !r.V6 || r.To != "22/tcp (v6)" {
		t.Fatalf("v6: %+v", r)
	}
	if r := rules[5]; r.To != "Anywhere" || r.Action != "ALLOW OUT" || r.From != "203.0.113.7" {
		t.Fatalf("out: %+v", r)
	}
	if r := rules[7]; !r.V6 {
		t.Fatalf("an IPv6 source is an IPv6 rule: %+v", r)
	}
}

func TestRuleSpecArgs(t *testing.T) {
	cases := []struct {
		spec RuleSpec
		want string
		bad  bool
	}{
		{RuleSpec{Action: "allow", Direction: "in", Proto: "tcp", Port: "80"}, "allow in from any to any port 80 proto tcp", false},
		{RuleSpec{Action: "allow", Direction: "in", Proto: "tcp", Port: "8000:8100", From: "203.0.113.0/24", Comment: "ci runner"}, "allow in from 203.0.113.0/24 to any port 8000:8100 proto tcp comment ci runner", false},
		{RuleSpec{Action: "deny", Direction: "in", Proto: "any", From: "198.51.100.9"}, "deny in from 198.51.100.9 to any", false},
		{RuleSpec{Action: "limit", Direction: "in", Proto: "tcp", Port: "22"}, "limit in from any to any port 22 proto tcp", false},
		{RuleSpec{Action: "allow", Direction: "in", Proto: "any", Port: "53"}, "allow in from any to any port 53", false},
		{RuleSpec{Action: "allow", Direction: "sideways", Proto: "tcp", Port: "80"}, "", true},
		{RuleSpec{Action: "allow", Direction: "in", Proto: "tcp", Port: "0"}, "", true},
		{RuleSpec{Action: "allow", Direction: "in", Proto: "tcp", Port: "70000"}, "", true},
		{RuleSpec{Action: "allow", Direction: "in", Proto: "tcp", Port: "90:80"}, "", true},
		{RuleSpec{Action: "allow", Direction: "in", Proto: "tcp"}, "", true},
		{RuleSpec{Action: "allow", Direction: "in", Proto: "any"}, "", true},
		{RuleSpec{Action: "allow", Direction: "in", Proto: "tcp", Port: "80", From: "1.1.1.1; reboot"}, "", true},
		{RuleSpec{Action: "allow", Direction: "in", Proto: "tcp", Port: "80", Comment: "x; rm -rf /"}, "", true},
		{RuleSpec{Action: "limit", Direction: "in", Proto: "udp", Port: "22"}, "", true},
		{RuleSpec{Action: "accept", Direction: "in", Proto: "tcp", Port: "80"}, "", true},
	}
	for _, c := range cases {
		args, err := c.spec.Args()
		if c.bad {
			if err == nil {
				t.Errorf("%+v must be refused", c.spec)
			}
			continue
		}
		if err != nil || strings.Join(args, " ") != c.want {
			t.Errorf("%+v -> %v %v want %q", c.spec, args, err, c.want)
		}
	}
}

func TestLockoutChecks(t *testing.T) {
	protected := []Protected{{22, "ssh"}, {8787, "panel"}, {443, "web"}}
	if got := (RuleSpec{Action: "deny", Direction: "in", Proto: "tcp", Port: "22"}).Blocks(protected); len(got) != 1 || got[0].Port != 22 {
		t.Fatalf("deny ssh from anywhere: %v", got)
	}
	if got := (RuleSpec{Action: "deny", Direction: "in", Proto: "tcp", Port: "8000:9000"}).Blocks(protected); len(got) != 1 || got[0].Port != 8787 {
		t.Fatalf("a range covering the panel: %v", got)
	}
	if got := (RuleSpec{Action: "deny", Direction: "in", Proto: "tcp", Port: "22", From: "198.51.100.9"}).Blocks(protected); len(got) != 0 {
		t.Fatalf("one address only: %v", got)
	}
	if got := (RuleSpec{Action: "deny", Direction: "out", Proto: "tcp", Port: "22"}).Blocks(protected); len(got) != 0 {
		t.Fatalf("outgoing: %v", got)
	}
	if got := (RuleSpec{Action: "allow", Direction: "in", Proto: "tcp", Port: "22"}).Blocks(protected); len(got) != 0 {
		t.Fatalf("allow never blocks: %v", got)
	}

	d := Detail{Active: true, Incoming: "deny", Rules: parseNumbered(numberedOut)}
	// removing the only allow of 22 over IPv4 cuts ssh; the IPv6 twin does not count for IPv4
	if got := RemovalCuts(d.Rules[0], d, protected); len(got) != 1 || got[0].Port != 22 {
		t.Fatalf("ssh rule: %v", got)
	}
	// 80,443 also covers 443
	if got := RemovalCuts(d.Rules[1], d, protected); len(got) != 1 || got[0].Port != 443 {
		t.Fatalf("web rule: %v", got)
	}
	// a rule for one address, or a deny rule, cuts nothing
	for _, i := range []int{2, 3} {
		if got := RemovalCuts(d.Rules[i], d, protected); len(got) != 0 {
			t.Fatalf("rule %d: %v", i+1, got)
		}
	}
	// with incoming allowed by default no rule holds anything
	d.Incoming = "allow"
	if got := RemovalCuts(d.Rules[0], d, protected); len(got) != 0 {
		t.Fatalf("default allow: %v", got)
	}
	// a default deny cuts the protected ports that no rule lets in; a limit rule lets the panel port in
	d.Incoming = "deny"
	if got := DefaultCuts(d, protected); len(got) != 0 {
		t.Fatalf("default deny with every port allowed: %v", got)
	}
	if got := DefaultCuts(d, append(protected, Protected{9999, "web"})); len(got) != 1 || got[0].Port != 9999 {
		t.Fatalf("default deny: %v", got)
	}
}

func TestEnableAllowsProtectedPortsFirst(t *testing.T) {
	defer func(old func(...string) (string, error)) { run = old }(run)
	var calls []string
	run = func(args ...string) (string, error) {
		calls = append(calls, strings.Join(args, " "))
		return "ok", nil
	}
	if err := Enable([]Protected{{22, "ssh"}, {8787, "panel"}}, "Reneo"); err != nil {
		t.Fatal(err)
	}
	want := []string{"allow 22/tcp comment Reneo ssh", "allow 8787/tcp comment Reneo panel", "--force enable"}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("calls %v want %v", calls, want)
	}
	// a refused allow stops everything: ufw is not enabled without the way in
	calls = nil
	run = func(args ...string) (string, error) {
		calls = append(calls, strings.Join(args, " "))
		return "ERROR: bad", errors.New("exit 1")
	}
	if err := Enable([]Protected{{22, "ssh"}}, "Reneo"); err == nil || len(calls) != 1 {
		t.Fatalf("must stop at the failed allow: %v %v", err, calls)
	}
}

func TestDeleteRuleChecksTheRuleFirst(t *testing.T) {
	defer func(old func(...string) (string, error)) { run = old }(run)
	var deleted []string
	run = func(args ...string) (string, error) {
		switch args[0] {
		case "status":
			if args[1] == "verbose" {
				return verbose, nil
			}
			return numberedOut, nil
		case "--force":
			deleted = append(deleted, strings.Join(args, " "))
		}
		return "ok", nil
	}
	if err := DeleteRule(3, Rule{To: "22/tcp", Action: "ALLOW IN", From: "Anywhere"}); err == nil || len(deleted) != 0 {
		t.Fatalf("rule 3 is not that rule: %v %v", err, deleted)
	}
	if err := DeleteRule(3, Rule{To: "3306/tcp", Action: "ALLOW IN", From: "10.0.0.5"}); err != nil || !reflect.DeepEqual(deleted, []string{"--force delete 3"}) {
		t.Fatalf("delete: %v %v", err, deleted)
	}
}

func TestAllows(t *testing.T) {
	d := Detail{Active: true, Incoming: "deny", Rules: parseNumbered(numberedOut)}
	for _, c := range []struct {
		proto string
		port  int
		want  bool
	}{
		{"tcp", 22, true}, {"tcp", 443, true}, {"tcp", 80, true}, {"tcp", 8787, true}, {"tcp", 3306, false}, {"udp", 53, false}, {"udp", 22, false}, {"tcp", 8080, false}, {"tcp", 9090, false},
	} {
		if got := Allows(d, c.proto, c.port); got != c.want {
			t.Errorf("%s/%d: got %v want %v", c.proto, c.port, got, c.want)
		}
	}
	d.Incoming = "allow"
	if !Allows(d, "tcp", 8080) {
		t.Error("a default allow lets everything in")
	}
}
