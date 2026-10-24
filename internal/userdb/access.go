package userdb

import (
	"context"
	"errors"
	"fmt"
	"net/netip"
	"os/exec"
	"strings"
	"time"
)

// Access to a database from outside the server. By default the container is published on 127.0.0.1 only. With a list of addresses
// it is published on every interface and a firewall chain of its own lets only those addresses through: the chain is jumped to from
// DOCKER-USER, the one place Docker leaves to the administrator, because published ports skip the INPUT rules of ufw and the like.

const (
	// AccessLocal publishes the database on 127.0.0.1 only
	AccessLocal = "local"
	// AccessIPs publishes it for the listed addresses
	AccessIPs = "ips"

	maxAllowed   = 20
	minPrefixLen = 8
	dockerChain  = "DOCKER-USER"
)

// ParseAllowList checks and normalises the addresses (IPv4, single or CIDR). "Anywhere" is refused: a database that every address may
// try is not an allow list.
func ParseAllowList(raw []string) ([]string, error) {
	seen := map[string]bool{}
	out := []string{}
	for _, item := range raw {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		var normal string
		if strings.Contains(item, "/") {
			prefix, err := netip.ParsePrefix(item)
			if err != nil {
				return nil, fmt.Errorf("%q is not a valid IP or CIDR", item)
			}
			prefix = prefix.Masked()
			if !prefix.Addr().Is4() {
				return nil, fmt.Errorf("%q: only IPv4 addresses are supported", item)
			}
			if prefix.Bits() < minPrefixLen {
				return nil, fmt.Errorf("%q is too wide: use /%d or narrower", item, minPrefixLen)
			}
			normal = prefix.String()
			if prefix.Bits() == 32 {
				normal = prefix.Addr().String()
			}
		} else {
			addr, err := netip.ParseAddr(item)
			if err != nil {
				return nil, fmt.Errorf("%q is not a valid IP or CIDR", item)
			}
			addr = addr.Unmap()
			if !addr.Is4() {
				return nil, fmt.Errorf("%q: only IPv4 addresses are supported", item)
			}
			if addr.IsUnspecified() {
				return nil, fmt.Errorf("%q cannot be allowed", item)
			}
			normal = addr.String()
		}
		if seen[normal] {
			continue
		}
		seen[normal] = true
		out = append(out, normal)
	}
	if len(out) > maxAllowed {
		return nil, fmt.Errorf("at most %d addresses", maxAllowed)
	}
	return out, nil
}

func accessChain(id int64) string { return fmt.Sprintf("RENEO-DB-%d", id) }

func jumpRule(id int64, port int) []string {
	return []string{dockerChain, "-p", "tcp", "-m", "conntrack", "--ctorigdstport", fmt.Sprint(port), "--ctdir", "ORIGINAL", "-j", accessChain(id)}
}

// AccessRules is what ApplyAccess runs, in order, as iptables arguments. The jump is added last and only when it is not there yet.
func AccessRules(id int64, port int, allowed []string) [][]string {
	chain := accessChain(id)
	rules := [][]string{{"-N", chain}, {"-F", chain}}
	for _, source := range allowed {
		rules = append(rules, []string{"-A", chain, "-s", source, "-j", "ACCEPT"})
	}
	return append(rules, []string{"-A", chain, "-j", "DROP"})
}

// iptables runs one command; a variable so the tests can record the calls
var iptables = func(args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "iptables", append([]string{"-w", "5"}, args...)...).CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

// ApplyAccess makes the firewall let only the listed addresses reach the database port. It must succeed before the container is
// published on every interface: when it cannot, the database stays on 127.0.0.1.
func ApplyAccess(id int64, port int, allowed []string) error {
	if len(allowed) == 0 {
		return errors.New("no address to allow")
	}
	if out, err := iptables("-S", dockerChain); err != nil {
		return fmt.Errorf("the Docker firewall chain %s is not available (%s): %w", dockerChain, firstLine(out), err)
	}
	for i, rule := range AccessRules(id, port, allowed) {
		out, err := iptables(rule...)
		// the chain may exist already: it is emptied right after
		if err != nil && !(i == 0 && strings.Contains(out, "Chain already exists")) {
			return fmt.Errorf("iptables %s: %s", strings.Join(rule, " "), firstLine(out))
		}
	}
	if _, err := iptables(append([]string{"-C"}, jumpRule(id, port)...)...); err != nil {
		if out, err := iptables(append([]string{"-I", dockerChain, "1"}, jumpRule(id, port)[1:]...)...); err != nil {
			return fmt.Errorf("iptables jump: %s", firstLine(out))
		}
	}
	return nil
}

// ClearAccess takes the chain of a database away (nothing to do when it was never there).
func ClearAccess(id int64, port int) {
	for i := 0; i < 5; i++ {
		if _, err := iptables(append([]string{"-D"}, jumpRule(id, port)...)...); err != nil {
			break
		}
	}
	_, _ = iptables("-F", accessChain(id))
	_, _ = iptables("-X", accessChain(id))
}
