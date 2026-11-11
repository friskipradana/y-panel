//go:build linux

package accountusage

import (
	"os"
	osuser "os/user"
	"strconv"
	"strings"
	"syscall"
)

func platformReadUID(_ int, info os.FileInfo) (uint32, bool) {
	if info == nil {
		return 0, false
	}
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, false
	}
	return st.Uid, true
}

func platformLookupUID(osUsername string) (uint32, bool) {
	if strings.TrimSpace(osUsername) == "" {
		return 0, false
	}
	account, err := osuser.Lookup(osUsername)
	if err != nil {
		return 0, false
	}
	uid64, err := strconv.ParseUint(account.Uid, 10, 32)
	if err != nil {
		return 0, false
	}
	return uint32(uid64), true
}
