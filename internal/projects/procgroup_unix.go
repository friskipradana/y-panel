//go:build !windows

package projects

import (
	"os/exec"
	"syscall"
)

// setProcessGroup puts the project in a group of its own, so that stopping it reaches the
// children it spawns (npm start runs node as a child).
func setProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// terminateGroup asks the whole group to end, or forces it to when force is set.
func terminateGroup(cmd *exec.Cmd, force bool) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	sig := syscall.SIGTERM
	if force {
		sig = syscall.SIGKILL
	}
	if err := syscall.Kill(-cmd.Process.Pid, sig); err != nil {
		_ = cmd.Process.Signal(sig)
	}
}
