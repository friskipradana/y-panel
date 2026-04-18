package osuser

import (
	"fmt"
	"os/exec"
	osuser "os/user"
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
		comment = "ServerPanel Pro user " + strings.TrimSpace(panelUsername)
	}
	cmd := exec.Command("useradd", "-m", "-s", "/bin/bash", "-c", comment, mapped)
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("create os user %q: %w (%s)", mapped, err, strings.TrimSpace(string(output)))
	}
	return mapped, nil
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
