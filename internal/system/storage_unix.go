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

	// the way df counts it: what is used, against what is used plus what an ordinary program may still take;
	// the blocks the filesystem keeps back for root are in neither
	bsize := uint64(stat.Bsize)
	used := uint64(0)
	if stat.Blocks > stat.Bfree {
		used = (stat.Blocks - stat.Bfree) * bsize
	}
	total := used + stat.Bavail*bsize

	return UsageStat{Total: total, Used: used}
}
