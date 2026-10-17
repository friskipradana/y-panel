package terminal

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	maxSessionsPerOwner = 8
	maxSessionsTotal    = 64
	maxCols             = 500
	maxRows             = 200
)

var (
	ErrTooManySessions = errors.New("too many terminal sessions open")
	// ErrInvalid marks a request the caller got wrong (bad target or directory), as opposed to a failure to start
	ErrInvalid  = errors.New("invalid terminal request")
	errNotFound = errors.New("terminal session not found")

	// [user@]host: letters, digits, dot, dash, underscore; a leading dash would be read as an ssh option
	sshTargetPattern = regexp.MustCompile(`^([A-Za-z0-9_][A-Za-z0-9._-]{0,63}@)?[A-Za-z0-9][A-Za-z0-9.-]{0,252}$`)
)

type invalidError string

func (e invalidError) Error() string      { return string(e) }
func (invalidError) Is(target error) bool { return target == ErrInvalid }

// validSSHTarget accepts only a plain [user@]host, never options or shell syntax.
func validSSHTarget(target string) bool {
	return sshTargetPattern.MatchString(target)
}

// resolveCwd picks the start directory of a shell. Without a request it is the account's home.
// Everyone but the superadmin stays inside their own home, symlinks resolved, so a link in the
// home cannot lead into another account's files.
func resolveCwd(home, requested string, privileged bool) (string, error) {
	requested = strings.TrimSpace(requested)
	if requested == "" {
		return home, nil
	}
	if strings.ContainsRune(requested, 0) || !filepath.IsAbs(requested) {
		return "", invalidError("terminal directory must be an absolute path")
	}
	resolved, err := filepath.EvalSymlinks(filepath.Clean(requested))
	if err != nil {
		return "", invalidError("terminal directory does not exist")
	}
	if info, err := os.Stat(resolved); err != nil || !info.IsDir() {
		return "", invalidError("terminal directory is not a folder")
	}
	if privileged {
		return resolved, nil
	}
	realHome, err := filepath.EvalSymlinks(filepath.Clean(home))
	if err != nil {
		return "", invalidError("home directory is not available")
	}
	if resolved != realHome && !strings.HasPrefix(resolved, strings.TrimRight(realHome, string(filepath.Separator))+string(filepath.Separator)) {
		return "", invalidError("terminal directory must be inside your home directory")
	}
	return resolved, nil
}

func clampSize(cols, rows int) (int, int) {
	return min(max(cols, 20), maxCols), min(max(rows, 8), maxRows)
}
