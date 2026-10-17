//go:build !windows

package httpserver

import (
	"os"
	"path/filepath"
	"syscall"
)

// ownerOf is who owns a path
func ownerOf(path string) (uid, gid int, ok bool) {
	info, err := os.Lstat(path)
	if err != nil {
		return 0, 0, false
	}
	stat, isStat := info.Sys().(*syscall.Stat_t)
	if !isStat {
		return 0, 0, false
	}
	return int(stat.Uid), int(stat.Gid), true
}

// chownLikeParent gives a new file or folder to whoever owns the folder it is in. The agent runs as
// root, so without this everything made in the File Manager would belong to root and its owner
// could neither change it nor, worse, trust what root has put in their folder.
func chownLikeParent(path string) {
	if os.Geteuid() != 0 {
		return
	}
	uid, gid, ok := ownerOf(filepath.Dir(path))
	if !ok {
		return
	}
	_ = os.Lchown(path, uid, gid)
}

// mkdirAllOwned is MkdirAll whose new folders all belong to the owner of the folder they were made in
func mkdirAllOwned(path string, perm os.FileMode) error {
	var created []string
	for p := filepath.Clean(path); ; p = filepath.Dir(p) {
		if _, err := os.Lstat(p); err == nil {
			break
		}
		created = append(created, p)
		if filepath.Dir(p) == p {
			break
		}
	}
	if err := os.MkdirAll(path, perm); err != nil {
		return err
	}
	for i := len(created) - 1; i >= 0; i-- {
		chownLikeParent(created[i])
	}
	return nil
}
