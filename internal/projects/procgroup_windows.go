//go:build windows

package projects

import "os/exec"

func setProcessGroup(*exec.Cmd) {}

func terminateGroup(cmd *exec.Cmd, _ bool) {
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
