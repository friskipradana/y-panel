//go:build linux

package osuser

import (
	"fmt"
	"os/exec"
	"strings"
)

// Limits are the resources an account's shell may use.
type Limits struct {
	CPUPercent int // 100 = one core, 0 = unlimited
	MemoryMB   int // 0 = unlimited
}

// SliceFor applies the quota to a per-account systemd slice and returns its name. An empty name
// means no limit could be applied (no systemd, or nothing to limit) and the command runs as is.
func SliceFor(osUsername string, l Limits) string {
	osUsername = strings.TrimSpace(osUsername)
	if osUsername == "" || (l.CPUPercent <= 0 && l.MemoryMB <= 0) {
		return ""
	}
	if _, err := exec.LookPath("systemd-run"); err != nil {
		return ""
	}
	slice := "reneo-" + osUsername + ".slice"
	args := []string{"set-property", "--runtime", slice, "TasksMax=1024"}
	if l.CPUPercent > 0 {
		args = append(args, fmt.Sprintf("CPUQuota=%d%%", l.CPUPercent))
	}
	if l.MemoryMB > 0 {
		args = append(args, fmt.Sprintf("MemoryMax=%dM", l.MemoryMB), "MemorySwapMax=0")
	}
	if err := exec.Command("systemctl", args...).Run(); err != nil {
		return ""
	}
	return slice
}

// InSlice runs cmd inside a transient scope of the slice, keeping stdio and environment.
func InSlice(cmd *exec.Cmd, slice string) *exec.Cmd {
	if cmd == nil || slice == "" {
		return cmd
	}
	wrapped := exec.Command("systemd-run", append([]string{"--quiet", "--scope", "--collect", "--slice=" + slice, "--", cmd.Path}, cmd.Args[1:]...)...)
	wrapped.Dir = cmd.Dir
	wrapped.Env = append([]string(nil), cmd.Env...)
	wrapped.Stdin = cmd.Stdin
	wrapped.Stdout = cmd.Stdout
	wrapped.Stderr = cmd.Stderr
	return wrapped
}
