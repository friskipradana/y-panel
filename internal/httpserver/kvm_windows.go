//go:build windows

package httpserver

import (
	"os"
	"os/exec"
)

func detachKvmCmd(_ *exec.Cmd) {}

func terminateKvmPID(pid int) {
	if pid <= 0 {
		return
	}
	if proc, err := os.FindProcess(pid); err == nil {
		_ = proc.Kill()
	}
}

