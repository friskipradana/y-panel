package hostops

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

var (
	validUnitRe    = regexp.MustCompile(`^[a-zA-Z0-9@_.:-]{1,128}\.service$`)
	allowedActions = map[string]bool{
		"start":   true,
		"stop":    true,
		"restart": true,
		"reload":  true,
		"enable":  true,
		"disable": true,
	}
)

// SystemdService represents one systemd service unit on a Linux host.
type SystemdService struct {
	Unit        string `json:"unit"`
	LoadState   string `json:"loadState"`
	ActiveState string `json:"activeState"`
	SubState    string `json:"subState"`
	Description string `json:"description"`
	Enabled     string `json:"enabled,omitempty"`
}

func ValidUnitName(unit string) bool {
	return validUnitRe.MatchString(strings.TrimSpace(unit))
}

func ValidServiceAction(action string) bool {
	return allowedActions[strings.ToLower(strings.TrimSpace(action))]
}

func SystemdAvailable() bool {
	if runtime.GOOS != "linux" {
		return false
	}
	_, err := exec.LookPath("systemctl")
	return err == nil
}

// ListSystemdServices inspects installed systemd service units on Linux hosts.
func ListSystemdServices(ctx context.Context) ([]SystemdService, bool, error) {
	if !SystemdAvailable() {
		return []SystemdService{}, false, nil
	}
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(c, "systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend", "--plain").Output()
	if err != nil {
		return nil, true, fmt.Errorf("gagal membaca daftar layanan systemd: %w", err)
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	items := make([]SystemdService, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		desc := ""
		if len(fields) > 4 {
			desc = strings.Join(fields[4:], " ")
		}
		items = append(items, SystemdService{
			Unit:        fields[0],
			LoadState:   fields[1],
			ActiveState: fields[2],
			SubState:    fields[3],
			Description: desc,
		})
	}
	return items, true, nil
}

// ControlSystemdService executes an allowlisted systemctl action on a validated unit.
func ControlSystemdService(ctx context.Context, unit, action string) error {
	if !SystemdAvailable() {
		return errors.New("systemd hanya tersedia di host Linux")
	}
	unit = strings.TrimSpace(unit)
	action = strings.ToLower(strings.TrimSpace(action))
	if !ValidUnitName(unit) {
		return errors.New("nama unit systemd tidak valid (harus berakhiran .service)")
	}
	if !ValidServiceAction(action) {
		return errors.New("aksi systemd tidak diizinkan")
	}
	c, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	out, err := exec.CommandContext(c, "systemctl", action, unit).CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("systemctl %s %s gagal: %s", action, unit, msg)
	}
	return nil
}

// SystemdServiceLogs fetches trailing journalctl entries for one systemd unit.
func SystemdServiceLogs(ctx context.Context, unit string, lines int) (string, error) {
	if !SystemdAvailable() {
		return "", errors.New("journalctl hanya tersedia di host Linux")
	}
	unit = strings.TrimSpace(unit)
	if !ValidUnitName(unit) {
		return "", errors.New("nama unit systemd tidak valid")
	}
	if lines <= 0 {
		lines = 150
	}
	if lines > 1000 {
		lines = 1000
	}
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(c, "journalctl", "-u", unit, "-n", strconv.Itoa(lines), "--no-pager").CombinedOutput()
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("gagal membaca journalctl: %w", err)
	}
	return string(out), nil
}
