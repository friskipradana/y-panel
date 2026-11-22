//go:build windows

package toolchain

import "errors"

// accounts of the panel are Linux accounts; there is nothing to read on a development machine with Windows
func readFileInHome(home, rel string) ([]byte, error) {
	return nil, errors.New("not supported on windows")
}
