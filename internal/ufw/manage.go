package ufw

import (
	"errors"
	"fmt"
	"net/netip"
	"regexp"
	"strconv"
	"strings"
)

// Rule is one line of `ufw status numbered`.
type Rule struct {
	Number  int    `json:"number"`
	To      string `json:"to"`
	Action  string `json:"action"`
	From    string `json:"from"`
	V6      bool   `json:"v6"`
	Comment string `json:"comment,omitempty"`
}

// Detail is everything the firewall window shows about ufw.
type Detail struct {
	Installed bool `json:"installed"`
	Active    bool `json:"active"`
	// Default policies: allow, deny, reject, or disabled
	Incoming string `json:"incoming"`
	Outgoing string `json:"outgoing"`
	Routed   string `json:"routed"`
	// Logging: off, low, medium, high
	Logging string `json:"logging"`
	Rules   []Rule `json:"rules"`
}

var (
	numbered   = regexp.MustCompile(`^\[\s*(\d+)\]\s+(.*)$`)
	defaultsRe = regexp.MustCompile(`(?i)(allow|deny|reject|disabled)\s*\((incoming|outgoing|routed)\)`)
	loggingRe  = regexp.MustCompile(`(?i)^Logging:\s*(\w+)(?:\s*\((\w+)\))?`)
)

// Inspect reads the state, the default policies and the numbered rules.
func Inspect() Detail {
	d := Detail{Rules: []Rule{}}
	verbose, err := run("status", "verbose")
	if err != nil && verbose == "" {
		return d
	}
	d.Installed = true
	d.Active, d.Incoming, d.Outgoing, d.Routed, d.Logging = parseVerbose(verbose)
	if d.Active {
		if out, err := run("status", "numbered"); err == nil {
			d.Rules = parseNumbered(out)
		}
	}
	return d
}

func parseVerbose(out string) (active bool, incoming, outgoing, routed, logging string) {
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(line, "Status:"):
			active = strings.Contains(line, "active") && !strings.Contains(line, "inactive")
		case strings.HasPrefix(line, "Default:"):
			for _, m := range defaultsRe.FindAllStringSubmatch(line, -1) {
				policy := strings.ToLower(m[1])
				switch strings.ToLower(m[2]) {
				case "incoming":
					incoming = policy
				case "outgoing":
					outgoing = policy
				case "routed":
					routed = policy
				}
			}
		case strings.HasPrefix(line, "Logging:"):
			if m := loggingRe.FindStringSubmatch(line); m != nil {
				logging = strings.ToLower(m[1])
				if logging == "on" && m[2] != "" {
					logging = strings.ToLower(m[2])
				}
			}
		}
	}
	return
}

func parseNumbered(out string) []Rule {
	rules := []Rule{}
	for _, line := range strings.Split(out, "\n") {
		m := numbered.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil {
			continue
		}
		n, _ := strconv.Atoi(m[1])
		rest := m[2]
		comment := ""
		if i := strings.Index(rest, " # "); i >= 0 {
			rest, comment = rest[:i], strings.TrimSpace(rest[i+3:])
		}
		cols := columns.Split(strings.TrimSpace(rest), -1)
		if len(cols) < 3 {
			continue
		}
		rules = append(rules, Rule{
			Number: n, To: cols[0], Action: cols[1], From: strings.TrimSpace(cols[2]),
			V6: strings.Contains(cols[0], "(v6)") || strings.Contains(cols[2], ":"), Comment: comment,
		})
	}
	return rules
}

// RuleSpec is a rule the owner asks for.
type RuleSpec struct {
	// Action: allow, deny, reject or limit (allow with a rate limit for brute force attempts)
	Action string `json:"action"`
	// Direction: in or out
	Direction string `json:"direction"`
	// Proto: tcp, udp or any
	Proto string `json:"proto"`
	// Port: one port ("80") or a range ("8000:8100"); empty means every port
	Port string `json:"port"`
	// From: an IPv4 or IPv6 address, a CIDR, or empty for anywhere
	From    string `json:"from"`
	Comment string `json:"comment"`
}

var commentOK = regexp.MustCompile(`^[\p{L}\p{N} .,:/()@+_-]{0,60}$`)

// Args validates the spec and builds the arguments of the ufw command.
func (s RuleSpec) Args() ([]string, error) {
	switch s.Action {
	case "allow", "deny", "reject", "limit":
	default:
		return nil, errors.New("action must be allow, deny, reject or limit")
	}
	switch s.Direction {
	case "in", "out":
	default:
		return nil, errors.New("direction must be in or out")
	}
	switch s.Proto {
	case "tcp", "udp", "any":
	default:
		return nil, errors.New("protocol must be tcp, udp or any")
	}
	if s.Action == "limit" && s.Proto == "udp" {
		return nil, errors.New("limit works on tcp only")
	}
	port := strings.TrimSpace(s.Port)
	if port != "" {
		if _, _, err := portBounds(port); err != nil {
			return nil, err
		}
	}
	if port == "" && s.Proto != "any" {
		return nil, errors.New("a protocol needs a port; choose any protocol for every port")
	}
	from := strings.TrimSpace(s.From)
	if from == "" && port == "" {
		return nil, errors.New("give a port or an address")
	}
	if from != "" {
		if strings.Contains(from, "/") {
			if _, err := netip.ParsePrefix(from); err != nil {
				return nil, fmt.Errorf("%q is not a valid IP or CIDR", from)
			}
		} else if _, err := netip.ParseAddr(from); err != nil {
			return nil, fmt.Errorf("%q is not a valid IP or CIDR", from)
		}
	}
	if !commentOK.MatchString(s.Comment) {
		return nil, errors.New("the comment may use letters, digits and . , : / ( ) @ + _ - only, 60 characters at most")
	}
	args := []string{s.Action, s.Direction}
	if from != "" {
		args = append(args, "from", from)
		args = append(args, "to", "any")
	} else {
		args = append(args, "from", "any", "to", "any")
	}
	if port != "" {
		args = append(args, "port", port)
	}
	if s.Proto != "any" {
		args = append(args, "proto", s.Proto)
	}
	if c := strings.TrimSpace(s.Comment); c != "" {
		args = append(args, "comment", c)
	}
	return args, nil
}

// portBounds reads "80" or "8000:8100".
func portBounds(spec string) (int, int, error) {
	lo, hi, ranged := strings.Cut(spec, ":")
	a, err := strconv.Atoi(lo)
	if err != nil || a < 1 || a > 65535 {
		return 0, 0, fmt.Errorf("%q is not a valid port", spec)
	}
	b := a
	if ranged {
		if b, err = strconv.Atoi(hi); err != nil || b < a || b > 65535 {
			return 0, 0, fmt.Errorf("%q is not a valid port range", spec)
		}
	}
	return a, b, nil
}

// Protected is a port the panel's owner must not lose: SSH, the panel itself, the web ports of the public proxy.
type Protected struct {
	Port   int    `json:"port"`
	Reason string `json:"reason"`
}

// Blocks lists the protected ports that a rule would cut off for everyone: a deny or reject for incoming traffic that covers the port
// from anywhere. An allow rule that is removed is looked at by RemovalCuts.
func (s RuleSpec) Blocks(protected []Protected) []Protected {
	if (s.Action != "deny" && s.Action != "reject") || s.Direction != "in" || strings.TrimSpace(s.From) != "" {
		return nil
	}
	if s.Proto == "udp" {
		return nil
	}
	return coveredBy(strings.TrimSpace(s.Port), protected, true)
}

// RemovalCuts lists the protected ports that stop being reachable when this allow rule is removed, given the policy for incoming traffic.
func RemovalCuts(r Rule, d Detail, protected []Protected) []Protected {
	if d.Incoming == "allow" || r.V6 || !letsIn(r.Action) || r.From != "Anywhere" {
		return nil
	}
	_, proto, _ := strings.Cut(strings.TrimSuffix(strings.TrimSpace(r.To), " (v6)"), "/")
	if proto != "" && proto != "tcp" {
		return nil
	}
	var cut []Protected
	for _, p := range protected {
		if covers(r.To, p.Port) && !coveredByOther(r, d, p.Port) {
			cut = append(cut, p)
		}
	}
	return cut
}

// coveredByOther: another allow rule of the same family from anywhere still lets the port in
func coveredByOther(r Rule, d Detail, port int) bool {
	for _, o := range d.Rules {
		if o.Number == r.Number || o.V6 != r.V6 {
			continue
		}
		if letsIn(o.Action) && (o.From == "Anywhere" || o.From == "Anywhere (v6)") && covers(o.To, port) {
			return true
		}
	}
	return false
}

func protectedList(p []Protected) []Protected { return append([]Protected(nil), p...) }

func coveredBy(portSpec string, protected []Protected, everyPort bool) []Protected {
	var out []Protected
	if portSpec == "" {
		if everyPort {
			return protectedList(protected)
		}
		return nil
	}
	lo, hi, err := portBounds(portSpec)
	if err != nil {
		return nil
	}
	for _, p := range protected {
		if p.Port >= lo && p.Port <= hi {
			out = append(out, p)
		}
	}
	return out
}

// DefaultCuts lists the protected ports that are not allowed by a rule, which a default deny for incoming traffic would cut off.
func DefaultCuts(d Detail, protected []Protected) []Protected {
	ports := make([]int, 0, len(protected))
	for _, p := range protected {
		ports = append(ports, p.Port)
	}
	open := map[int]bool{}
	for _, r := range d.Rules {
		if r.V6 || !letsIn(r.Action) || r.From != "Anywhere" {
			continue
		}
		for _, port := range ports {
			if covers(r.To, port) {
				open[port] = true
			}
		}
	}
	var cut []Protected
	for _, p := range protected {
		if !open[p.Port] {
			cut = append(cut, p)
		}
	}
	return cut
}

// ---------------------------------------------------------------------------------------------------------------------
// Changes. Each one is a single ufw command; none of them enables or disables ufw by itself except Enable and Disable.

// Allows says whether a rule lets traffic of this protocol in to the port from anywhere over IPv4, or the policy lets everything in.
func Allows(d Detail, proto string, port int) bool {
	if d.Incoming == "allow" {
		return true
	}
	for _, r := range d.Rules {
		if r.V6 || !letsIn(r.Action) || r.From != "Anywhere" {
			continue
		}
		spec, p, _ := strings.Cut(r.To, "/")
		if p != "" && p != proto {
			continue
		}
		if covers(spec+"/"+proto, port) {
			return true
		}
	}
	return false
}

// Enable turns ufw on after letting the protected ports in, so the owner is not locked out. It does not remove anything.
func Enable(protected []Protected, comment string) error {
	for _, p := range protected {
		if out, err := run("allow", fmt.Sprintf("%d/tcp", p.Port), "comment", comment+" "+p.Reason); err != nil {
			return fmt.Errorf("ufw allow %d/tcp: %s", p.Port, firstLine(out))
		}
	}
	if out, err := run("--force", "enable"); err != nil {
		return fmt.Errorf("ufw enable: %s", firstLine(out))
	}
	return nil
}

func Disable() error {
	if out, err := run("disable"); err != nil {
		return fmt.Errorf("ufw disable: %s", firstLine(out))
	}
	return nil
}

func Reload() error {
	if out, err := run("reload"); err != nil {
		return fmt.Errorf("ufw reload: %s", firstLine(out))
	}
	return nil
}

// SetDefault changes the policy of a direction: incoming, outgoing or routed.
func SetDefault(direction, policy string) error {
	switch direction {
	case "incoming", "outgoing", "routed":
	default:
		return errors.New("direction must be incoming, outgoing or routed")
	}
	switch policy {
	case "allow", "deny", "reject":
	default:
		return errors.New("policy must be allow, deny or reject")
	}
	if out, err := run("default", policy, direction); err != nil {
		return fmt.Errorf("ufw default: %s", firstLine(out))
	}
	return nil
}

func SetLogging(level string) error {
	switch level {
	case "off", "low", "medium", "high":
	default:
		return errors.New("logging must be off, low, medium or high")
	}
	if out, err := run("logging", level); err != nil {
		return fmt.Errorf("ufw logging: %s", firstLine(out))
	}
	return nil
}

// AddRule adds a validated rule (ufw is expected to be active).
func AddRule(spec RuleSpec) error {
	args, err := spec.Args()
	if err != nil {
		return err
	}
	if out, err := run(args...); err != nil {
		return fmt.Errorf("ufw %s: %s", spec.Action, firstLine(out))
	}
	return nil
}

// DeleteRule removes the rule with this number, but only when it still is the rule the caller looked at: the numbers shift whenever a
// rule is added or removed.
func DeleteRule(number int, expect Rule) error {
	d := Inspect()
	var found *Rule
	for i := range d.Rules {
		if d.Rules[i].Number == number {
			found = &d.Rules[i]
		}
	}
	if found == nil || found.To != expect.To || found.Action != expect.Action || found.From != expect.From {
		return errors.New("the rules changed in the meantime; refresh the list")
	}
	if out, err := run("--force", "delete", strconv.Itoa(number)); err != nil {
		return fmt.Errorf("ufw delete: %s", firstLine(out))
	}
	return nil
}

func firstLine(text string) string {
	text = strings.TrimSpace(text)
	if i := strings.IndexByte(text, '\n'); i >= 0 {
		text = text[:i]
	}
	if len(text) > 240 {
		text = text[:240]
	}
	return text
}
