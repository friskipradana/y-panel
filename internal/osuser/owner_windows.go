//go:build windows

package osuser

import "os"

func ownerOf(os.FileInfo) (uid, gid int, ok bool) { return 0, 0, false }
