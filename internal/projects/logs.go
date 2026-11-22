package projects

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	maxLogBytes  = 5 << 20
	tailReadSize = 256 << 10
)

func (m *Manager) logDir() string {
	base := m.stateDir
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "project-logs")
}

// LogPath is where the output of a project is kept.
func (m *Manager) LogPath(projectID int64) string {
	return filepath.Join(m.logDir(), fmt.Sprintf("%d.log", projectID))
}

// openLog opens the project's log for appending; a log past the size limit is moved aside first.
func (m *Manager) openLog(projectID int64) *os.File {
	if err := os.MkdirAll(m.logDir(), 0o750); err != nil {
		return nil
	}
	path := m.LogPath(projectID)
	if info, err := os.Stat(path); err == nil && info.Size() > maxLogBytes {
		_ = os.Rename(path, path+".1")
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o640)
	if err != nil {
		return nil
	}
	return f
}

// logLine records something the manager did (a start, a crash, a restart) in the project's own log.
func (m *Manager) logLine(projectID int64, format string, args ...any) {
	f := m.openLog(projectID)
	if f == nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "[reneo] %s %s\n", time.Now().Format("2006-01-02 15:04:05"), fmt.Sprintf(format, args...))
}

// ReadLog returns the last lines of the project's log.
func (m *Manager) ReadLog(projectID int64, lines int) ([]string, error) {
	if lines <= 0 {
		lines = 200
	}
	f, err := os.Open(m.LogPath(projectID))
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	offset := info.Size() - tailReadSize
	if offset < 0 {
		offset = 0
	}
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return nil, err
	}
	data, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}
	text := strings.TrimRight(string(data), "\r\n")
	if text == "" {
		return []string{}, nil
	}
	all := strings.Split(text, "\n")
	// a read that began mid-file starts with a cut line
	if offset > 0 && len(all) > 1 {
		all = all[1:]
	}
	if len(all) > lines {
		all = all[len(all)-lines:]
	}
	return all, nil
}

// RemoveLog deletes the project's logs along with the project.
func (m *Manager) RemoveLog(projectID int64) {
	path := m.LogPath(projectID)
	_ = os.Remove(path)
	_ = os.Remove(path + ".1")
}
