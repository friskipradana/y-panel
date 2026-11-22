package ufw

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

const active = `Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80,443/tcp                 ALLOW       Anywhere
3306/tcp                   ALLOW       10.0.0.5
8000:8100/tcp              ALLOW       Anywhere
53/udp                     ALLOW       Anywhere
9000/tcp                   DENY        Anywhere
5432/tcp (v6)              ALLOW       Anywhere (v6)
`

func TestParse(t *testing.T) {
	on, open := parse(active, []int{22, 80, 443, 3306, 8050, 53, 9000, 5432})
	if !on {
		t.Fatal("must be active")
	}
	want := map[int]bool{22: true, 80: true, 443: true, 8050: true}
	if !reflect.DeepEqual(open, want) {
		t.Fatalf("open %v want %v", open, want)
	}
	if on, _ := parse("Status: inactive", []int{80}); on {
		t.Fatal("inactive is not active")
	}
}

func TestAllowOnlyWhenActiveAndOnlyMissing(t *testing.T) {
	defer func(old func(...string) (string, error)) { run = old }(run)
	var calls []string
	run = func(args ...string) (string, error) {
		if args[0] == "status" {
			return strings.Replace(active, "80,443/tcp", "443/tcp", 1), nil
		}
		calls = append(calls, strings.Join(args, " "))
		return "Rule added", nil
	}
	if err := Allow([]int{80, 443}, "Reneo"); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(calls, []string{"allow 80/tcp comment Reneo"}) {
		t.Fatalf("only the closed port is opened: %v", calls)
	}

	// ufw off: nothing is touched
	calls = nil
	run = func(args ...string) (string, error) {
		if args[0] == "status" {
			return "Status: inactive", nil
		}
		calls = append(calls, strings.Join(args, " "))
		return "", nil
	}
	if err := Allow([]int{80}, ""); err != nil || len(calls) != 0 {
		t.Fatalf("inactive ufw must be left alone: %v %v", err, calls)
	}

	// ufw missing
	run = func(args ...string) (string, error) { return "", errors.New("not found") }
	if st := Check([]int{80}); st.Installed || st.Active {
		t.Fatal("missing ufw is neither installed nor active")
	}
}
