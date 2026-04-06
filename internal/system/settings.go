package system

import (
	"fmt"
	"net"
	neturl "net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

const managedResolvedConfigPath = "/etc/systemd/resolved.conf.d/ui-panel.conf"

type SettingsSnapshot struct {
	Hostname          string   `json:"hostname"`
	Timezone          string   `json:"timezone"`
	Nameservers       []string `json:"nameservers"`
	DNSMode           string   `json:"dnsMode"`
	ManagedConfigPath string   `json:"managedConfigPath"`
	OSName            string   `json:"osName"`
	Kernel            string   `json:"kernel"`
	BindAddr          string   `json:"bindAddr"`
	AllowedHosts      []string `json:"allowedHosts"`
	AllowedOrigins    []string `json:"allowedOrigins"`
}

type SettingsUpdate struct {
	Hostname       string   `json:"hostname"`
	Timezone       string   `json:"timezone"`
	Nameservers    []string `json:"nameservers"`
	BindAddr       string   `json:"bindAddr"`
	AllowedHosts   []string `json:"allowedHosts"`
	AllowedOrigins []string `json:"allowedOrigins"`
}

func ReadEditableSettings() (SettingsSnapshot, error) {
	hostname, _ := os.Hostname()
	bindAddr, allowedHosts, allowedOrigins := readPanelAccessSettings()
	return SettingsSnapshot{
		Hostname:          hostname,
		Timezone:          readTimezone(),
		Nameservers:       readNameservers(),
		DNSMode:           detectDNSMode(),
		ManagedConfigPath: managedResolvedConfigPath,
		OSName:            readOSName(),
		Kernel:            readKernel(),
		BindAddr:          bindAddr,
		AllowedHosts:      allowedHosts,
		AllowedOrigins:    allowedOrigins,
	}, nil
}

func UpdateEditableSettings(input SettingsUpdate) (SettingsSnapshot, error) {
	nextHostname := strings.TrimSpace(input.Hostname)
	if nextHostname != "" {
		if err := exec.Command("hostnamectl", "set-hostname", nextHostname).Run(); err != nil {
			return SettingsSnapshot{}, fmt.Errorf("gagal memperbarui hostname")
		}
	}

	nextTimezone := strings.TrimSpace(input.Timezone)
	if nextTimezone != "" {
		if err := exec.Command("timedatectl", "set-timezone", nextTimezone).Run(); err != nil {
			return SettingsSnapshot{}, fmt.Errorf("gagal memperbarui timezone")
		}
	}

	sanitizedNameservers := sanitizeNameservers(input.Nameservers)
	if len(sanitizedNameservers) > 0 {
		if err := writeManagedNameservers(sanitizedNameservers); err != nil {
			return SettingsSnapshot{}, err
		}
	}

	if err := updatePanelAccessSettings(input.BindAddr, input.AllowedHosts, input.AllowedOrigins, false); err != nil {
		return SettingsSnapshot{}, err
	}

	return ReadEditableSettings()
}

func UpdatePanelPort(port int) (SettingsSnapshot, error) {
	if port < 1 || port > 65535 {
		return SettingsSnapshot{}, fmt.Errorf("port harus di antara 1 dan 65535")
	}

	envPath := panelEnvPath()
	entries, err := readEnvMap(envPath)
	if err != nil {
		return SettingsSnapshot{}, fmt.Errorf("gagal membaca env runtime panel")
	}

	currentBindAddr := firstNonEmpty(entries["PANEL_BIND_ADDR"], "0.0.0.0:8787")
	host, _, err := net.SplitHostPort(currentBindAddr)
	if err != nil || host == "" {
		host = "0.0.0.0"
	}
	updatedBindAddr := net.JoinHostPort(host, strconv.Itoa(port))

	currentOrigins := parseCSV(entries["PANEL_ALLOWED_ORIGINS"])
	updatedOrigins := replaceOriginPorts(currentOrigins, strconv.Itoa(port))
	if len(updatedOrigins) == 0 {
		updatedOrigins = deriveDefaultAllowedOrigins(updatedBindAddr)
	}

	if err := updatePanelAccessSettings(updatedBindAddr, parseCSV(entries["PANEL_ALLOWED_HOSTS"]), updatedOrigins, false); err != nil {
		return SettingsSnapshot{}, err
	}
	return ReadEditableSettings()
}

func UpdatePanelOrigins(origins []string) (SettingsSnapshot, error) {
	envPath := panelEnvPath()
	entries, err := readEnvMap(envPath)
	if err != nil {
		return SettingsSnapshot{}, fmt.Errorf("gagal membaca env runtime panel")
	}

	if err := updatePanelAccessSettings(entries["PANEL_BIND_ADDR"], parseCSV(entries["PANEL_ALLOWED_HOSTS"]), origins, true); err != nil {
		return SettingsSnapshot{}, err
	}
	return ReadEditableSettings()
}

func readTimezone() string {
	if out, err := exec.Command("timedatectl", "show", "--property=Timezone", "--value").Output(); err == nil {
		if value := strings.TrimSpace(string(out)); value != "" {
			return value
		}
	}
	if data, err := os.ReadFile("/etc/timezone"); err == nil {
		if value := strings.TrimSpace(string(data)); value != "" {
			return value
		}
	}
	return "UTC"
}

func readNameservers() []string {
	if managed := readManagedNameservers(); len(managed) > 0 {
		return managed
	}
	data, err := os.ReadFile("/etc/resolv.conf")
	if err != nil {
		return []string{}
	}
	result := make([]string, 0, 2)
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) >= 2 && fields[0] == "nameserver" {
			result = append(result, fields[1])
		}
	}
	return sanitizeNameservers(result)
}

func readManagedNameservers() []string {
	data, err := os.ReadFile(managedResolvedConfigPath)
	if err != nil {
		return []string{}
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "DNS=") {
			continue
		}
		value := strings.TrimSpace(strings.TrimPrefix(line, "DNS="))
		if value == "" {
			return []string{}
		}
		return sanitizeNameservers(strings.Fields(value))
	}
	return []string{}
}

func detectDNSMode() string {
	if _, err := os.Stat("/run/systemd/resolve"); err == nil {
		return "systemd-resolved"
	}
	return "resolv.conf"
}

func sanitizeNameservers(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		current := strings.TrimSpace(value)
		if current == "" {
			continue
		}
		ip := net.ParseIP(current)
		if ip == nil {
			continue
		}
		// Skip loopback
		if ip.IsLoopback() {
			continue
		}
		// Skip link-local (fe80::/10 for IPv6, 169.254.x.x for IPv4)
		if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			continue
		}
		// Skip multicast
		if ip.IsMulticast() {
			continue
		}
		// Skip unspecified (0.0.0.0 / ::)
		if ip.IsUnspecified() {
			continue
		}
		if _, ok := seen[current]; ok {
			continue
		}
		seen[current] = struct{}{}
		result = append(result, current)
	}
	return result
}

func writeManagedNameservers(nameservers []string) error {
	if len(nameservers) == 0 {
		return fmt.Errorf("minimal satu nameserver valid diperlukan")
	}
	if err := os.MkdirAll(filepath.Dir(managedResolvedConfigPath), 0o755); err != nil {
		return fmt.Errorf("gagal menyiapkan direktori konfigurasi dns")
	}
	content := fmt.Sprintf("[Resolve]\nDNS=%s\n", strings.Join(nameservers, " "))
	if err := os.WriteFile(managedResolvedConfigPath, []byte(content), 0o644); err != nil {
		return fmt.Errorf("gagal menulis konfigurasi dns terkelola")
	}
	if err := exec.Command("systemctl", "restart", "systemd-resolved").Run(); err != nil {
		return fmt.Errorf("gagal me-restart systemd-resolved")
	}
	return nil
}

func readPanelAccessSettings() (string, []string, []string) {
	envPath := panelEnvPath()
	entries, err := readEnvMap(envPath)
	if err != nil {
		return "0.0.0.0:8787", []string{}, []string{}
	}

	bindAddr := firstNonEmpty(entries["PANEL_BIND_ADDR"], "0.0.0.0:8787")
	allowedHosts := parseCSV(entries["PANEL_ALLOWED_HOSTS"])
	allowedOrigins := parseCSV(entries["PANEL_ALLOWED_ORIGINS"])
	return bindAddr, allowedHosts, allowedOrigins
}

func updatePanelAccessSettings(bindAddr string, allowedHosts, allowedOrigins []string, allowEmptyOrigins bool) error {
	envPath := panelEnvPath()
	entries, err := readEnvMap(envPath)
	if err != nil {
		return fmt.Errorf("gagal membaca env runtime panel")
	}

	currentBindAddr := firstNonEmpty(strings.TrimSpace(bindAddr), entries["PANEL_BIND_ADDR"], "0.0.0.0:8787")
	if !isValidBindAddr(currentBindAddr) {
		return fmt.Errorf("bind address harus dalam format host:port yang valid")
	}

	sanitizedHosts := sanitizeCSVValues(allowedHosts)
	if len(sanitizedHosts) == 0 {
		sanitizedHosts = parseCSV(entries["PANEL_ALLOWED_HOSTS"])
	}
	if len(sanitizedHosts) == 0 {
		sanitizedHosts = deriveDefaultAllowedHosts(currentBindAddr)
	}

	sanitizedOrigins := sanitizeOrigins(allowedOrigins)
	if !allowEmptyOrigins {
		if len(sanitizedOrigins) == 0 {
			sanitizedOrigins = parseCSV(entries["PANEL_ALLOWED_ORIGINS"])
		}
		if len(sanitizedOrigins) == 0 {
			sanitizedOrigins = deriveDefaultAllowedOrigins(currentBindAddr)
		}
	}

	sanitizedHosts = sanitizeCSVValues(append(sanitizedHosts, deriveHostsFromOrigins(sanitizedOrigins)...))

	entries["PANEL_BIND_ADDR"] = currentBindAddr
	entries["PANEL_ALLOWED_HOSTS"] = strings.Join(sanitizedHosts, ",")
	entries["PANEL_ALLOWED_ORIGINS"] = strings.Join(sanitizedOrigins, ",")
	if err := writeEnvMap(envPath, entries); err != nil {
		return err
	}
	if err := exec.Command("systemctl", "restart", "ui-panel.service").Run(); err != nil {
		return fmt.Errorf("gagal me-restart ui-panel service")
	}
	return nil
}

func panelEnvPath() string {
	return firstNonEmpty(os.Getenv("PANEL_ENV_FILE"), filepath.Join("/etc", "ui-panel", "agent.env"))
}

func readEnvMap(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	result := map[string]string{}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		result[strings.TrimSpace(key)] = strings.TrimSpace(value)
	}
	return result, nil
}

func writeEnvMap(path string, entries map[string]string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("gagal membaca env runtime panel")
	}
	lines := strings.Split(string(data), "\n")
	for key, value := range entries {
		prefix := key + "="
		replaced := false
		for i, line := range lines {
			if strings.HasPrefix(line, prefix) {
				lines[i] = prefix + value
				replaced = true
				break
			}
		}
		if !replaced {
			lines = append(lines, prefix+value)
		}
	}
	payload := strings.Join(lines, "\n")
	if !strings.HasSuffix(payload, "\n") {
		payload += "\n"
	}
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		return fmt.Errorf("gagal menulis env runtime panel")
	}
	return nil
}

func parseCSV(value string) []string {
	parts := strings.Split(value, ",")
	return sanitizeCSVValues(parts)
}

func sanitizeCSVValues(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func sanitizeOrigins(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if !strings.Contains(trimmed, "://") {
			trimmed = "http://" + trimmed
		}
		if _, _, err := net.SplitHostPort(strings.TrimPrefix(strings.TrimPrefix(trimmed, "http://"), "https://")); err != nil {
			parsedHost := strings.TrimPrefix(strings.TrimPrefix(trimmed, "http://"), "https://")
			if !strings.Contains(parsedHost, ":") {
				continue
			}
		}
		trimmed = strings.TrimRight(trimmed, "/")
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func isValidBindAddr(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	host, port, err := net.SplitHostPort(value)
	if err != nil {
		return false
	}
	if host == "" {
		return false
	}
	if _, err := fmt.Sscanf(port, "%d", new(int)); err != nil {
		return false
	}
	return true
}

func deriveDefaultAllowedHosts(bindAddr string) []string {
	result := []string{"localhost", "127.0.0.1"}
	host, _, err := net.SplitHostPort(bindAddr)
	if err == nil && host != "" && host != "0.0.0.0" && host != "localhost" && host != "127.0.0.1" {
		result = append(result, host)
	}
	if hostname, err := os.Hostname(); err == nil {
		result = append(result, hostname)
	}
	return sanitizeCSVValues(result)
}

func deriveDefaultAllowedOrigins(bindAddr string) []string {
	_, port, err := net.SplitHostPort(bindAddr)
	if err != nil {
		port = "8787"
	}
	origins := []string{
		"http://127.0.0.1:" + port,
		"http://localhost:" + port,
	}
	for _, host := range deriveDefaultAllowedHosts(bindAddr) {
		if host == "localhost" || host == "127.0.0.1" {
			continue
		}
		origins = append(origins, "http://"+host+":"+port)
	}
	return sanitizeOrigins(origins)
}

func replaceOriginPorts(origins []string, port string) []string {
	result := make([]string, 0, len(origins))
	for _, origin := range sanitizeOrigins(origins) {
		parsed, err := neturl.Parse(origin)
		if err != nil || parsed.Host == "" {
			continue
		}
		host := parsed.Hostname()
		if host == "" {
			continue
		}
		parsed.Host = net.JoinHostPort(host, port)
		result = append(result, strings.TrimRight(parsed.String(), "/"))
	}
	return sanitizeOrigins(result)
}

func deriveHostsFromOrigins(origins []string) []string {
	result := make([]string, 0, len(origins))
	for _, origin := range sanitizeOrigins(origins) {
		parsed, err := neturl.Parse(origin)
		if err != nil || parsed.Host == "" {
			continue
		}
		host := strings.TrimSpace(parsed.Hostname())
		if host == "" {
			continue
		}
		result = append(result, host)
	}
	return sanitizeCSVValues(result)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
