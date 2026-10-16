//go:build linux

package accountusage

import (
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const clockTicks = 100 // USER_HZ on every Linux the panel supports

// cpuTicks returns utime+stime and resident pages of every process owned by uid.
func scan(uid uint32) (ticks uint64, rssPages uint64) {
	entries, err := filepath.Glob("/proc/[0-9]*")
	if err != nil {
		return 0, 0
	}
	for _, dir := range entries {
		info, err := os.Stat(dir)
		if err != nil {
			continue
		}
		st, ok := info.Sys().(*syscall.Stat_t)
		if !ok || st.Uid != uid {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, "stat"))
		if err != nil {
			continue
		}
		// the command name can contain spaces: fields after the closing parenthesis
		text := string(raw)
		end := strings.LastIndexByte(text, ')')
		if end < 0 {
			continue
		}
		fields := strings.Fields(text[end+1:])
		// state is fields[0]; utime and stime are the 14th and 15th fields overall
		if len(fields) < 22 {
			continue
		}
		utime, _ := strconv.ParseUint(fields[11], 10, 64)
		stime, _ := strconv.ParseUint(fields[12], 10, 64)
		rss, _ := strconv.ParseInt(fields[21], 10, 64)
		ticks += utime + stime
		if rss > 0 {
			rssPages += uint64(rss)
		}
	}
	return ticks, rssPages
}

func processUsage(osUsername string) Usage {
	if strings.TrimSpace(osUsername) == "" {
		return Usage{}
	}
	account, err := user.Lookup(osUsername)
	if err != nil {
		return Usage{}
	}
	uid64, err := strconv.ParseUint(account.Uid, 10, 32)
	if err != nil {
		return Usage{}
	}
	uid := uint32(uid64)
	t1, _ := scan(uid)
	started := time.Now()
	time.Sleep(200 * time.Millisecond)
	t2, pages := scan(uid)
	elapsed := time.Since(started).Seconds()
	var cores float64
	if elapsed > 0 && t2 >= t1 {
		cores = float64(t2-t1) / clockTicks / elapsed
	}
	return Usage{CPUCores: cores, MemBytes: pages * uint64(os.Getpagesize())}
}
