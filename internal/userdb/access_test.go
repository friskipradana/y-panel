package userdb

import (
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestParseAllowList(t *testing.T) {
	got, err := ParseAllowList([]string{" 203.0.113.7 ", "10.1.2.3/24", "203.0.113.7", "", "192.168.1.5/32"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"203.0.113.7", "10.1.2.0/24", "192.168.1.5"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
	for _, bad := range []string{"0.0.0.0/0", "0.0.0.0", "10.0.0.0/7", "::1", "2001:db8::/32", "abc", "10.0.0.256", "10.0.0.1/33"} {
		if _, err := ParseAllowList([]string{bad}); err == nil {
			t.Errorf("%q must be refused", bad)
		}
	}
	many := make([]string, 21)
	for i := range many {
		many[i] = fmt.Sprintf("10.0.0.%d", i+1)
	}
	if _, err := ParseAllowList(many); err == nil {
		t.Fatal("21 addresses must be refused")
	}
	if _, err := ParseAllowList(many[:20]); err != nil {
		t.Fatal(err)
	}
}

func TestBindAddress(t *testing.T) {
	engine, _ := Lookup("postgres")
	local := strings.Join(Spec{ID: 1, Engine: engine, HostPort: 20001}.RunArgs(), " ")
	if !strings.Contains(local, "127.0.0.1:20001:") {
		t.Fatalf("local must bind 127.0.0.1: %s", local)
	}
	remote := strings.Join(Spec{ID: 1, Engine: engine, HostPort: 20001, AllowRemote: true}.RunArgs(), " ")
	if !strings.Contains(remote, "0.0.0.0:20001:") {
		t.Fatalf("remote must bind every interface: %s", remote)
	}
}

func TestApplyAccessOrderAndFailClosed(t *testing.T) {
	defer func(old func(...string) (string, error)) { iptables = old }(iptables)
	var calls []string
	iptables = func(args ...string) (string, error) {
		calls = append(calls, strings.Join(args, " "))
		if args[0] == "-C" {
			return "", errors.New("no such rule")
		}
		return "", nil
	}
	if err := ApplyAccess(7, 20005, []string{"203.0.113.7", "10.0.0.0/24"}); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"-S DOCKER-USER",
		"-N RENEO-DB-7",
		"-F RENEO-DB-7",
		"-A RENEO-DB-7 -s 203.0.113.7 -j ACCEPT",
		"-A RENEO-DB-7 -s 10.0.0.0/24 -j ACCEPT",
		"-A RENEO-DB-7 -j DROP",
		"-C DOCKER-USER -p tcp -m conntrack --ctorigdstport 20005 --ctdir ORIGINAL -j RENEO-DB-7",
		"-I DOCKER-USER 1 -p tcp -m conntrack --ctorigdstport 20005 --ctdir ORIGINAL -j RENEO-DB-7",
	}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("calls:\n%s\nwant:\n%s", strings.Join(calls, "\n"), strings.Join(want, "\n"))
	}

	// without the Docker chain nothing is published: the caller sees the error before it recreates the container
	iptables = func(args ...string) (string, error) { return "No chain/target/match by that name", errors.New("exit 1") }
	if err := ApplyAccess(7, 20005, []string{"203.0.113.7"}); err == nil {
		t.Fatal("a missing DOCKER-USER chain must fail")
	}
	if err := ApplyAccess(7, 20005, nil); err == nil {
		t.Fatal("an empty list must fail")
	}
}

func TestRestartPolicy(t *testing.T) {
	engine, _ := Lookup("mysql")
	local := strings.Join(Spec{ID: 2, Engine: engine, HostPort: 20001}.RunArgs(), " ")
	if !strings.Contains(local, "--restart unless-stopped") {
		t.Fatalf("a local database comes back after a reboot: %s", local)
	}
	// Docker must not publish it on every interface before the agent has put its firewall rules back
	remote := strings.Join(Spec{ID: 2, Engine: engine, HostPort: 20001, AllowRemote: true}.RunArgs(), " ")
	if !strings.Contains(remote, "--restart no") {
		t.Fatalf("a database open to listed addresses is started by the agent: %s", remote)
	}
}
