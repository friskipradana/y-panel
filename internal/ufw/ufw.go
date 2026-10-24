// Package ufw reads the state of ufw (the firewall of Ubuntu and Debian) and opens ports in it. It never turns ufw on or off and never
// removes a rule: it only adds what a feature of the panel needs, and only when ufw is already active.
package ufw

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Status is what ufw says about a set of ports.
type Status struct {
	Installed bool `json:"installed"`
	Active    bool `json:"active"`
	// Open says, per port, whether a rule lets TCP traffic from anywhere in over IPv4
	Open map[int]bool `json:"-"`
}

// run executes ufw; a variable so the tests can answer in its place
var run = func(args ...string) (string, error) {
	if _, err := exec.LookPath("ufw"); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ufw", args...)
	cmd.Env = append(cmd.Environ(), "LC_ALL=C")
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

var columns = regexp.MustCompile(`\s{2,}`)

// Check reads `ufw status` and tells which of the ports are open to everyone.
func Check(ports []int) Status {
	st := Status{Open: map[int]bool{}}
	out, err := run("status")
	if err != nil && out == "" {
		return st
	}
	st.Installed = true
	st.Active, st.Open = parse(out, ports)
	return st
}

func parse(out string, ports []int) (bool, map[int]bool) {
	open := map[int]bool{}
	active := false
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Status:") {
			active = strings.Contains(line, "active") && !strings.Contains(line, "inactive")
			continue
		}
		fields := columns.Split(line, -1)
		if len(fields) < 3 || strings.Contains(fields[0], "(v6)") {
			continue
		}
		action, from := fields[1], fields[2]
		if !strings.HasPrefix(action, "ALLOW") || strings.Contains(action, "FWD") || from != "Anywhere" {
			continue
		}
		for _, port := range ports {
			if covers(fields[0], port) {
				open[port] = true
			}
		}
	}
	return active, open
}

// covers: "80", "80/tcp", "80,443/tcp" and "8000:8100/tcp" cover port 80 (443, 8050); udp rules do not
func covers(to string, port int) bool {
	spec, proto, _ := strings.Cut(to, "/")
	if proto != "" && proto != "tcp" {
		return false
	}
	for _, part := range strings.Split(spec, ",") {
		lo, hi, ranged := strings.Cut(part, ":")
		a, err := strconv.Atoi(lo)
		if err != nil {
			return false
		}
		b := a
		if ranged {
			if b, err = strconv.Atoi(hi); err != nil {
				return false
			}
		}
		if port >= a && port <= b {
			return true
		}
	}
	return false
}

// Allow opens the ports to TCP traffic from anywhere. It does nothing when ufw is not installed or not active: with ufw off there is
// nothing to open, and turning it on is the owner's decision.
func Allow(ports []int, comment string) error {
	st := Check(ports)
	if !st.Installed || !st.Active {
		return nil
	}
	for _, port := range ports {
		if st.Open[port] {
			continue
		}
		args := []string{"allow", fmt.Sprintf("%d/tcp", port)}
		if comment != "" {
			args = append(args, "comment", comment)
		}
		if out, err := run(args...); err != nil {
			return fmt.Errorf("ufw allow %d/tcp: %s", port, out)
		}
	}
	return nil
}
