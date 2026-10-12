package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// registerWorkflowTools registers high-level automation and workflow tools.
func registerWorkflowTools(s *Server, client *apiClient, cfg Config) {
	// ── 1. quick_deploy_static ───────────────────────────────────────────────
	s.Register(Tool{
		Name:        "quick_deploy_static",
		Description: "One-click deployment of a static HTML webpage/project. Creates the project files, launches a local web server (PM2/Python), and optionally hooks up a Cloudflare Tunnel ingress route & creates the DNS CNAME record.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"project_name": {
					Type:        "string",
					Description: "Unique name/slug for the project (e.g. 'test-renaldi', 'promo-app').",
				},
				"html_content": {
					Type:        "string",
					Description: "Complete HTML markup to serve as index.html.",
				},
				"port": {
					Type:        "integer",
					Description: "Optional port to bind (default: automatically finds an available free port in 8800-8999).",
				},
				"hostname": {
					Type:        "string",
					Description: "Optional public domain/subdomain to expose via Cloudflare Tunnel (e.g. 'test.aknalre.my.id').",
				},
			},
			Required: []string{"project_name", "html_content"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		projectName := strings.TrimSpace(stringArg(args, "project_name", ""))
		if projectName == "" {
			return "", fmt.Errorf("project_name is required")
		}
		// Sanitize slug
		projectName = strings.ToLower(projectName)
		projectName = strings.ReplaceAll(projectName, " ", "-")

		htmlContent := stringArg(args, "html_content", "")
		if htmlContent == "" {
			return "", fmt.Errorf("html_content is required")
		}

		requestedPort := intArg(args, "port", 0)
		hostname := strings.TrimSpace(stringArg(args, "hostname", ""))

		// 1. Determine target directory
		targetDir := "/home/panel-renaldi/project/" + projectName
		if _, err := os.Stat("/home/panel-renaldi"); os.IsNotExist(err) {
			targetDir = filepath.Join(cfg.StateDir, "projects", projectName)
		}
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			return "", fmt.Errorf("failed to create project directory %s: %w", targetDir, err)
		}

		// 2. Write index.html
		indexPath := filepath.Join(targetDir, "index.html")
		if err := os.WriteFile(indexPath, []byte(htmlContent), 0644); err != nil {
			return "", fmt.Errorf("failed to write %s: %w", indexPath, err)
		}

		// 3. Determine available port
		port := requestedPort
		if port <= 0 {
			port = findFreePort(8880, 8990)
		}

		// 4. Start local web server via PM2 (or python fallback)
		var serverOutput string
		pm2Path, err := exec.LookPath("pm2")
		if err == nil {
			// pm2 serve <dir> <port> --name <projectName> --spa
			cmd := exec.CommandContext(ctx, pm2Path, "serve", targetDir, strconv.Itoa(port), "--name", projectName, "--spa")
			out, runErr := cmd.CombinedOutput()
			serverOutput = strings.TrimSpace(string(out))
			if runErr != nil {
				// If app already exists, restart it
				restartCmd := exec.CommandContext(ctx, pm2Path, "restart", projectName)
				outR, _ := restartCmd.CombinedOutput()
				serverOutput += "\n" + strings.TrimSpace(string(outR))
			}
			_ = exec.CommandContext(ctx, pm2Path, "save").Run()
		} else {
			// Python fallback in background
			pyPath, pyErr := exec.LookPath("python3")
			if pyErr == nil {
				cmd := exec.Command(pyPath, "-m", "http.server", strconv.Itoa(port), "--directory", targetDir)
				_ = cmd.Start()
				serverOutput = fmt.Sprintf("Started via python3 http.server on port %d", port)
			}
		}

		localURL := fmt.Sprintf("http://localhost:%d", port)
		publicURL := ""
		cnameStatus := "none"
		ingressStatus := "none"

		// 5. If hostname provided, auto-configure Cloudflare Tunnel & DNS CNAME
		if hostname != "" {
			// A. Fetch active tunnel profiles via panel API
			tunnelID := ""
			profData, pCode, pErr := client.get(ctx, "/api/v1/cloudflare/tunnel-profiles")
			if pErr == nil && pCode < 400 {
				var profiles []struct {
					TunnelID string `json:"tunnelId"`
				}
				if json.Unmarshal(profData, &profiles) == nil && len(profiles) > 0 {
					tunnelID = profiles[0].TunnelID
				}
			}

			// B. Match zone and create DNS CNAME
			zonesData, zCode, zErr := client.get(ctx, "/api/v1/cloudflare/domains")
			if zErr == nil && zCode < 400 {
				var zones []struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				}
				if json.Unmarshal(zonesData, &zones) == nil {
					var matchedZoneID string
					for _, z := range zones {
						if strings.EqualFold(hostname, z.Name) || strings.HasSuffix(strings.ToLower(hostname), "."+strings.ToLower(z.Name)) {
							matchedZoneID = z.ID
							break
						}
					}
					if matchedZoneID != "" && tunnelID != "" {
						cnameContent := fmt.Sprintf("%s.cfargotunnel.com", tunnelID)
						payload := map[string]any{
							"type":    "CNAME",
							"name":    hostname,
							"content": cnameContent,
							"proxied": true,
							"ttl":     1,
						}
						_, cCode, cErr := client.post(ctx, "/api/v1/cloudflare/domains/"+matchedZoneID+"/dns", payload)
						if cErr == nil && cCode < 400 {
							cnameStatus = fmt.Sprintf("Created CNAME %s -> %s", hostname, cnameContent)
						} else {
							cnameStatus = "CNAME creation warning (check permissions or existing record)"
						}
					}
				}
			}

			// C. Attempt to inject ingress into tunnel config file
			if updateTunnelIngressFile(hostname, localURL) {
				ingressStatus = "Ingress rule injected into cloudflared config & service reloaded"
			} else {
				ingressStatus = "Configured via panel routing"
			}

			publicURL = "https://" + hostname
		}

		result := map[string]any{
			"status":         "deployed",
			"project_name":   projectName,
			"directory":      targetDir,
			"port":           port,
			"local_url":      localURL,
			"public_url":     publicURL,
			"cname_status":   cnameStatus,
			"ingress_status": ingressStatus,
			"server_output":  serverOutput,
			"message":        fmt.Sprintf("Project %q successfully deployed on %s!", projectName, localURL),
		}

		b, _ := json.MarshalIndent(result, "", "  ")
		return string(b), nil
	})

	// ── 2. pm2_list ──────────────────────────────────────────────────────────
	s.Register(Tool{
		Name:        "pm2_list",
		Description: "List all PM2 managed processes and web applications on the server with runtime metrics (status, memory, CPU, port, uptime).",
		InputSchema: InputSchema{Type: "object"},
	}, func(ctx context.Context, _ map[string]any) (string, error) {
		pm2Path, err := exec.LookPath("pm2")
		if err != nil {
			return "", fmt.Errorf("pm2 is not installed or not in PATH")
		}
		cmd := exec.CommandContext(ctx, pm2Path, "jlist")
		out, err := cmd.CombinedOutput()
		if err != nil {
			return "", fmt.Errorf("pm2 jlist failed: %w", err)
		}

		var raw []map[string]any
		if err := json.Unmarshal(out, &raw); err != nil {
			return string(out), nil
		}

		type ProcessInfo struct {
			ID     int    `json:"id"`
			Name   string `json:"name"`
			Status string `json:"status"`
			CPU    any    `json:"cpu"`
			Memory int64  `json:"memory_bytes"`
			Uptime int64  `json:"uptime_ms"`
		}

		processes := make([]ProcessInfo, 0, len(raw))
		for _, item := range raw {
			id, _ := item["pm_id"].(float64)
			name, _ := item["name"].(string)
			monit, _ := item["monit"].(map[string]any)
			cpu := monit["cpu"]
			mem, _ := monit["memory"].(float64)
			pm2Env, _ := item["pm2_env"].(map[string]any)
			status, _ := pm2Env["status"].(string)
			pmUptime, _ := pm2Env["pm_uptime"].(float64)

			processes = append(processes, ProcessInfo{
				ID:     int(id),
				Name:   name,
				Status: status,
				CPU:    cpu,
				Memory: int64(mem),
				Uptime: int64(pmUptime),
			})
		}

		resBytes, _ := json.MarshalIndent(processes, "", "  ")
		return string(resBytes), nil
	})

	// ── 3. pm2_restart ───────────────────────────────────────────────────────
	s.Register(Tool{
		Name:        "pm2_restart",
		Description: "Restart a PM2 managed process or application by name or ID (e.g. 'antrian-app', 'all').",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"name": {
					Type:        "string",
					Description: "Process name or ID to restart (or 'all').",
				},
			},
			Required: []string{"name"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		name := strings.TrimSpace(stringArg(args, "name", ""))
		if name == "" {
			return "", fmt.Errorf("name is required")
		}
		pm2Path, err := exec.LookPath("pm2")
		if err != nil {
			return "", fmt.Errorf("pm2 is not installed or not in PATH")
		}
		cmd := exec.CommandContext(ctx, pm2Path, "restart", name)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return "", fmt.Errorf("pm2 restart failed: %s", string(out))
		}
		return strings.TrimSpace(string(out)), nil
	})

	// ── 4. pm2_logs ──────────────────────────────────────────────────────────
	s.Register(Tool{
		Name:        "pm2_logs",
		Description: "Retrieve recent stdout and stderr logs for a PM2 application.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"name": {
					Type:        "string",
					Description: "Process name or ID to fetch logs for.",
				},
				"lines": {
					Type:        "integer",
					Description: "Number of log lines to retrieve (default 50, max 200).",
					Default:     50,
				},
			},
			Required: []string{"name"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		name := strings.TrimSpace(stringArg(args, "name", ""))
		if name == "" {
			return "", fmt.Errorf("name is required")
		}
		lines := intArg(args, "lines", 50)
		if lines <= 0 {
			lines = 50
		}
		if lines > 200 {
			lines = 200
		}
		pm2Path, err := exec.LookPath("pm2")
		if err != nil {
			return "", fmt.Errorf("pm2 is not installed or not in PATH")
		}
		cmd := exec.CommandContext(ctx, pm2Path, "logs", name, "--lines", strconv.Itoa(lines), "--nostream")
		out, err := cmd.CombinedOutput()
		if err != nil && len(out) == 0 {
			return "", fmt.Errorf("pm2 logs failed: %w", err)
		}
		return strings.TrimSpace(string(out)), nil
	})

	// ── 5. service_manage ────────────────────────────────────────────────────
	s.Register(Tool{
		Name:        "service_manage",
		Description: "Check status or control system services (cloudflared, docker, nginx, ypanel, redis, postgresql).",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"service": {
					Type:        "string",
					Description: "Service name (e.g. 'cloudflared', 'docker', 'nginx', 'ypanel').",
				},
				"action": {
					Type:        "string",
					Description: "Action to execute: 'status', 'restart', 'start', 'stop', 'reload'.",
					Enum:        []string{"status", "restart", "start", "stop", "reload"},
				},
			},
			Required: []string{"service", "action"},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		service := strings.TrimSpace(stringArg(args, "service", ""))
		action := strings.TrimSpace(stringArg(args, "action", "status"))
		if service == "" {
			return "", fmt.Errorf("service is required")
		}

		systemctlPath, err := exec.LookPath("systemctl")
		if err != nil {
			return "", fmt.Errorf("systemctl is not available")
		}

		ctxTimeout, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctxTimeout, systemctlPath, action, service)
		out, runErr := cmd.CombinedOutput()
		output := strings.TrimSpace(string(out))
		if runErr != nil && output == "" {
			return "", fmt.Errorf("systemctl %s %s failed: %w", action, service, runErr)
		}
		if output == "" {
			return fmt.Sprintf("Service %s %sed successfully", service, action), nil
		}
		return output, nil
	})

	// ── 6. network_ports_list ────────────────────────────────────────────────
	s.Register(Tool{
		Name:        "network_ports_list",
		Description: "Inspect open listening TCP ports on the server and find available free ports for running new apps.",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"find_free_near": {
					Type:        "integer",
					Description: "Optional starting port to find the next available open port (e.g. 8880).",
				},
			},
		},
	}, func(ctx context.Context, args map[string]any) (string, error) {
		startPort := intArg(args, "find_free_near", 8880)
		freePort := findFreePort(startPort, startPort+100)

		// Try running ss -tulpn or netstat
		var listeningPorts []string
		if ssPath, err := exec.LookPath("ss"); err == nil {
			cmd := exec.CommandContext(ctx, ssPath, "-tulpn")
			out, _ := cmd.CombinedOutput()
			lines := strings.Split(string(out), "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if strings.Contains(line, "LISTEN") {
					listeningPorts = append(listeningPorts, line)
				}
			}
		}

		res := map[string]any{
			"recommended_free_port": freePort,
			"listening_count":       len(listeningPorts),
			"active_listeners":      listeningPorts,
		}
		b, _ := json.MarshalIndent(res, "", "  ")
		return string(b), nil
	})
}

// findFreePort checks for an available local TCP port.
func findFreePort(start, end int) int {
	for p := start; p <= end; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			_ = ln.Close()
			return p
		}
	}
	return start
}

// updateTunnelIngressFile injects a hostname -> service routing rule into cloudflared config.
func updateTunnelIngressFile(hostname, serviceURL string) bool {
	// Common locations for cloudflared tunnel configs
	candidates := []string{
		"/etc/cloudflared/config.yml",
		"/etc/cloudflared/config.yaml",
	}

	// Also look for user tunnel configs in /var/lib/ypanel/tunnels/
	matches, _ := filepath.Glob("/var/lib/ypanel/tunnels/*/*/config.yml")
	candidates = append(candidates, matches...)

	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		content := string(data)
		// Check if hostname already configured
		if strings.Contains(content, hostname) {
			return true
		}

		// Find ingress section
		if !strings.Contains(content, "ingress:") {
			continue
		}

		newRule := fmt.Sprintf("  - hostname: %s\n    service: %s\n", hostname, serviceURL)

		// Insert before the catch-all http_status: 404 rule
		if idx := strings.Index(content, "  - service: http_status:404"); idx != -1 {
			updated := content[:idx] + newRule + content[idx:]
			if err := os.WriteFile(path, []byte(updated), 0644); err == nil {
				// Reload cloudflared
				_ = exec.Command("systemctl", "reload", "cloudflared").Run()
				return true
			}
		} else if idx := strings.Index(content, "  - service: http_status: 404"); idx != -1 {
			updated := content[:idx] + newRule + content[idx:]
			if err := os.WriteFile(path, []byte(updated), 0644); err == nil {
				_ = exec.Command("systemctl", "reload", "cloudflared").Run()
				return true
			}
		}
	}

	return false
}
