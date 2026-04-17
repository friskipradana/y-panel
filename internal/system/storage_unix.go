//go:build !windows

package system

import (
	"strings"
	"syscall"
)

func readStorageUsagePlatform(target string) UsageStat {
	if strings.TrimSpace(target) == "" {
		target = "/"
	}

	var stat syscall.Statfs_t
	if err := syscall.Statfs(target, &stat); err != nil {
		if target != "/" {
			return readStorageUsagePlatform("/")
		}
		return UsageStat{}
	}

	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bavail * uint64(stat.Bsize)
	used := uint64(0)
	if total > free {
		used = total - free
	}

	return UsageStat{Total: total, Used: used}
}
