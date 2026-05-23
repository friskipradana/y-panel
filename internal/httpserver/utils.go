package httpserver

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/config"
	"github.com/gorilla/websocket"
)

// ─── Secret & Token Utilities ────────────────────────────────────────────────

func generateSecretToken(byteLength int) (string, error) {
	if byteLength <= 0 {
		byteLength = 24
	}
	buffer := make([]byte, byteLength)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("failed to generate secure token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

// ─── Environment File Utilities ──────────────────────────────────────────────

func rewriteEnvValue(path, key, value string) error {
	contents, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("gagal membaca env runtime: %w", err)
	}
	lines := strings.Split(string(contents), "\n")
	prefix := key + "="
	updated := false
	for index, line := range lines {
		if strings.HasPrefix(line, prefix) {
			lines[index] = prefix + value
			updated = true
			break
		}
	}
	if !updated {
		lines = append(lines, prefix+value)
	}
	return os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0o600)
}

func runtimeEnvPath() string {
	newPath := filepath.Join("/etc", "ypanel", "agent.env")
	if _, err := os.Stat(newPath); err == nil {
		return newPath
	}
	legacyPath := filepath.Join("/etc", "ui-panel", "agent.env")
	if _, err := os.Stat(legacyPath); err == nil {
		return legacyPath
	}
	return newPath
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

// ─── Database DSN Utilities ──────────────────────────────────────────────────

func replaceDSNPassword(rawDSN, password string) (string, error) {
	if strings.TrimSpace(rawDSN) == "" {
		return "", fmt.Errorf("PANEL_DATABASE_DSN kosong")
	}
	parsed, err := url.Parse(rawDSN)
	if err != nil {
		return "", fmt.Errorf("DSN tidak valid: %w", err)
	}
	user := parsed.User.Username()
	if user == "" {
		return "", fmt.Errorf("username DSN kosong")
	}
	parsed.User = url.UserPassword(user, password)
	return parsed.String(), nil
}

func redactDSNPassword(rawDSN string) string {
	parsed, err := url.Parse(rawDSN)
	if err != nil {
		return rawDSN
	}
	user := parsed.User.Username()
	if user == "" {
		return rawDSN
	}
	parsed.User = url.UserPassword(user, "***")
	return parsed.String()
}

func rotateDatabasePassword(cfg config.Config, password string) error {
	password = strings.TrimSpace(password)
	if password == "" {
		return fmt.Errorf("database password tidak boleh kosong")
	}

	updatedDSN, err := replaceDSNPassword(cfg.DatabaseDSN, password)
	if err != nil {
		return err
	}

	envPath := firstNonEmpty(os.Getenv("PANEL_ENV_FILE"), runtimeEnvPath())
	if err := rewriteEnvValue(envPath, "PANEL_DATABASE_DSN", updatedDSN); err != nil {
		return err
	}

	return nil
}

func runDatabaseSQL(statement string) error {
	clients := []string{"mariadb", "mysql"}
	var lastErr error
	for _, client := range clients {
		path, err := exec.LookPath(client)
		if err != nil {
			lastErr = err
			continue
		}
		cmd := exec.Command(path, "-u", "root", "-e", statement)
		output, err := cmd.CombinedOutput()
		if err == nil {
			return nil
		}
		lastErr = fmt.Errorf("%s failed: %s", client, strings.TrimSpace(string(output)))
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("MariaDB/MySQL client tidak tersedia")
	}
	return lastErr
}

func escapeSQLString(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

// ─── HTTP Request Utilities ──────────────────────────────────────────────────

func remoteAddr(r *http.Request) string {
	forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if forwarded != "" {
		parts := strings.Split(forwarded, ",")
		return strings.TrimSpace(parts[0])
	}
	return r.RemoteAddr
}

func requestKind(r *http.Request) string {
	if websocket.IsWebSocketUpgrade(r) {
		return "ws"
	}
	if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
		return "api"
	}
	if strings.HasPrefix(r.URL.Path, "/assets/") || r.URL.Path == "/favicon.ico" || r.URL.Path == "/favicon.svg" || r.URL.Path == "/icons.svg" || strings.HasPrefix(r.URL.Path, "/ChatGPT Image ") {
		return "asset"
	}
	return "page"
}

func acceptsHTML(r *http.Request) bool {
	accept := r.Header.Get("Accept")
	return accept == "" || strings.Contains(accept, "text/html") || strings.Contains(accept, "*/*")
}

func closeChannel(ch chan struct{}) {
	select {
	case <-ch:
		return
	default:
		close(ch)
	}
}

// ─── Origin / Host Normalization ─────────────────────────────────────────────

func normalizeOrigin(origin string) (string, bool) {
	trimmed := strings.TrimSpace(strings.TrimRight(origin, "/"))
	if trimmed == "" {
		return "", false
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", false
	}

	scheme := strings.ToLower(parsed.Scheme)
	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return "", false
	}

	port := parsed.Port()
	switch {
	case port != "":
		return scheme + "://" + net.JoinHostPort(host, port), true
	case scheme == "http":
		return scheme + "://" + host + ":80", true
	case scheme == "https":
		return scheme + "://" + host + ":443", true
	default:
		return scheme + "://" + host, true
	}
}

func normalizeHost(hostport string) string {
	host := strings.TrimSpace(hostport)
	if host == "" {
		return ""
	}
	if strings.Contains(host, ":") {
		if parsedHost, _, err := net.SplitHostPort(host); err == nil {
			host = parsedHost
		}
	}
	return strings.Trim(strings.ToLower(host), "[]")
}

func effectiveRequestOrigin(r *http.Request) string {
	if r == nil || strings.TrimSpace(r.Host) == "" {
		return ""
	}

	scheme := "http"
	if forwardedProto := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0]); forwardedProto != "" {
		scheme = strings.ToLower(forwardedProto)
	} else if r.TLS != nil {
		scheme = "https"
	}

	origin, ok := normalizeOrigin(scheme + "://" + strings.TrimSpace(r.Host))
	if !ok {
		return ""
	}
	return origin
}
