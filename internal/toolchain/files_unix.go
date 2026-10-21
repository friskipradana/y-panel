//go:build !windows

package toolchain

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// readFileInHome reads a file of the account for the agent, which runs as root: a link planted by the account in its own home
// (to a file of root) is not followed, and only a regular, small file is read.
func readFileInHome(home, rel string) ([]byte, error) {
	realHome, err := filepath.EvalSymlinks(home)
	if err != nil {
		return nil, err
	}
	full, err := filepath.EvalSymlinks(filepath.Join(home, filepath.FromSlash(rel)))
	if err != nil {
		return nil, err
	}
	if full != realHome && !strings.HasPrefix(full, realHome+string(os.PathSeparator)) {
		return nil, errors.New("the file is outside the home")
	}
	f, err := os.OpenFile(full, os.O_RDONLY|syscall.O_NONBLOCK|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 64<<10 {
		return nil, errors.New("not a plain small file")
	}
	return io.ReadAll(io.LimitReader(f, 64<<10))
}
