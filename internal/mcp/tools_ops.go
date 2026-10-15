package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	pathpkg "path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Host operations tools (admin only): disk analysis and cleanup, firewall, PostgreSQL exposure.
// Every command is executed without a shell and every user supplied value is validated first.

// sensitivePorts must never be opened to the whole internet by accident.
var sensitivePorts = map[int]string{
	22: "ssh", 2375: "docker", 2376: "docker-tls", 3306: "mysql", 5432: "postgresql",
	6379: "redis", 9200: "elasticsearch", 11211: "memcached", 27017: "mongodb",
}

var (
	identRe   = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_-]{0,62}$`)
	commentRe = regexp.MustCompile(`^[A-Za-z0-9 ._:@/-]{0,60}$`)
	pgAddrRe  = regexp.MustCompile(`^(\*|localhost|[0-9A-Fa-f:.]+)$`)
)

func runCmd(ctx context.Context, timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	text := strings.TrimSpace(string(out))
	if ctx.Err() == context.DeadlineExceeded {
		return text, fmt.Errorf("%s timed out after %s", name, timeout)
	}
	if err != nil {
		if text == "" {
			return "", fmt.Errorf("%s failed: %w", name, err)
		}
		return text, fmt.Errorf("%s failed: %s", name, firstLines(text, 6))
	}
	return text, nil
}

func firstLines(s string, n int) string {
	lines := strings.Split(s, "\n")
	if len(lines) > n {
		lines = lines[:n]
	}
	return strings.Join(lines, "\n")
}

// ── disk usage ───────────────────────────────────────────────────────────────

type diskEntry struct {
	Path  string  `json:"path"`
	Bytes int64   `json:"bytes"`
	Human string  `json:"human"`
	Share float64 `json:"percentOfScanned"`
}

func humanBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(b)/float64(div), "KMGTPE"[exp])
}

// parseDU converts `du -B1` output into entries sorted by size, excluding the root line.
func parseDU(output, root string, limit int) (entries []diskEntry, total int64) {
	scanner := bufio.NewScanner(strings.NewReader(output))
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		fields := strings.SplitN(scanner.Text(), "\t", 2)
		if len(fields) != 2 {
			continue
		}
		size, err := strconv.ParseInt(strings.TrimSpace(fields[0]), 10, 64)
		if err != nil {
			continue
		}
		path := strings.TrimSpace(fields[1])
		if pathpkg.Clean(path) == pathpkg.Clean(root) {
			total = size
			continue
		}
		entries = append(entries, diskEntry{Path: path, Bytes: size, Human: humanBytes(size)})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Bytes > entries[j].Bytes })
	if limit > 0 && len(entries) > limit {
		entries = entries[:limit]
	}
	for i := range entries {
		if total > 0 {
			entries[i].Share = float64(int(float64(entries[i].Bytes)/float64(total)*1000)) / 10
		}
	}
	return entries, total
}

func cleanAbsPath(raw string) (string, error) {
	p := strings.TrimSpace(raw)
	if p == "" {
		p = "/"
	}
	if strings.ContainsRune(p, 0) || !pathpkg.IsAbs(p) {
		return "", fmt.Errorf("path must be an absolute path")
	}
	return pathpkg.Clean(p), nil
}

// ── firewall ─────────────────────────────────────────────────────────────────

type firewallRule struct {
	Port    int
	Proto   string
	From    string
	Comment string
}

// validateFirewallRule checks a rule request; `from` may be "", "any", an IP or a CIDR.
func validateFirewallRule(portRaw int, proto, from, comment string, confirmPublic bool) (firewallRule, error) {
	rule := firewallRule{Port: portRaw, Proto: strings.ToLower(strings.TrimSpace(proto)), Comment: strings.TrimSpace(comment)}
	if rule.Port < 1 || rule.Port > 65535 {
		return rule, fmt.Errorf("port must be between 1 and 65535")
	}
	if rule.Proto == "" {
		rule.Proto = "tcp"
	}
	if rule.Proto != "tcp" && rule.Proto != "udp" {
		return rule, fmt.Errorf("proto must be tcp or udp")
	}
	if !commentRe.MatchString(rule.Comment) {
		return rule, fmt.Errorf("comment may only contain letters, digits, space and . _ : @ / - (max 60)")
	}

	from = strings.TrimSpace(strings.ToLower(from))
	switch from {
	case "", "any", "anywhere":
		rule.From = "any"
	default:
		if strings.Contains(from, "/") {
			if _, _, err := net.ParseCIDR(from); err != nil {
				return rule, fmt.Errorf("from is not a valid CIDR: %q", from)
			}
		} else if net.ParseIP(from) == nil {
			return rule, fmt.Errorf("from must be an IP address or CIDR")
		}
		rule.From = from
	}

	if service, sensitive := sensitivePorts[rule.Port]; sensitive && rule.From == "any" && !confirmPublic {
		return rule, fmt.Errorf("port %d (%s) would be open to the whole internet; restrict `from` to a trusted IP/CIDR or set confirm_public=true if that is really intended", rule.Port, service)
	}
	return rule, nil
}

// ── postgres ─────────────────────────────────────────────────────────────────

func validatePostgresAddresses(raw string, confirmPublic bool) (string, error) {
	parts := strings.Split(raw, ",")
	clean := make([]string, 0, len(parts))
	public := false
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if !pgAddrRe.MatchString(p) {
			return "", fmt.Errorf("invalid listen address %q", p)
		}
		if p != "*" && p != "localhost" && net.ParseIP(p) == nil {
			return "", fmt.Errorf("invalid listen address %q", p)
		}
		if p == "*" || p == "0.0.0.0" || p == "::" {
			public = true
		}
		clean = append(clean, p)
	}
	if len(clean) == 0 {
		return "", fmt.Errorf("at least one listen address is required")
	}
	if public && !confirmPublic {
		return "", fmt.Errorf("listening on all interfaces exposes PostgreSQL; list specific addresses (for example the Tailscale IP) or set confirm_public=true")
	}
	return strings.Join(clean, ","), nil
}

func validatePostgresHBA(database, user, cidr string, confirmPublic bool) (string, error) {
	if !identRe.MatchString(database) {
		return "", fmt.Errorf("database must be a plain identifier")
	}
	if !identRe.MatchString(user) {
		return "", fmt.Errorf("user must be a plain identifier")
	}
	ip, network, err := net.ParseCIDR(strings.TrimSpace(cidr))
	if err != nil {
		return "", fmt.Errorf("cidr must be like 100.64.0.0/10 or 203.0.113.7/32")
	}
	ones, _ := network.Mask.Size()
	if ones == 0 && !confirmPublic {
		return "", fmt.Errorf("%s allows every address; narrow the CIDR or set confirm_public=true", cidr)
	}
	_ = ip
	return network.String(), nil
}

func psql(ctx context.Context, statement string) (string, error) {
	if _, err := exec.LookPath("psql"); err != nil {
		return "", fmt.Errorf("psql is not installed on this host")
	}
	if os.Geteuid() == 0 {
		if _, err := exec.LookPath("runuser"); err == nil {
			return runCmd(ctx, 20*time.Second, "runuser", "-u", "postgres", "--", "psql", "-v", "ON_ERROR_STOP=1", "-tAc", statement)
		}
	}
	return runCmd(ctx, 20*time.Second, "psql", "-v", "ON_ERROR_STOP=1", "-tAc", statement)
}

// registerOpsTools adds host operation tools (admin only).
func registerOpsTools(s *Server) {
	s.Register(Tool{
		Name:        "disk_usage_breakdown",
		Description: "Find what fills the disk: filesystem usage of the mount holding `path` plus the largest sub-directories (one filesystem only, via du). Read-only; run it before disk_cleanup.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"path":  {Type: "string", Description: "Absolute directory to analyse. Default /."},
				"depth": {Type: "integer", Description: "Directory depth to report (1-3). Default 1.", Default: 1},
				"limit": {Type: "integer", Description: "Number of largest entries to return (1-50). Default 15.", Default: 15},
			},
		},
		Annotations: &ToolAnnotations{Title: "Disk usage breakdown", ReadOnlyHint: true, IdempotentHint: true},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		root, err := cleanAbsPath(stringArg(args, "path", "/"))
		if err != nil {
			return "", err
		}
		depth := intArg(args, "depth", 1)
		if depth < 1 {
			depth = 1
		}
		if depth > 3 {
			depth = 3
		}
		limit := intArg(args, "limit", 15)
		if limit < 1 || limit > 50 {
			limit = 15
		}

		result := map[string]any{"path": root}
		if df, err := runCmd(ctx, 10*time.Second, "df", "-P", "-B1", root); err == nil {
			lines := strings.Split(df, "\n")
			if len(lines) >= 2 {
				f := strings.Fields(lines[len(lines)-1])
				if len(f) >= 6 {
					total, _ := strconv.ParseInt(f[1], 10, 64)
					used, _ := strconv.ParseInt(f[2], 10, 64)
					avail, _ := strconv.ParseInt(f[3], 10, 64)
					result["filesystem"] = map[string]any{
						"device": f[0], "mount": f[5], "usedPercent": f[4],
						"total": humanBytes(total), "used": humanBytes(used), "available": humanBytes(avail),
					}
				}
			}
		}

		out, duErr := runCmd(ctx, 45*time.Second, "du", "-x", "-B1", "--max-depth="+strconv.Itoa(depth), root)
		// du exits non-zero on unreadable entries but still prints usable sizes
		if out == "" && duErr != nil {
			return "", duErr
		}
		entries, total := parseDU(out, root, limit)
		result["scannedTotal"] = humanBytes(total)
		result["largest"] = entries
		if duErr != nil {
			result["note"] = "some entries were unreadable and skipped"
		}
		return formatJSON(result)
	})

	s.Register(Tool{
		Name: "disk_cleanup",
		Description: "Reclaim disk space from safe, regenerable data: unused Docker images and build cache (never volumes or running containers), the APT package cache, and old systemd journal logs. " +
			"dry_run defaults to true and only reports what would be freed; set dry_run=false to apply. Ask the user before applying.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"targets":   {Type: "array", Description: "Any of: docker, apt, journal.", Items: &Property{Type: "string", Enum: []string{"docker", "apt", "journal"}}},
				"dry_run":   {Type: "boolean", Description: "Only report (default true).", Default: true},
				"keep_days": {Type: "integer", Description: "Journal retention in days (1-90). Default 7.", Default: 7},
			},
			Required: []string{"targets"},
		},
		Annotations: &ToolAnnotations{Title: "Disk cleanup", DestructiveHint: true},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		raw, _ := args["targets"].([]any)
		targets := map[string]bool{}
		for _, v := range raw {
			name := strings.ToLower(strings.TrimSpace(fmt.Sprint(v)))
			switch name {
			case "docker", "apt", "journal":
				targets[name] = true
			default:
				return "", fmt.Errorf("unknown cleanup target %q (use docker, apt, journal)", name)
			}
		}
		if len(targets) == 0 {
			return "", fmt.Errorf("targets is required: docker, apt and/or journal")
		}
		dryRun := boolArg(args, "dry_run", true)
		keepDays := intArg(args, "keep_days", 7)
		if keepDays < 1 || keepDays > 90 {
			keepDays = 7
		}

		report := map[string]any{"dryRun": dryRun}
		freeBefore := freeBytes(ctx, "/")

		if targets["docker"] {
			entry := map[string]any{}
			if dryRun {
				out, err := runCmd(ctx, 30*time.Second, "docker", "system", "df")
				entry["wouldAffect"] = "dangling/unused images and build cache"
				entry["usage"] = out
				if err != nil {
					entry["error"] = err.Error()
				}
			} else {
				img, err1 := runCmd(ctx, 120*time.Second, "docker", "image", "prune", "-f")
				bld, err2 := runCmd(ctx, 120*time.Second, "docker", "builder", "prune", "-f")
				entry["imagePrune"] = lastLine(img)
				entry["builderPrune"] = lastLine(bld)
				if err1 != nil {
					entry["imageError"] = err1.Error()
				}
				if err2 != nil {
					entry["builderError"] = err2.Error()
				}
			}
			report["docker"] = entry
		}

		if targets["apt"] {
			entry := map[string]any{}
			if dryRun {
				out, _ := runCmd(ctx, 20*time.Second, "du", "-sb", "/var/cache/apt")
				entry["cacheBytes"] = strings.Fields(out + " ")[0]
			} else if _, err := exec.LookPath("apt-get"); err != nil {
				entry["error"] = "apt-get is not available on this host"
			} else if _, err := runCmd(ctx, 60*time.Second, "apt-get", "clean"); err != nil {
				entry["error"] = err.Error()
			} else {
				entry["result"] = "apt cache cleaned"
			}
			report["apt"] = entry
		}

		if targets["journal"] {
			entry := map[string]any{}
			if _, err := exec.LookPath("journalctl"); err != nil {
				entry["error"] = "journalctl is not available on this host"
			} else if dryRun {
				out, _ := runCmd(ctx, 15*time.Second, "journalctl", "--disk-usage")
				entry["usage"] = out
				entry["wouldKeepDays"] = keepDays
			} else {
				out, err := runCmd(ctx, 60*time.Second, "journalctl", "--vacuum-time="+strconv.Itoa(keepDays)+"d")
				entry["result"] = lastLine(out)
				if err != nil {
					entry["error"] = err.Error()
				}
			}
			report["journal"] = entry
		}

		if !dryRun {
			freeAfter := freeBytes(ctx, "/")
			report["freedBytes"] = freeAfter - freeBefore
			report["freed"] = humanBytes(maxInt64(freeAfter-freeBefore, 0))
		}
		return formatJSON(report)
	})

	s.Register(Tool{
		Name:        "firewall_status",
		Description: "Show UFW status and numbered rules (use the numbers with firewall_remove).",
		InputSchema: InputSchema{Type: "object"},
		Annotations: &ToolAnnotations{Title: "Firewall status", ReadOnlyHint: true, IdempotentHint: true},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		if _, err := exec.LookPath("ufw"); err != nil {
			return "", fmt.Errorf("ufw is not installed on this host")
		}
		return runCmd(ctx, 15*time.Second, "ufw", "status", "numbered")
	})

	s.Register(Tool{
		Name: "firewall_allow",
		Description: "Open a port in UFW, preferably only for a trusted source (`from` IP or CIDR). Database, SSH, Docker, Redis and similar ports refuse an open-to-everyone rule " +
			"unless confirm_public=true. Needs UFW to be active to take effect.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"port":           {Type: "integer", Description: "Port number 1-65535."},
				"proto":          {Type: "string", Description: "tcp (default) or udp.", Enum: []string{"tcp", "udp"}},
				"from":           {Type: "string", Description: "Source IP or CIDR, e.g. 100.64.0.0/10. Omit for any source."},
				"comment":        {Type: "string", Description: "Label stored with the rule (max 60 chars)."},
				"confirm_public": {Type: "boolean", Description: "Required to expose a sensitive port to any source."},
			},
			Required: []string{"port"},
		},
		Annotations: &ToolAnnotations{Title: "Allow firewall port"},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		rule, err := validateFirewallRule(intArg(args, "port", 0), stringArg(args, "proto", "tcp"), stringArg(args, "from", ""), stringArg(args, "comment", ""), boolArg(args, "confirm_public", false))
		if err != nil {
			return "", err
		}
		if _, lerr := exec.LookPath("ufw"); lerr != nil {
			return "", fmt.Errorf("ufw is not installed on this host")
		}
		cmdArgs := []string{"allow"}
		if rule.From != "any" {
			cmdArgs = append(cmdArgs, "from", rule.From, "to", "any", "port", strconv.Itoa(rule.Port), "proto", rule.Proto)
		} else {
			cmdArgs = append(cmdArgs, fmt.Sprintf("%d/%s", rule.Port, rule.Proto))
		}
		if rule.Comment != "" {
			cmdArgs = append(cmdArgs, "comment", rule.Comment)
		}
		return runCmd(ctx, 20*time.Second, "ufw", cmdArgs...)
	})

	s.Register(Tool{
		Name:        "firewall_remove",
		Description: "Delete a UFW rule by its number from firewall_status. Rule numbers shift after each deletion, so re-run firewall_status between removals. Ask the user before calling.",
		InputSchema: InputSchema{
			Type:       "object",
			Properties: map[string]Property{"number": {Type: "integer", Description: "Rule number from firewall_status."}},
			Required:   []string{"number"},
		},
		Annotations: &ToolAnnotations{Title: "Remove firewall rule", DestructiveHint: true},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		n := intArg(args, "number", 0)
		if n < 1 || n > 9999 {
			return "", fmt.Errorf("number must be a rule number from firewall_status")
		}
		if _, err := exec.LookPath("ufw"); err != nil {
			return "", fmt.Errorf("ufw is not installed on this host")
		}
		return runCmd(ctx, 20*time.Second, "ufw", "--force", "delete", strconv.Itoa(n))
	})

	s.Register(Tool{
		Name:        "postgres_listen_status",
		Description: "Inspect how PostgreSQL is exposed: listen_addresses, port, hba file, non-local pg_hba rules and whether the port is listening. Read-only; run it before changing exposure.",
		InputSchema: InputSchema{Type: "object"},
		Annotations: &ToolAnnotations{Title: "PostgreSQL exposure", ReadOnlyHint: true, IdempotentHint: true},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		query := `SELECT json_build_object(
  'listen_addresses', current_setting('listen_addresses'),
  'port', current_setting('port'),
  'hba_file', current_setting('hba_file'),
  'version', current_setting('server_version'),
  'remote_rules', (SELECT coalesce(json_agg(json_build_object('line', line_number, 'type', type, 'database', database, 'user', user_name, 'address', address, 'method', auth_method)), '[]'::json)
                   FROM pg_hba_file_rules WHERE type LIKE 'host%' AND address IS NOT NULL AND address NOT IN ('127.0.0.1','::1','localhost'))
);`
		out, err := psql(ctx, query)
		if err != nil {
			return "", err
		}
		var parsed map[string]any
		if json.Unmarshal([]byte(out), &parsed) != nil {
			return out, nil
		}
		if listening, lerr := runCmd(ctx, 10*time.Second, "ss", "-ltnH", "sport", "=", ":"+fmt.Sprint(parsed["port"])); lerr == nil {
			parsed["socketsListening"] = strings.Split(listening, "\n")
		}
		return formatJSON(parsed)
	})

	s.Register(Tool{
		Name: "postgres_listen_set",
		Description: "Change PostgreSQL listen_addresses (ALTER SYSTEM) and restart the service so remote clients can connect, e.g. \"127.0.0.1,100.64.0.5\". " +
			"Pair it with postgres_hba_allow and firewall_allow restricted to the client's IP. Listening on * or 0.0.0.0 requires confirm_public=true. Restarting drops active connections.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"addresses":      {Type: "string", Description: `Comma separated IPs, "localhost" or "*".`},
				"confirm_public": {Type: "boolean", Description: "Required when listening on all interfaces."},
			},
			Required: []string{"addresses"},
		},
		Annotations: &ToolAnnotations{Title: "Set PostgreSQL listen addresses", DestructiveHint: true},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		addrs, err := validatePostgresAddresses(stringArg(args, "addresses", ""), boolArg(args, "confirm_public", false))
		if err != nil {
			return "", err
		}
		// Single quotes cannot appear: pgAddrRe only admits [*A-Za-z0-9:.]
		if _, err := psql(ctx, fmt.Sprintf("ALTER SYSTEM SET listen_addresses = '%s';", addrs)); err != nil {
			return "", err
		}
		if _, err := runCmd(ctx, 60*time.Second, "systemctl", "restart", "postgresql"); err != nil {
			return "", fmt.Errorf("listen_addresses saved but restarting postgresql failed: %w", err)
		}
		return fmt.Sprintf("listen_addresses set to %q and PostgreSQL restarted. Verify with postgres_listen_status.", addrs), nil
	})

	s.Register(Tool{
		Name: "postgres_hba_allow",
		Description: "Allow one role to reach one database from a network over TCP with scram-sha-256 by appending a pg_hba.conf rule and reloading. " +
			"Use a narrow CIDR (a /32 for a single client). 0.0.0.0/0 requires confirm_public=true.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"database":       {Type: "string", Description: "Database name."},
				"user":           {Type: "string", Description: "Role name."},
				"cidr":           {Type: "string", Description: "Client network, e.g. 203.0.113.7/32."},
				"confirm_public": {Type: "boolean", Description: "Required for a rule that matches every address."},
			},
			Required: []string{"database", "user", "cidr"},
		},
		Annotations: &ToolAnnotations{Title: "Allow PostgreSQL client network", DestructiveHint: true},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		network, err := validatePostgresHBA(stringArg(args, "database", ""), stringArg(args, "user", ""), stringArg(args, "cidr", ""), boolArg(args, "confirm_public", false))
		if err != nil {
			return "", err
		}
		hba, err := psql(ctx, "SHOW hba_file;")
		if err != nil {
			return "", err
		}
		hba = strings.TrimSpace(hba)
		if !pathpkg.IsAbs(hba) {
			return "", fmt.Errorf("unexpected hba_file location %q", hba)
		}
		line := fmt.Sprintf("host    %s    %s    %s    scram-sha-256\n", stringArg(args, "database", ""), stringArg(args, "user", ""), network)
		existing, _ := os.ReadFile(hba)
		if bytes.Contains(existing, []byte(strings.TrimSpace(line))) {
			return "An identical pg_hba.conf rule already exists.", nil
		}
		f, err := os.OpenFile(hba, os.O_APPEND|os.O_WRONLY, 0)
		if err != nil {
			return "", fmt.Errorf("cannot write %s: %w", hba, err)
		}
		_, werr := f.WriteString("# added by Reneo MCP " + time.Now().UTC().Format(time.RFC3339) + "\n" + line)
		_ = f.Close()
		if werr != nil {
			return "", werr
		}
		if _, err := psql(ctx, "SELECT pg_reload_conf();"); err != nil {
			return "", fmt.Errorf("rule appended but reload failed: %w", err)
		}
		return fmt.Sprintf("Allowed %s on %s from %s (scram-sha-256) in %s and reloaded.", stringArg(args, "user", ""), stringArg(args, "database", ""), network, hba), nil
	})
}

func freeBytes(ctx context.Context, path string) int64 {
	out, err := runCmd(ctx, 10*time.Second, "df", "-P", "-B1", path)
	if err != nil {
		return 0
	}
	lines := strings.Split(out, "\n")
	f := strings.Fields(lines[len(lines)-1])
	if len(f) < 4 {
		return 0
	}
	n, _ := strconv.ParseInt(f[3], 10, 64)
	return n
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
