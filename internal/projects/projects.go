// Package projects manages project lifecycle — port allocation, start/stop, and
// deploy pipeline for all supported project types.
package projects

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// Port range allocation per user: each user gets a contiguous block.
const (
	portBase   = 10000 // starting port for user projects
	portBlock  = 100   // ports per user
	portMaxUID = 900   // supports up to 900 users (portBase + portBlock * portMaxUID = 100000)
)

var slugRe = regexp.MustCompile(`[^a-z0-9-]`)

// Slugify converts a project name to a URL-safe slug.
func Slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = slugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 60 {
		s = s[:60]
	}
	return s
}

// AllocatePort returns a port for a user's project based on userID + project index.
// The port is deterministic given (userID, projectIndex).
func AllocatePort(userID int64, projectIndex int) int {
	// Simple allocation: userID-based base + sequential within user's block
	base := portBase + int((userID-1)%int64(portMaxUID))*portBlock
	return base + (projectIndex % portBlock)
}

// ─── Process Manager ─────────────────────────────────────────────────────────

type projectProcess struct {
	cmd     *exec.Cmd
	stopped bool
}

// Manager tracks running project processes in memory.
type Manager struct {
	mu       sync.RWMutex
	procs    map[int64]*projectProcess // key = project ID
	stateDir string
}

// NewManager creates a project process Manager.
func NewManager(stateDir string) *Manager {
	return &Manager{
		procs:    make(map[int64]*projectProcess),
		stateDir: stateDir,
	}
}

// Start launches a project process based on its type and working directory.
func (m *Manager) Start(project *database.Project) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if proc, ok := m.procs[project.ID]; ok {
		if isAlive(proc.cmd) {
			return nil // already running
		}
		delete(m.procs, project.ID)
	}

	cmd, err := buildCommand(project)
	if err != nil {
		return err
	}

	cmd.Dir = project.WorkingDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", project.AssignedPort))

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start project %d: %w", project.ID, err)
	}

	m.procs[project.ID] = &projectProcess{cmd: cmd}
	return nil
}

// Stop terminates a project process.
func (m *Manager) Stop(projectID int64) error {
	m.mu.Lock()
	proc, ok := m.procs[projectID]
	if ok {
		delete(m.procs, projectID)
	}
	m.mu.Unlock()

	if !ok || proc.cmd == nil || proc.cmd.Process == nil {
		return nil
	}
	proc.stopped = true
	return proc.cmd.Process.Kill()
}

// IsRunning reports if a project is currently running.
func (m *Manager) IsRunning(projectID int64) bool {
	m.mu.RLock()
	proc, ok := m.procs[projectID]
	m.mu.RUnlock()
	return ok && isAlive(proc.cmd)
}

// StopAll terminates all running projects.
func (m *Manager) StopAll() {
	m.mu.Lock()
	ids := make([]int64, 0, len(m.procs))
	for id := range m.procs {
		ids = append(ids, id)
	}
	m.mu.Unlock()
	for _, id := range ids {
		_ = m.Stop(id)
	}
}

// ─── Build Commands ──────────────────────────────────────────────────────────

// buildCommand returns the exec.Cmd that should run for a given project type.
func buildCommand(p *database.Project) (*exec.Cmd, error) {
	if p.WorkingDir == "" {
		return nil, fmt.Errorf("project %d has no working directory", p.ID)
	}

	switch p.ProjectType {
	case "nodejs":
		// Prefer npm start, fall back to node index.js
		if fileExists(filepath.Join(p.WorkingDir, "package.json")) {
			return exec.Command("npm", "start"), nil
		}
		return exec.Command("node", "index.js"), nil

	case "python":
		// Prefer gunicorn, fall back to python app.py
		if which("gunicorn") {
			return exec.Command("gunicorn", "app:app", "--bind", fmt.Sprintf("0.0.0.0:%d", p.AssignedPort)), nil
		}
		return exec.Command("python3", "app.py"), nil

	case "php":
		return exec.Command("php", "-S", fmt.Sprintf("0.0.0.0:%d", p.AssignedPort)), nil

	case "static":
		// Serve with npx serve or python http.server
		if which("serve") {
			return exec.Command("serve", "-l", fmt.Sprintf("%d", p.AssignedPort), "."), nil
		}
		return exec.Command("python3", "-m", "http.server", fmt.Sprintf("%d", p.AssignedPort)), nil

	case "proxy":
		// Parent caller should set up reverse proxy config, not managed here
		return nil, fmt.Errorf("proxy type is managed via tunnel ingress, not a process")

	case "docker":
		return nil, fmt.Errorf("docker type is managed via docker module, not a process")

	case "custom":
		if p.RepoURL != "" && strings.HasSuffix(strings.TrimSpace(p.RepoURL), ".sh") {
			return exec.Command("bash", p.RepoURL), nil
		}
		// Fallback: run ./start.sh if exists
		startSh := filepath.Join(p.WorkingDir, "start.sh")
		if fileExists(startSh) {
			return exec.Command("bash", startSh), nil
		}
		return nil, fmt.Errorf("custom project %d has no runnable entry point (start.sh not found)", p.ID)

	default:
		return nil, fmt.Errorf("unknown project type: %s", p.ProjectType)
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func which(bin string) bool {
	_, err := exec.LookPath(bin)
	return err == nil
}

func isAlive(cmd *exec.Cmd) bool {
	if cmd == nil || cmd.Process == nil {
		return false
	}
	return cmd.Process.Signal(os.Signal(nil)) == nil
}
