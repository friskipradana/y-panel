package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	BindAddr       string
	AllowedHosts   []string
	AllowedOrigins []string
	AdminUsername  string
	AdminPassword  string
	SessionSecret  string
	SessionTTL     time.Duration
	StateDir       string
	PortainerURL   string
	InstallChannel string
	FrontendDir    string
	DatabaseHost   string
	DatabasePort   int
	DatabaseUser   string
	DatabasePass   string
	DatabaseName   string
	DatabaseEnable bool
}

func Load() (Config, error) {
	cfg := Config{
		BindAddr:       getenv("PANEL_BIND_ADDR", "0.0.0.0:8787"),
		AllowedHosts:   parseCSVEnv("PANEL_ALLOWED_HOSTS", nil),
		AllowedOrigins: parseCSVEnv("PANEL_ALLOWED_ORIGINS", nil),
		AdminUsername:  os.Getenv("PANEL_ADMIN_USERNAME"),
		AdminPassword:  os.Getenv("PANEL_ADMIN_PASSWORD"),
		SessionSecret:  getenv("PANEL_SESSION_SECRET", "dev-session-secret"),
		SessionTTL:     parseDurationEnv("PANEL_SESSION_TTL", 12*time.Hour),
		StateDir:       getenv("PANEL_STATE_DIR", "/var/lib/ui-panel"),
		PortainerURL:   getenv("PANEL_PORTAINER_URL", "http://127.0.0.1:9000"),
		InstallChannel: getenv("PANEL_INSTALL_CHANNEL", "stable"),
		FrontendDir:    getenv("PANEL_FRONTEND_DIR", "/opt/ui-panel/frontend"),
		DatabaseHost:   getenv("PANEL_DB_HOST", "127.0.0.1"),
		DatabasePort:   parseIntEnv("PANEL_DB_PORT", 3306),
		DatabaseUser:   getenv("PANEL_DB_USER", "ui_panel"),
		DatabasePass:   os.Getenv("PANEL_DB_PASSWORD"),
		DatabaseName:   getenv("PANEL_DB_NAME", "ui_panel"),
		DatabaseEnable: parseBoolEnv("PANEL_DB_ENABLED", true),
	}

	if cfg.AdminUsername == "" {
		return Config{}, errors.New("missing PANEL_ADMIN_USERNAME")
	}
	if cfg.AdminPassword == "" {
		return Config{}, errors.New("missing PANEL_ADMIN_PASSWORD")
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
