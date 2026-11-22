//go:build linux

package terminal

import (
	"fmt"
	"os"
	"os/exec"
	osuser "os/user"
	"path/filepath"
	"strconv"
	"syscall"

	"github.com/creack/pty"
	"github.com/friskipradana/panel-desktop-ui/internal/toolchain"
)

func applyLinuxPTYAttrs(cmd *exec.Cmd, pts *os.File) {
	cmd.Stdin = pts
	cmd.Stdout = pts
	cmd.Stderr = pts

	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setsid = true
	cmd.SysProcAttr.Setctty = true
	// Child FD 0 receives pts via cmd.Stdin; using parent pts.Fd() triggers "Ctty not valid in child".
	cmd.SysProcAttr.Ctty = 0
}

func injectSystemdRunIdentity(args []string, uid, gid string) []string {
	for i, arg := range args {
		if arg == "--" {
			out := make([]string, 0, len(args)+2)
			out = append(out, args[:i]...)
			out = append(out, "--uid="+uid, "--gid="+gid)
			out = append(out, args[i:]...)
			return out
		}
	}
	return args
}

func startPTY(cmd *exec.Cmd, osUsername string, cols, rows int) (*os.File, error) {
	ptmx, pts, err := pty.Open()
	if err != nil {
		return nil, fmt.Errorf("open pty: %w", err)
	}
	defer func() {
		if pts != nil {
			_ = pts.Close()
		}
	}()

	_ = pty.Setsize(ptmx, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	applyLinuxPTYAttrs(cmd, pts)

	// When agent runs as root, assign slave device ownership to the user
	// and execute the shell with that user's UID, GID, and supplementary groups.
	if os.Geteuid() == 0 && osUsername != "" {
		if account, err := osuser.Lookup(osUsername); err == nil {
			uid64, err1 := strconv.ParseUint(account.Uid, 10, 32)
			gid64, err2 := strconv.ParseUint(account.Gid, 10, 32)
			if err1 == nil && err2 == nil {
				uid := uint32(uid64)
				gid := uint32(gid64)

				// Chown slave PTY to the target user so sudo/su/bash have legitimate tty ownership.
				_ = os.Chown(pts.Name(), int(uid), int(gid))
				_ = os.Chmod(pts.Name(), 0620)

				var groupIDs []uint32
				if gids, err := account.GroupIds(); err == nil {
					for _, g := range gids {
						if gidVal, err := strconv.ParseUint(g, 10, 32); err == nil {
							groupIDs = append(groupIDs, uint32(gidVal))
						}
					}
				}
				if len(groupIDs) == 0 {
					groupIDs = []uint32{gid}
				}

				if filepath.Base(cmd.Path) == "systemd-run" {
					// systemd-run needs root to create transient scopes and drops privileges for the inner command.
					cmd.Args = injectSystemdRunIdentity(cmd.Args, account.Uid, account.Gid)
				} else {
					cmd.SysProcAttr.Credential = &syscall.Credential{
						Uid:    uid,
						Gid:    gid,
						Groups: groupIDs,
					}
				}

				if account.HomeDir != "" {
					cmd.Env = append(cmd.Env,
						"HOME="+account.HomeDir,
						"USER="+osUsername,
						"LOGNAME="+osUsername,
					)
					cmd.Env = toolchain.EnvFor(cmd.Env, account.HomeDir)
				}
			}
		}
	}

	if err := cmd.Start(); err != nil {
		_ = ptmx.Close()
		return nil, fmt.Errorf("start pty process: %w", err)
	}

	return ptmx, nil
}

