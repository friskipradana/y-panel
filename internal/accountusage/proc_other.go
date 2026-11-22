//go:build !linux

package accountusage

import (
	"os"
)

func platformReadUID(_ int, _ os.FileInfo) (uint32, bool) {
	return 0, false
}

func platformLookupUID(_ string) (uint32, bool) {
	return 0, false
}
