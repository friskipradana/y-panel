//go:build !windows

package terminal

import (
	"os/exec"
	"syscall"
)

// killTree ends the shell and everything it started: the pty makes the shell a session
// leader, so its pid is the id of the process group that holds its children.
func killTree(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err != nil {
		_ = cmd.Process.Kill()
	}
}
