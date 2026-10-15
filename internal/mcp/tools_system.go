package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/runtimepath"
	"github.com/friskipradana/panel-desktop-ui/internal/system"
	"github.com/friskipradana/panel-desktop-ui/internal/updater"
)

// registerSystemTools adds system-related tools to the server.
func registerSystemTools(s *Server, cfg systemConfig) {
	s.Register(Tool{
		Name:        "system_info",
		Description: "Get server system information: hostname, OS, kernel, uptime, CPU usage, memory, storage, network I/O, Docker status, and IP addresses.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		summary := system.Inspect(cfg.PortainerURL, cfg.StateDir)
		return formatJSON(summary)
	})

	s.Register(Tool{
		Name:        "system_logs",
		Description: "Read systemd service logs via journalctl. Returns the last N lines for a given service.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"service": {
					Type:        "string",
					Description: "Systemd service name (e.g. 'reneo', 'nginx', 'docker'). 'reneo' and 'ypanel' resolve to the installed panel unit. Defaults to 'reneo'.",
				},
				"limit": {
					Type:        "integer",
					Description: "Number of log lines to return (1–400). Defaults to 100.",
					Default:     100,
				},
			},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		service := runtimepath.ResolveServiceAlias(stringArg(args, "service", runtimepath.Name))
		limit := intArg(args, "limit", 100)
		entries, err := system.ReadServiceLogs(service, limit)
		if err != nil {
			return "", err
		}
		lines := make([]string, 0, len(entries))
		for _, e := range entries {
			lines = append(lines, e.Line)
		}
		return fmt.Sprintf("=== Logs: %s (last %d lines) ===\n%s", service, len(lines), strings.Join(lines, "\n")), nil
	})

	s.Register(Tool{
		Name:        "update_check",
		Description: "Check GitHub Releases to see if a newer Reneo version is available.",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		current := "dev"
		if b, err := os.ReadFile(runtimepath.VersionFile()); err == nil {
			if v := strings.TrimSpace(string(b)); v != "" {
				current = strings.TrimPrefix(v, "v")
			}
		}
		info := updater.New().Check(ctx, current, false)
		return formatJSON(info)
	})
}

// systemConfig holds config fields needed by system tools.
type systemConfig struct {
	PortainerURL string
	StateDir     string
}

// --- helpers ---

func formatJSON(v any) (string, error) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "", fmt.Errorf("json marshal: %w", err)
	}
	return string(b), nil
}

func stringArg(args map[string]any, key, def string) string {
	if v, ok := args[key]; ok {
		if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
	}
	return def
}

func intArg(args map[string]any, key string, def int) int {
	if v, ok := args[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		case string:
			if i, err := strconv.Atoi(n); err == nil {
				return i
			}
		}
	}
	return def
}

func boolArg(args map[string]any, key string, def bool) bool {
	if v, ok := args[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
		if s, ok := v.(string); ok {
			switch strings.ToLower(s) {
			case "true", "1", "yes":
				return true
			case "false", "0", "no":
				return false
			}
		}
	}
	return def
}
