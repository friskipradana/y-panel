// Package runtimepath resolves where the agent lives on a Linux host and which
// environment variable names it understands.
//
// The product is called Reneo. Installations made before the rename use the
// ypanel names (/opt/ypanel, /etc/ypanel, /var/lib/ypanel, ypanel.service), so
// every lookup prefers the new name and falls back to the legacy one when only
// that exists. Everything can also be pointed elsewhere with RENEO_* variables.
package runtimepath

import (
	"os"
	"path/filepath"
	"strings"
)

const (
	// Name is the current product and runtime name.
	Name = "reneo"
	// LegacyName is the name used before the rename.
	LegacyName = "ypanel"

	envPrefix    = "RENEO_"
	legacyPrefix = "PANEL_"
)

// ApplyEnvAliases lets RENEO_<NAME> stand in for PANEL_<NAME>. A RENEO_ value wins
// when both are set, so the new names can be used without touching old files.
func ApplyEnvAliases() {
	for _, kv := range os.Environ() {
		key, value, ok := strings.Cut(kv, "=")
		if !ok || !strings.HasPrefix(key, envPrefix) || strings.TrimSpace(value) == "" {
			continue
		}
		suffix := strings.TrimPrefix(key, envPrefix)
		switch suffix {
		case "HOME", "CONFIG_DIR", "SERVICE_NAME":
			// runtimepath-only settings, not aliases of PANEL_* variables
			continue
		}
		_ = os.Setenv(legacyPrefix+suffix, value)
	}
}

// Getenv reads RENEO_<suffix> first, then PANEL_<suffix>.
func Getenv(suffix string) string {
	if v := strings.TrimSpace(os.Getenv(envPrefix + suffix)); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv(legacyPrefix + suffix))
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// pick returns the new location, or the legacy one when only that exists.
func pick(newPath, legacyPath string) string {
	if exists(newPath) {
		return newPath
	}
	if exists(legacyPath) {
		return legacyPath
	}
	return newPath
}

// InstallRoot is the directory holding the frontend bundle and VERSION file.
func InstallRoot() string {
	if v := strings.TrimSpace(os.Getenv("RENEO_HOME")); v != "" {
		return v
	}
	return pick(filepath.Join("/opt", Name), filepath.Join("/opt", LegacyName))
}

// ConfigDir holds agent.env.
func ConfigDir() string {
	if v := strings.TrimSpace(os.Getenv("RENEO_CONFIG_DIR")); v != "" {
		return v
	}
	return pick(filepath.Join("/etc", Name), filepath.Join("/etc", LegacyName))
}

// StateDir is the writable data directory.
func StateDir() string {
	if v := Getenv("STATE_DIR"); v != "" {
		return v
	}
	return pick(filepath.Join("/var/lib", Name), filepath.Join("/var/lib", LegacyName))
}

// FrontendDir is the built web UI.
func FrontendDir() string {
	if v := Getenv("FRONTEND_DIR"); v != "" {
		return v
	}
	return filepath.Join(InstallRoot(), "frontend")
}

// EnvFile returns the agent.env path to read and write.
func EnvFile() string {
	if v := Getenv("ENV_FILE"); v != "" {
		return v
	}
	candidates := []string{
		filepath.Join(ConfigDir(), "agent.env"),
		filepath.Join("/etc", Name, "agent.env"),
		filepath.Join("/etc", LegacyName, "agent.env"),
		filepath.Join("/etc", "ui-panel", "agent.env"),
	}
	for _, c := range candidates {
		if exists(c) {
			return c
		}
	}
	return candidates[0]
}

// EnvFileCandidates lists agent.env locations in lookup order.
func EnvFileCandidates() []string {
	if v := Getenv("ENV_FILE"); v != "" {
		return []string{v}
	}
	seen := map[string]bool{}
	var out []string
	for _, c := range []string{
		filepath.Join(ConfigDir(), "agent.env"),
		filepath.Join("/etc", Name, "agent.env"),
		filepath.Join("/etc", LegacyName, "agent.env"),
		filepath.Join("/etc", "ui-panel", "agent.env"),
	} {
		if !seen[c] {
			seen[c] = true
			out = append(out, c)
		}
	}
	return out
}

// VersionFile is written by the installer next to the frontend.
func VersionFile() string {
	return filepath.Join(InstallRoot(), "VERSION")
}

// ServiceName is the systemd unit to read logs from or control.
// RENEO_SERVICE_NAME wins; otherwise the unit that exists on disk.
func ServiceName() string {
	if v := strings.TrimSpace(os.Getenv("RENEO_SERVICE_NAME")); v != "" {
		return v
	}
	for _, dir := range []string{"/etc/systemd/system", "/lib/systemd/system", "/usr/lib/systemd/system"} {
		if exists(filepath.Join(dir, Name+".service")) {
			return Name
		}
	}
	for _, dir := range []string{"/etc/systemd/system", "/lib/systemd/system", "/usr/lib/systemd/system"} {
		if exists(filepath.Join(dir, LegacyName+".service")) {
			return LegacyName
		}
	}
	return Name
}

// ResolveServiceAlias maps the product names to the unit that really exists, so
// callers (UI, MCP) can always say "reneo" or "ypanel" and get the right journal.
func ResolveServiceAlias(service string) string {
	switch strings.ToLower(strings.TrimSpace(service)) {
	case Name, LegacyName, Name + ".service", LegacyName + ".service":
		return ServiceName()
	}
	return service
}

// BinaryPath is where the agent binary is installed (informational, for docs/UI).
func BinaryPath() string {
	if exists("/usr/local/bin/reneo-agent") {
		return "/usr/local/bin/reneo-agent"
	}
	if exists("/usr/local/bin/ypanel-agent") {
		return "/usr/local/bin/ypanel-agent"
	}
	return "/usr/local/bin/reneo-agent"
}
