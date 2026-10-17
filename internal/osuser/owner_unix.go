//go:build !windows

package osuser

import (
	"os"
	"syscall"
)

// ownerOf reports the uid and gid that own a file
func ownerOf(info os.FileInfo) (uid, gid int, ok bool) {
	stat, isStat := info.Sys().(*syscall.Stat_t)
	if !isStat {
		return 0, 0, false
	}
	return int(stat.Uid), int(stat.Gid), true
}
