package projects

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// deniedRoots are system locations a project may never use as its working
// directory, whoever asks. The panel runs as root and chowns the directory it
// is given, so a user-chosen path like /etc would hand that directory over.
var deniedRoots = []string{
	"/", "/etc", "/root", "/boot", "/proc", "/sys", "/dev", "/run", "/usr", "/bin", "/sbin",
	"/lib", "/lib32", "/lib64", "/var/lib", "/var/run", "/opt/reneo", "/home",
}

// realPath resolves symlinks for the deepest part of the path that exists, so a
// symlink inside a home directory cannot point a project outside of it.
func realPath(p string) (string, error) {
	p = filepath.Clean(p)
	rest := ""
	for {
		resolved, err := filepath.EvalSymlinks(p)
		if err == nil {
			if rest == "" {
				return resolved, nil
			}
			return filepath.Join(resolved, rest), nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(p)
		if parent == p {
			return "", fmt.Errorf("no existing parent for %q", p)
		}
		rest = filepath.Join(filepath.Base(p), rest)
		p = parent
	}
}

// within reports whether path is base itself or inside it.
func within(path, base string) bool {
	path, base = filepath.Clean(path), filepath.Clean(base)
	if path == base {
		return true
	}
	return strings.HasPrefix(path, strings.TrimRight(base, string(filepath.Separator))+string(filepath.Separator))
}

// ResolveWorkingDir validates a project working directory and returns its real
// path and whether it sits inside the owner's home directory. Everyone is
// confined to their home; the superadmin may use other locations except the
// system roots above (and never gets those chowned).
func ResolveWorkingDir(dir, home string, allowOutsideHome bool) (string, bool, error) {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return "", false, errors.New("working directory is required")
	}
	if !filepath.IsAbs(dir) {
		return "", false, errors.New("working directory must be an absolute path")
	}
	if strings.ContainsRune(dir, 0) {
		return "", false, errors.New("working directory contains an invalid character")
	}
	resolved, err := realPath(dir)
	if err != nil {
		return "", false, fmt.Errorf("working directory: %w", err)
	}

	if home != "" {
		if realHome, homeErr := realPath(home); homeErr == nil && within(resolved, realHome) {
			return resolved, true, nil
		}
	}
	if !allowOutsideHome {
		return "", false, errors.New("working directory must be inside your home directory")
	}
	for _, root := range deniedRoots {
		if root == "/" {
			if resolved == "/" {
				return "", false, errors.New("working directory is a protected system location")
			}
			continue
		}
		if within(resolved, root) {
			return "", false, errors.New("working directory is a protected system location")
		}
	}
	return resolved, false, nil
}

// RuntimeEnv is the environment a project process gets. The agent's own
// environment holds the session secret, database DSN and encryption key, so it
// must never be inherited by code that users deploy.
func RuntimeEnv(port int) []string {
	env := []string{
		"PATH=" + safePath(),
		"LANG=C.UTF-8",
		fmt.Sprintf("PORT=%d", port),
	}
	for _, key := range []string{"TZ", "LC_ALL", "TMPDIR"} {
		if value := os.Getenv(key); value != "" {
			env = append(env, key+"="+value)
		}
	}
	return env
}

func safePath() string {
	if value := os.Getenv("PATH"); value != "" {
		return value
	}
	return "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
}

// RealPath resolves the symlinks of the deepest part of a path that exists, whether or not the rest does.
func RealPath(p string) (string, error) { return realPath(p) }
