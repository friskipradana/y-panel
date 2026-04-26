package config

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	managedOriginsBlockBegin = "# UI_PANEL_ALLOWED_ORIGINS_BEGIN"
	managedOriginsBlockEnd   = "# UI_PANEL_ALLOWED_ORIGINS_END"
	managedOriginsLinePrefix = "#|"
)

// Config holds all runtime configuration for the panel agent.
type Config struct {
	// Network
	BindAddr       string
	AllowedHosts   []string
	AllowedOrigins []string

	// Session
	SessionSecret string
	SessionTTL    time.Duration

	// PostgreSQL database
	DatabaseDSN    string
	DatabaseEnable bool

	// Storage
	StateDir    string
	FrontendDir string

	// Security hardening
	TerminalEnabled            bool
	TerminalAllowRemote        bool
	AdminFileManagerRootAccess bool

	// External services
	PortainerURL   string
	InstallChannel string

	// Panel identity
	BaseDomain    string // e.g. "panel.example.com" — used for generated subdomains
	EncryptionKey string // 32-byte hex key for encrypting CF tokens at rest
}

func Load() (Config, error) {
	cfg := Config{
		BindAddr:                   getenv("PANEL_BIND_ADDR", "0.0.0.0:8787"),
		AllowedHosts:               parseCSVEnv("PANEL_ALLOWED_HOSTS", nil),
		AllowedOrigins:             loadAllowedOrigins(),
		SessionSecret:              getenv("PANEL_SESSION_SECRET", "dev-session-secret-change-me"),
		SessionTTL:                 parseDurationEnv("PANEL_SESSION_TTL", 12*time.Hour),
		DatabaseDSN:                os.Getenv("PANEL_DATABASE_DSN"),
		DatabaseEnable:             parseBoolEnv("PANEL_DB_ENABLED", true),
		StateDir:                   getenv("PANEL_STATE_DIR", "/var/lib/ui-panel"),
		FrontendDir:                getenv("PANEL_FRONTEND_DIR", "/opt/ui-panel/frontend"),
		TerminalEnabled:            parseBoolEnv("PANEL_TERMINAL_ENABLED", true),
		TerminalAllowRemote:        parseBoolEnv("PANEL_TERMINAL_ALLOW_REMOTE", false),
		AdminFileManagerRootAccess: parseBoolEnv("PANEL_ADMIN_FILE_ROOT_ACCESS", false),
		PortainerURL:               os.Getenv("PANEL_PORTAINER_URL"),
		InstallChannel:             getenv("PANEL_INSTALL_CHANNEL", "stable"),
		BaseDomain:                 os.Getenv("PANEL_BASE_DOMAIN"),
		EncryptionKey:              os.Getenv("PANEL_ENCRYPTION_KEY"),
	}

	if cfg.DatabaseEnable && cfg.DatabaseDSN == "" {
		return Config{}, errors.New("PANEL_DATABASE_DSN is required when PANEL_DB_ENABLED=true")
	}

	if cfg.EncryptionKey == "" {
		// Warn but don't fail — Cloudflare token encryption will be unavailable
		cfg.EncryptionKey = "0000000000000000000000000000000000000000000000000000000000000000"
	}

	return cfg, nil
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func parseDurationEnv(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func parseIntEnv(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func parseBoolEnv(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	switch strings.ToLower(value) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func parseCSVEnv(key string, fallback []string) []string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}

	if len(result) == 0 {
		return fallback
	}
	return result
}

func loadAllowedOrigins() []string {
	if origins, found := readAllowedOriginsFromRawFile(); found {
		return origins
	}
	if origins, found := readAllowedOriginsFromManagedBlock(); found {
		return origins
	}
	return parseCSVEnv("PANEL_ALLOWED_ORIGINS", nil)
}

func readAllowedOriginsFromRawFile() ([]string, bool) {
	envPath := firstNonEmpty(os.Getenv("PANEL_ENV_FILE"), filepath.Join("/etc", "ui-panel", "agent.env"))
	rawPath := filepath.Join(filepath.Dir(envPath), "allowed-origins.raw")
	data, err := os.ReadFile(rawPath)
	if err != nil {
		return nil, false
	}
	result := make([]string, 0)
	seen := map[string]struct{}{}
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		value := strings.TrimRight(trimmed, "/")
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result, true
}

func readAllowedOriginsFromManagedBlock() ([]string, bool) {
	envPath := firstNonEmpty(os.Getenv("PANEL_ENV_FILE"), filepath.Join("/etc", "ui-panel", "agent.env"))
	data, err := os.ReadFile(envPath)
	if err != nil {
		return nil, false
	}
	lines := strings.Split(string(data), "\n")
	start := -1
	end := -1
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == managedOriginsBlockBegin {
			start = i
			continue
		}
		if trimmed == managedOriginsBlockEnd && start >= 0 {
			end = i
			break
		}
	}
	if start < 0 || end < start {
		return nil, false
	}

	result := make([]string, 0, end-start-1)
	seen := map[string]struct{}{}
	for _, line := range lines[start+1 : end] {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || trimmed == "#" {
			continue
		}

		var content string
		if strings.HasPrefix(trimmed, managedOriginsLinePrefix) {
			content = strings.TrimSpace(strings.TrimPrefix(trimmed, managedOriginsLinePrefix))
		} else {
			if !strings.HasPrefix(trimmed, "#") {
				continue
			}
			content = strings.TrimSpace(strings.TrimPrefix(trimmed, "#"))
		}

		if content == "" || strings.HasPrefix(content, "#") {
			continue
		}
		value := strings.TrimRight(content, "/")
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result, true
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

// Kept for backward compatibility with system package
var _ = parseIntEnv
