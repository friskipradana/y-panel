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

const (
	managedResolvedConfigPath       = "/etc/systemd/resolved.conf.d/ypanel.conf"
	legacyManagedResolvedConfigPath = "/etc/systemd/resolved.conf.d/ui-panel.conf"
)

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
	OriginsRaw        string   `json:"originsRaw"`
}

type SettingsUpdate struct {
	Hostname       string   `json:"hostname"`
	Timezone       string   `json:"timezone"`
	Nameservers    []string `json:"nameservers"`
	BindAddr       string   `json:"bindAddr"`
	AllowedHosts   []string `json:"allowedHosts"`
	AllowedOrigins []string `json:"allowedOrigins"`
	OriginsRaw     string   `json:"originsRaw"`
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
		OriginsRaw:        readOriginsEditorRaw(),
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

	rawOrigins := readOriginsEditorRaw()
	updatedRawOrigins := rewriteOriginsRawPort(rawOrigins, strconv.Itoa(port))
	if strings.TrimSpace(updatedRawOrigins) == "" {
		currentOrigins := parseCSV(entries["PANEL_ALLOWED_ORIGINS"])
		updatedOrigins := replaceOriginPorts(currentOrigins, strconv.Itoa(port))
		if len(updatedOrigins) == 0 {
			updatedOrigins = deriveDefaultAllowedOrigins(updatedBindAddr)
		}
		updatedRawOrigins = strings.Join(updatedOrigins, "\n")
	}

	if err := updatePanelAccessSettingsRaw(updatedBindAddr, parseCSV(entries["PANEL_ALLOWED_HOSTS"]), updatedRawOrigins, false); err != nil {
		return SettingsSnapshot{}, err
	}
	return ReadEditableSettings()
}

func UpdatePanelOrigins(originsRaw string) (SettingsSnapshot, error) {
	envPath := panelEnvPath()
	entries, err := readEnvMap(envPath)
	if err != nil {
		return SettingsSnapshot{}, fmt.Errorf("gagal membaca env runtime panel")
	}

	if err := updatePanelAccessSettingsRaw(entries["PANEL_BIND_ADDR"], parseCSV(entries["PANEL_ALLOWED_HOSTS"]), originsRaw, true); err != nil {
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
	data, err := os.ReadFile(managedResolvedPath())
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
	_ = os.Remove(legacyManagedResolvedConfigPath)
	if err := exec.Command("systemctl", "restart", "systemd-resolved").Run(); err != nil {
		return fmt.Errorf("gagal me-restart systemd-resolved")
	}
	return nil
}

func managedResolvedPath() string {
	if _, err := os.Stat(managedResolvedConfigPath); err == nil {
		return managedResolvedConfigPath
	}
	if _, err := os.Stat(legacyManagedResolvedConfigPath); err == nil {
		return legacyManagedResolvedConfigPath
	}
	return managedResolvedConfigPath
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
	originsRaw := readOriginsEditorRaw()
	if strings.TrimSpace(originsRaw) == "" {
		originsRaw = strings.Join(allowedOrigins, "\n")
	}
	return updatePanelAccessSettingsRaw(bindAddr, allowedHosts, originsRaw, allowEmptyOrigins)
}

func updatePanelAccessSettingsRaw(bindAddr string, allowedHosts []string, originsRaw string, allowEmptyOrigins bool) error {
	envPath := panelEnvPath()
	entries, err := readEnvMap(envPath)
	if err != nil {
		return fmt.Errorf("gagal membaca env runtime panel")
	}

	currentBindAddr := firstNonEmpty(strings.TrimSpace(bindAddr), entries["PANEL_BIND_ADDR"], "0.0.0.0:8787")
	if !isValidBindAddr(currentBindAddr) {
		return fmt.Errorf("bind address harus dalam format host:port yang valid")
	}

	previousOrigins := parseCSV(entries["PANEL_ALLOWED_ORIGINS"])
	previousDerivedHosts := deriveHostsFromOrigins(previousOrigins)

	sanitizedHosts := sanitizeCSVValues(allowedHosts)
	if len(sanitizedHosts) == 0 {
		sanitizedHosts = parseCSV(entries["PANEL_ALLOWED_HOSTS"])
	}
	if len(sanitizedHosts) == 0 {
		sanitizedHosts = deriveDefaultAllowedHosts(currentBindAddr)
	}

	sanitizedOrigins := parseOriginsRaw(originsRaw)
	if !allowEmptyOrigins {
		if len(sanitizedOrigins) == 0 {
			sanitizedOrigins = previousOrigins
		}
		if len(sanitizedOrigins) == 0 {
			sanitizedOrigins = deriveDefaultAllowedOrigins(currentBindAddr)
		}
		if strings.TrimSpace(originsRaw) == "" {
			originsRaw = strings.Join(sanitizedOrigins, "\n")
		}
	}

	sanitizedHosts = removeCSVValues(sanitizedHosts, previousDerivedHosts)
	sanitizedHosts = sanitizeCSVValues(append(sanitizedHosts, deriveHostsFromOrigins(sanitizedOrigins)...))

	entries["PANEL_BIND_ADDR"] = currentBindAddr
	entries["PANEL_ALLOWED_HOSTS"] = strings.Join(sanitizedHosts, ",")
	entries["PANEL_ALLOWED_ORIGINS"] = strings.Join(sanitizedOrigins, ",")
	if err := writeEnvMap(envPath, entries); err != nil {
		return err
	}
	if err := writeOriginsEditorRaw(originsRaw); err != nil {
		return err
	}
	if err := writeEnvRawValue(envPath, "PANEL_ALLOWED_ORIGINS", originsRaw); err != nil {
		return err
	}
	return nil
}

const (
	managedOriginsBlockBegin = "# UI_PANEL_ALLOWED_ORIGINS_BEGIN"
	managedOriginsBlockEnd   = "# UI_PANEL_ALLOWED_ORIGINS_END"
	managedOriginsLinePrefix = "#|"
)

func panelEnvPath() string {
	if envPath := strings.TrimSpace(os.Getenv("PANEL_ENV_FILE")); envPath != "" {
		return envPath
	}
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

func panelOriginsRawPath() string {
	envPath := panelEnvPath()
	return filepath.Join(filepath.Dir(envPath), "allowed-origins.raw")
}

type envLine struct {
	Raw       string
	Key       string
	Value     string
	IsKV      bool
	Commented bool
}

func parseEnvLines(data string) []envLine {
	lines := strings.Split(data, "\n")
	result := make([]envLine, 0, len(lines))
	for _, raw := range lines {
		entry := envLine{Raw: raw}
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			result = append(result, entry)
			continue
		}

		commented := false
		candidate := raw
		if strings.HasPrefix(strings.TrimLeft(raw, " \t"), "#") {
			commented = true
			withoutHash := strings.TrimLeft(raw, " \t")
			withoutHash = strings.TrimPrefix(withoutHash, "#")
			candidate = withoutHash
		}

		key, value, ok := strings.Cut(strings.TrimSpace(candidate), "=")
		if ok {
			entry.Key = strings.TrimSpace(key)
			entry.Value = strings.TrimSpace(value)
			entry.IsKV = entry.Key != ""
			entry.Commented = commented
		}
		result = append(result, entry)
	}
	return result
}

func readEnvMap(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	result := map[string]string{}
	for _, line := range parseEnvLines(string(data)) {
		if !line.IsKV || line.Commented {
			continue
		}
		result[line.Key] = line.Value
	}
	return result, nil
}

func writeEnvMap(path string, entries map[string]string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("gagal membaca env runtime panel")
	}
	lines := parseEnvLines(string(data))
	for key, value := range entries {
		updated := false
		for i := range lines {
			if !lines[i].IsKV || lines[i].Commented || lines[i].Key != key {
				continue
			}
			lines[i].Raw = key + "=" + value
			lines[i].Value = value
			updated = true
			break
		}
		if !updated {
			lines = append(lines, envLine{Raw: key + "=" + value, Key: key, Value: value, IsKV: true})
		}
	}

	rawLines := make([]string, 0, len(lines))
	for _, line := range lines {
		rawLines = append(rawLines, line.Raw)
	}
	payload := strings.Join(rawLines, "\n")
	if !strings.HasSuffix(payload, "\n") {
		payload += "\n"
	}
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		return fmt.Errorf("gagal menulis env runtime panel")
	}
	return nil
}

func readOriginsEditorRaw() string {
	if data, err := os.ReadFile(panelOriginsRawPath()); err == nil {
		return strings.TrimRight(string(data), "\n")
	}
	return readEnvRawValue(panelEnvPath(), "PANEL_ALLOWED_ORIGINS")
}

func writeOriginsEditorRaw(rawValue string) error {
	payload := rawValue
	if !strings.HasSuffix(payload, "\n") {
		payload += "\n"
	}
	if err := os.WriteFile(panelOriginsRawPath(), []byte(payload), 0o600); err != nil {
		return fmt.Errorf("gagal menulis raw allowed origins")
	}
	return nil
}

func readEnvRawValue(path, key string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	block := readManagedOriginsBlock(string(data))
	if block != "" {
		return block
	}
	for _, line := range parseEnvLines(string(data)) {
		if line.IsKV && !line.Commented && line.Key == key {
			if key == "PANEL_ALLOWED_ORIGINS" {
				return strings.Join(parseCSV(line.Value), "\n")
			}
			return line.Value
		}
	}
	return ""
}

func writeEnvRawValue(path, key, rawValue string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("gagal membaca env runtime panel")
	}
	payload := string(data)
	if key == "PANEL_ALLOWED_ORIGINS" {
		payload = writeManagedOriginsBlock(payload, rawValue)
	} else {
		return nil
	}
	if !strings.HasSuffix(payload, "\n") {
		payload += "\n"
	}
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		return fmt.Errorf("gagal menulis env runtime panel")
	}
	return nil
}

func readManagedOriginsBlock(data string) string {
	lines := strings.Split(data, "\n")
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
		return ""
	}
	result := make([]string, 0, end-start-1)
	for _, line := range lines[start+1 : end] {
		trimmedLeft := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmedLeft, managedOriginsLinePrefix) {
			result = append(result, strings.TrimPrefix(trimmedLeft, managedOriginsLinePrefix))
			continue
		}

		if strings.HasPrefix(trimmedLeft, "#") {
			trimmedLeft = strings.TrimPrefix(trimmedLeft, "#")
			if strings.HasPrefix(trimmedLeft, " ") {
				trimmedLeft = strings.TrimPrefix(trimmedLeft, " ")
			}
			result = append(result, trimmedLeft)
			continue
		}
		result = append(result, line)
	}
	return strings.TrimRight(strings.Join(result, "\n"), "\n")
}

func writeManagedOriginsBlock(data, rawValue string) string {
	lines := strings.Split(data, "\n")
	start := -1
	end := -1
	insertAt := len(lines)
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
		if insertAt == len(lines) {
			entry := parseEnvLines(line)
			if len(entry) == 1 && entry[0].IsKV && !entry[0].Commented && entry[0].Key == "PANEL_ALLOWED_ORIGINS" {
				insertAt = i
			}
		}
	}

	blockLines := []string{managedOriginsBlockBegin}
	for _, line := range strings.Split(strings.TrimRight(rawValue, "\n"), "\n") {
		blockLines = append(blockLines, managedOriginsLinePrefix+line)
	}
	blockLines = append(blockLines, managedOriginsBlockEnd)

	if start >= 0 && end >= start {
		rebuilt := append([]string{}, lines[:start]...)
		rebuilt = append(rebuilt, blockLines...)
		rebuilt = append(rebuilt, lines[end+1:]...)
		return strings.Join(rebuilt, "\n")
	}

	rebuilt := append([]string{}, lines[:insertAt]...)
	rebuilt = append(rebuilt, blockLines...)
	rebuilt = append(rebuilt, lines[insertAt:]...)
	return strings.Join(rebuilt, "\n")
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

func removeCSVValues(values, toRemove []string) []string {
	if len(values) == 0 {
		return nil
	}
	blocked := map[string]struct{}{}
	for _, value := range sanitizeCSVValues(toRemove) {
		blocked[value] = struct{}{}
	}
	if len(blocked) == 0 {
		return sanitizeCSVValues(values)
	}
	result := make([]string, 0, len(values))
	for _, value := range sanitizeCSVValues(values) {
		if _, exists := blocked[value]; exists {
			continue
		}
		result = append(result, value)
	}
	return result
}

func parseOriginsRaw(raw string) []string {
	entries := make([]string, 0)
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		entries = append(entries, trimmed)
	}
	return sanitizeOrigins(entries)
}

func rewriteOriginsRawPort(raw string, port string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	lines := strings.Split(raw, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		updated := rewriteOriginPort(trimmed, port)
		if updated == "" {
			continue
		}
		prefixLen := len(line) - len(strings.TrimLeft(line, " \t"))
		prefix := ""
		if prefixLen > 0 {
			prefix = line[:prefixLen]
		}
		lines[i] = prefix + updated
	}
	return strings.Join(lines, "\n")
}

func rewriteOriginPort(origin string, port string) string {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return ""
	}
	if !strings.Contains(origin, "://") {
		origin = "http://" + origin
	}
	parsed, err := neturl.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	host := parsed.Hostname()
	if host == "" {
		return ""
	}
	parsed.Host = net.JoinHostPort(host, port)
	parsed.Path = ""
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/")
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
