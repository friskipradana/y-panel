// Package projects manages project lifecycle — port allocation, start/stop, and
// deploy pipeline for all supported project types.
package projects

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/osuser"
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
	cmd          *exec.Cmd
	assignedPort int
	stopped      bool
}

// Manager tracks running project processes in memory.
type Manager struct {
	mu       sync.RWMutex
	procs    map[int64]*projectProcess // key = project ID
	stateDir string
}

type RuntimeSnapshot struct {
	Known       bool   `json:"known"`
	Running     bool   `json:"running"`
	Status      string `json:"status"`
	Drift       bool   `json:"drift"`
	DriftReason string `json:"driftReason,omitempty"`
}

// NewManager creates a project process Manager.
func NewManager(stateDir string) *Manager {
	return &Manager{
		procs:    make(map[int64]*projectProcess),
		stateDir: stateDir,
	}
}

// Start launches a project process based on its type and working directory.
func (m *Manager) Start(user *database.User, project *database.Project) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if proc, ok := m.procs[project.ID]; ok {
		if isAlive(proc.cmd) {
			return nil // already running
		}
		delete(m.procs, project.ID)
	}

	cmd, err := buildCommand(user, project)
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

	m.procs[project.ID] = &projectProcess{cmd: cmd, assignedPort: project.AssignedPort}
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
	snapshot := m.Snapshot(projectID, "")
	return snapshot.Running
}

func (m *Manager) Snapshot(projectID int64, desiredStatus string) RuntimeSnapshot {
	return m.snapshot(projectID, desiredStatus, 0)
}

func (m *Manager) SnapshotProject(project database.Project) RuntimeSnapshot {
	return m.snapshot(project.ID, project.Status, project.AssignedPort)
}

func (m *Manager) snapshot(projectID int64, desiredStatus string, assignedPort int) RuntimeSnapshot {
	m.mu.RLock()
	proc, ok := m.procs[projectID]
	m.mu.RUnlock()

	port := assignedPort
	if port <= 0 && ok {
		port = proc.assignedPort
	}
	processRunning := ok && isAlive(proc.cmd)
	portRunning := isLocalPortOpen(port)
	running := processRunning || portRunning
	snapshot := RuntimeSnapshot{
		Known:   ok || portRunning,
		Running: running,
		Status:  "stopped",
	}
	if running {
		snapshot.Status = "active"
	}

	desired := strings.TrimSpace(strings.ToLower(desiredStatus))
	switch desired {
	case "active":
		if !running {
			snapshot.Drift = true
			if ok {
				snapshot.DriftReason = "expected_active_but_not_running"
			} else {
				snapshot.DriftReason = "expected_active_but_runtime_unknown"
			}
		}
	case "stopped":
		if running {
			snapshot.Drift = true
			if portRunning && !processRunning {
				snapshot.DriftReason = "expected_stopped_but_port_accepting"
			} else {
				snapshot.DriftReason = "expected_stopped_but_running"
			}
		}
	}

	return snapshot
}

func (m *Manager) SnapshotAll(projects []database.Project) map[int64]RuntimeSnapshot {
	result := make(map[int64]RuntimeSnapshot, len(projects))
	for _, project := range projects {
		result[project.ID] = m.SnapshotProject(project)
	}
	return result
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
func buildCommand(user *database.User, p *database.Project) (*exec.Cmd, error) {
	if p.WorkingDir == "" {
		return nil, fmt.Errorf("project %d has no working directory", p.ID)
	}

	var cmd *exec.Cmd
	switch p.ProjectType {
	case "nodejs":
		// Prefer npm start, fall back to node index.js
		if fileExists(filepath.Join(p.WorkingDir, "package.json")) {
			cmd = exec.Command("npm", "start")
		} else {
			cmd = exec.Command("node", "index.js")
		}

	case "python":
		// Prefer gunicorn, fall back to python app.py
		if which("gunicorn") {
			cmd = exec.Command("gunicorn", "app:app", "--bind", fmt.Sprintf("0.0.0.0:%d", p.AssignedPort))
		} else {
			cmd = exec.Command("python3", "app.py")
		}

	case "php":
		cmd = exec.Command("php", "-S", fmt.Sprintf("0.0.0.0:%d", p.AssignedPort))

	case "static":
		// Static projects are served with SPA fallback so direct links such as
		// /dashboard/users still resolve to index.html when no file exists.
		if !fileExists(filepath.Join(p.WorkingDir, "index.html")) {
			return nil, fmt.Errorf("static project %d missing index.html in working directory %q", p.ID, p.WorkingDir)
		}
		if which("serve") {
			cmd = exec.Command("serve", "-s", "-l", fmt.Sprintf("%d", p.AssignedPort), ".")
		} else {
			cmd = exec.Command("python3", "-c", staticSPAServerScript(), fmt.Sprintf("%d", p.AssignedPort))
		}

	case "proxy":
		// Parent caller should set up reverse proxy config, not managed here
		return nil, fmt.Errorf("proxy type is managed via tunnel ingress, not a process")

	case "docker":
		return nil, fmt.Errorf("docker type is managed via docker module, not a process")

	case "custom":
		if p.RepoURL != "" && strings.HasSuffix(strings.TrimSpace(p.RepoURL), ".sh") {
			cmd = exec.Command("bash", p.RepoURL)
		} else {
			// Fallback: run ./start.sh if exists
			startSh := filepath.Join(p.WorkingDir, "start.sh")
			if fileExists(startSh) {
				cmd = exec.Command("bash", startSh)
			} else {
				return nil, fmt.Errorf("custom project %d has no runnable entry point (start.sh not found)", p.ID)
			}
		}

	default:
		return nil, fmt.Errorf("unknown project type: %s", p.ProjectType)
	}

	if user == nil {
		return cmd, nil
	}
	osUsername, err := osuser.EnsureUser(user.Username, user.DisplayName)
	if err != nil {
		return nil, err
	}
	return osuser.WrapCommand(cmd, osUsername)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func which(bin string) bool {
	_, err := exec.LookPath(bin)
	return err == nil
}

func staticSPAServerScript() string {
	return `
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class SPAHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.exists(path):
            index_path = os.path.join(os.getcwd(), "index.html")
            if os.path.exists(index_path):
                self.path = "/index.html"
        return super().send_head()

port = int(sys.argv[1])
server = ThreadingHTTPServer(("0.0.0.0", port), SPAHandler)
server.serve_forever()
`
}

func isAlive(cmd *exec.Cmd) bool {
	if cmd == nil || cmd.Process == nil {
		return false
	}
	if cmd.ProcessState != nil {
		return !cmd.ProcessState.Exited()
	}
	return cmd.Process.Signal(os.Signal(nil)) == nil
}

func isLocalPortOpen(port int) bool {
	if port <= 0 {
		return false
	}
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 200*time.Millisecond)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}
