//go:build !linux

package osuser

import "os/exec"

// Limits are the resources an account's shell may use (enforced on Linux with systemd only).
type Limits struct {
	CPUPercent int
	MemoryMB   int
}

func SliceFor(string, Limits) string { return "" }

func InSlice(cmd *exec.Cmd, _ string) *exec.Cmd { return cmd }
