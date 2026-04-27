package osuser

import (
	"fmt"
	"os"
	"os/exec"
	osuser "os/user"
	"path/filepath"
	"runtime"
	"strings"
)

const usernamePrefix = "panel-"

// MappedUsername converts a panel username to a deterministic OS account name.
func MappedUsername(panelUsername string) string {
	cleaned := strings.ToLower(strings.TrimSpace(panelUsername))
	var b strings.Builder
	for _, r := range cleaned {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_':
			b.WriteRune('-')
		}
	}
	result := strings.Trim(b.String(), "-")
	for strings.Contains(result, "--") {
		result = strings.ReplaceAll(result, "--", "-")
	}
	if result == "" {
		result = "user"
	}
	if len(result) > 24 {
		result = result[:24]
	}
	return usernamePrefix + result
}

// EnsureUser creates the mapped OS account on Linux if it does not already exist.
func EnsureUser(panelUsername, displayName string) (string, error) {
	mapped := MappedUsername(panelUsername)
	if runtime.GOOS != "linux" {
		return mapped, nil
	}
	if _, err := osuser.Lookup(mapped); err == nil {
		return mapped, nil
	}
	comment := strings.TrimSpace(displayName)
	if comment == "" {
		comment = "YPanel user " + strings.TrimSpace(panelUsername)
	}
	cmd := exec.Command("useradd", "-m", "-s", "/bin/bash", "-c", comment, mapped)
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("create os user %q: %w (%s)", mapped, err, strings.TrimSpace(string(output)))
	}
	return mapped, nil
}

// EnsureUserForRole creates/syncs the mapped OS account and applies host sudo policy
// for privileged panel roles. Root escalation still happens inside the shell via sudo.
func EnsureUserForRole(panelUsername, displayName, role string) (string, error) {
	mapped, err := EnsureUser(panelUsername, displayName)
	if err != nil {
		return "", err
	}
	if runtime.GOOS != "linux" {
		return mapped, nil
	}
	if err := syncSudoer(mapped, strings.TrimSpace(role) == "superadmin"); err != nil {
		return "", err
	}
	return mapped, nil
}

func syncSudoer(osUsername string, allowed bool) error {
	if strings.TrimSpace(osUsername) == "" || !strings.HasPrefix(osUsername, usernamePrefix) {
		return nil
	}
	path := filepath.Join("/etc/sudoers.d", osUsername)
	if !allowed {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove sudoers drop-in %q: %w", path, err)
		}
		return nil
	}
	content := fmt.Sprintf("%s ALL=(ALL) NOPASSWD:ALL\n", osUsername)
	if err := os.WriteFile(path, []byte(content), 0440); err != nil {
		return fmt.Errorf("write sudoers drop-in %q: %w", path, err)
	}
	return nil
}

// WrapCommand runs a command under a mapped OS account on Linux.
func WrapCommand(cmd *exec.Cmd, osUsername string) (*exec.Cmd, error) {
	if cmd == nil || runtime.GOOS != "linux" || strings.TrimSpace(osUsername) == "" {
		return cmd, nil
	}
	wrapped := exec.Command("runuser", append([]string{"-u", osUsername, "--", cmd.Path}, cmd.Args[1:]...)...)
	wrapped.Dir = cmd.Dir
	wrapped.Env = append([]string(nil), cmd.Env...)
	wrapped.Stdin = cmd.Stdin
	wrapped.Stdout = cmd.Stdout
	wrapped.Stderr = cmd.Stderr
	if account, err := osuser.Lookup(osUsername); err == nil && account.HomeDir != "" {
		wrapped.Env = append(wrapped.Env,
			"HOME="+account.HomeDir,
			"USER="+osUsername,
			"LOGNAME="+osUsername,
		)
	}
	return wrapped, nil
}

func ResolveHomeDir(panelUsername string) string {
	mapped := MappedUsername(panelUsername)
	if account, err := osuser.Lookup(mapped); err == nil && strings.TrimSpace(account.HomeDir) != "" {
		return account.HomeDir
	}
	return "/home/" + mapped
}
