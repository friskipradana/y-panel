// Package listening lists the ports this machine listens on, read from ss, so the firewall window can say which of them are reachable.
package listening

import (
	"context"
	"net"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Listener is one socket in the listening state.
type Listener struct {
	// Proto: tcp or udp
	Proto   string `json:"proto"`
	Address string `json:"address"`
	Port    int    `json:"port"`
	Process string `json:"process,omitempty"`
	PID     int    `json:"pid,omitempty"`
	// Loopback: only this machine can connect
	Loopback bool `json:"loopback"`
}

var processRe = regexp.MustCompile(`\(\("([^"]+)",pid=(\d+)`)

// run executes ss; a variable so the tests can answer in its place
var run = func() (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "ss", "-H", "-tulnp").CombinedOutput()
	return string(out), err
}

// List returns the listening sockets, one entry per protocol, address and port, ordered by port.
func List() ([]Listener, error) {
	out, err := run()
	if err != nil && strings.TrimSpace(out) == "" {
		return nil, err
	}
	return parse(out), nil
}

func parse(out string) []Listener {
	seen := map[string]bool{}
	list := []Listener{}
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(line)
		// netid state recv-q send-q local peer [process]
		if len(f) < 6 {
			continue
		}
		proto := strings.TrimSuffix(f[0], "6")
		if proto != "tcp" && proto != "udp" {
			continue
		}
		host, portText, err := net.SplitHostPort(f[4])
		if err != nil {
			continue
		}
		port, err := strconv.Atoi(portText)
		if err != nil {
			continue
		}
		host = strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
		// a wildcard on IPv4 and IPv6 is one listener to the reader
		if host == "*" || host == "::" {
			host = "0.0.0.0"
		}
		// the zone of a link-local address is noise
		if i := strings.IndexByte(host, '%'); i >= 0 {
			host = host[:i]
		}
		key := proto + "|" + host + "|" + portText
		if seen[key] {
			continue
		}
		seen[key] = true
		l := Listener{Proto: proto, Address: host, Port: port}
		if ip := net.ParseIP(host); ip != nil {
			l.Loopback = ip.IsLoopback()
		}
		if m := processRe.FindStringSubmatch(line); m != nil {
			l.Process = m[1]
			l.PID, _ = strconv.Atoi(m[2])
		}
		list = append(list, l)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Port != list[j].Port {
			return list[i].Port < list[j].Port
		}
		return list[i].Proto < list[j].Proto
	})
	return list
}
