package system

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
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
}

type SettingsUpdate struct {
	Hostname    string   `json:"hostname"`
	Timezone    string   `json:"timezone"`
	Nameservers []string `json:"nameservers"`
}

func ReadEditableSettings() (SettingsSnapshot, error) {
	hostname, _ := os.Hostname()
	return SettingsSnapshot{
		Hostname:          hostname,
		Timezone:          readTimezone(),
		Nameservers:       readNameservers(),
		DNSMode:           detectDNSMode(),
		ManagedConfigPath: managedResolvedConfigPath,
		OSName:            readOSName(),
		Kernel:            readKernel(),
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
