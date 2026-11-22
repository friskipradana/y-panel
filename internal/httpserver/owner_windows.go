//go:build windows

package httpserver

import "os"

func chownLikeParent(string) {}

func mkdirAllOwned(path string, perm os.FileMode) error { return os.MkdirAll(path, perm) }
