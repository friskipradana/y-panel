// Package projects manages project lifecycle — port allocation, start/stop, and
// deploy pipeline for all supported project types.
package projects

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/osuser"
)

// Port range allocation per user: each user gets a contiguous block.
const (
	PortBase   = 10000 // starting port for user projects
	PortBlock  = 100   // ports per user
	portMaxUID = 555   // blocks that fit below 65535: users past it share blocks, and the free port is looked up
)

const (
	// a project that dies is started again with growing pauses, up to this many times in a row
	maxRestarts = 5
	// a run this long counts as healthy and resets the count
	stableAfter  = 60 * time.Second
	stopGrace    = 5 * time.Second
	readyPoll    = 200 * time.Millisecond
	logTailOnErr = 12
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
	base := PortBase + int((userID-1)%int64(portMaxUID))*PortBlock
	return base + (projectIndex % PortBlock)
}

// Process Manager

// entry is one supervised project: the process that runs now, and what is needed to run it again.
type entry struct {
	user      *database.User
	project   database.Project
	cmd       *exec.Cmd
	done      chan struct{} // closed when the current process has ended
	startedAt time.Time
	restarts  int
	stopping  bool
	stopCh    chan struct{}
}

func (e *entry) alive() bool {
	select {
	case <-e.done:
		return false
	default:
		return true
	}
}

// Manager tracks running project processes in memory and keeps them running.
type Manager struct {
	mu       sync.RWMutex
	procs    map[int64]*entry // key = project ID
	stateDir string
}

type RuntimeSnapshot struct {
	Known       bool   `json:"known"`
	Running     bool   `json:"running"`
	Listening   bool   `json:"listening"`
	Status      string `json:"status"`
	Drift       bool   `json:"drift"`
	DriftReason string `json:"driftReason,omitempty"`
}

// NewManager creates a project process Manager.
func NewManager(stateDir string) *Manager {
	return &Manager{
		procs:    make(map[int64]*entry),
		stateDir: stateDir,
	}
}

// Start launches a project process based on its type and working directory, and keeps it
// running: a project that dies on its own is started again. It returns once the process
// has been created; StartAndWait also waits for the project to accept connections.
func (m *Manager) Start(user *database.User, project *database.Project) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.procs[project.ID]; ok {
		return nil // already running, or waiting to be started again
	}
	// a project the agent did not start itself (it outlived an agent restart) keeps its port
	if isLocalPortOpen(project.AssignedPort) {
		return nil
	}

	// rows created before directory checks existed may still point outside the owner's home
	if user != nil {
		if _, _, err := ResolveWorkingDir(project.WorkingDir, osuser.ResolveHomeDir(user.Username), user.Role == "superadmin"); err != nil {
			return fmt.Errorf("project %d: %w", project.ID, err)
		}
	}

	e := &entry{project: *project, stopCh: make(chan struct{})}
	if user != nil {
		owner := *user
		e.user = &owner
	}
	if err := m.launch(e); err != nil {
		return err
	}
	m.procs[project.ID] = e
	go m.watch(e)
	return nil
}

// StartAndWait starts the project and waits for its port to open. ready is false with a nil
// error when the process is still up after the wait (an install or a build can take long);
// a process that ends before listening is an error carrying the end of its log.
func (m *Manager) StartAndWait(user *database.User, project *database.Project, wait time.Duration) (ready bool, err error) {
	if err := m.Start(user, project); err != nil {
		return false, err
	}
	deadline := time.Now().Add(wait)
	for {
		if isLocalPortOpen(project.AssignedPort) {
			return true, nil
		}
		m.mu.RLock()
		e, ok := m.procs[project.ID]
		exited := ok && !e.alive()
		m.mu.RUnlock()
		if !ok || exited {
			_ = m.Stop(project.ID)
			return false, m.exitError(project.ID)
		}
		if time.Now().After(deadline) {
			return false, nil
		}
		time.Sleep(readyPoll)
	}
}

func (m *Manager) exitError(projectID int64) error {
	lines, _ := m.ReadLog(projectID, logTailOnErr)
	tail := strings.TrimSpace(strings.Join(lines, "\n"))
	if tail == "" {
		return errors.New("the project exited right after it started")
	}
	return fmt.Errorf("the project exited right after it started:\n%s", tail)
}

// launch runs the project once; the caller holds the lock.
func (m *Manager) launch(e *entry) error {
	cmd, err := buildCommand(e.user, &e.project)
	if err != nil {
		return err
	}
	cmd.Dir = e.project.WorkingDir
	// never hand the agent's own environment (secrets, DSN, keys) to user code
	cmd.Env = RuntimeEnv(e.project.AssignedPort)
	setProcessGroup(cmd)

	logFile := m.openLog(e.project.ID)
	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
		fmt.Fprintf(logFile, "[reneo] %s start %s on port %d\n", time.Now().Format("2006-01-02 15:04:05"), e.project.ProjectType, e.project.AssignedPort)
	}
	if err := cmd.Start(); err != nil {
		if logFile != nil {
			logFile.Close()
		}
		return fmt.Errorf("start project %d: %w", e.project.ID, err)
	}

	done := make(chan struct{})
	e.cmd, e.done, e.startedAt = cmd, done, time.Now()
	go func() {
		_ = cmd.Wait()
		if logFile != nil {
			logFile.Close()
		}
		close(done)
	}()
	return nil
}

// watch starts a project again when it dies without being stopped.
func (m *Manager) watch(e *entry) {
	id := e.project.ID
	for {
		m.mu.RLock()
		done := e.done
		m.mu.RUnlock()
		select {
		case <-done:
		case <-e.stopCh:
			return
		}

		m.mu.Lock()
		if e.stopping {
			m.mu.Unlock()
			return
		}
		if time.Since(e.startedAt) > stableAfter {
			e.restarts = 0
		}
		e.restarts++
		attempt := e.restarts
		if attempt > maxRestarts {
			if m.procs[id] == e {
				delete(m.procs, id)
			}
			m.mu.Unlock()
			m.logLine(id, "stopped after %d failed attempts to keep it running", maxRestarts)
			return
		}
		m.mu.Unlock()

		delay := time.Duration(1<<attempt) * time.Second
		m.logLine(id, "the process ended on its own; starting it again in %s (attempt %d of %d)", delay, attempt, maxRestarts)
		select {
		case <-e.stopCh:
			return
		case <-time.After(delay):
		}

		m.mu.Lock()
		if e.stopping {
			m.mu.Unlock()
			return
		}
		if err := m.launch(e); err != nil {
			// counts as one more failed run
			ended := make(chan struct{})
			close(ended)
			e.done, e.startedAt = ended, time.Now()
			m.mu.Unlock()
			m.logLine(id, "could not start: %v", err)
			continue
		}
		m.mu.Unlock()
	}
}

// Stop ends a project process and the children it started.
func (m *Manager) Stop(projectID int64) error {
	m.mu.Lock()
	e, ok := m.procs[projectID]
	if ok {
		delete(m.procs, projectID)
		e.stopping = true
		close(e.stopCh)
	}
	var cmd *exec.Cmd
	var done chan struct{}
	if ok {
		cmd, done = e.cmd, e.done
	}
	m.mu.Unlock()

	if !ok || cmd == nil || done == nil {
		return nil
	}
	select {
	case <-done:
		return nil
	default:
	}
	terminateGroup(cmd, false)
	select {
	case <-done:
		return nil
	case <-time.After(stopGrace):
	}
	terminateGroup(cmd, true)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
	}
	return nil
}

func (m *Manager) StopProject(project database.Project) error {
	if err := m.Stop(project.ID); err != nil {
		return err
	}
	return terminateLocalPort(project.AssignedPort)
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
	e, ok := m.procs[projectID]
	processRunning := ok && e.alive()
	port := assignedPort
	if port <= 0 && ok {
		port = e.project.AssignedPort
	}
	m.mu.RUnlock()

	portRunning := isLocalPortOpen(port)
	running := processRunning || portRunning
	snapshot := RuntimeSnapshot{
		Known:     ok || portRunning,
		Running:   running,
		Listening: portRunning,
		Status:    "stopped",
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

// Build Commands

// Runnable says whether a project type runs as a process of its own (docker and proxy do not)
func Runnable(projectType string) bool {
	switch projectType {
	case "nodejs", "python", "php", "static", "custom":
		return true
	}
	return false
}

// loopback keeps a project reachable only through the panel and its tunnels, never straight from the network
const loopback = "127.0.0.1"

// nodeStartScript says whether package.json has a start script
func nodeStartScript(dir string) bool {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return false
	}
	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if json.Unmarshal(data, &pkg) != nil {
		return false
	}
	return strings.TrimSpace(pkg.Scripts["start"]) != ""
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// buildCommand returns the exec.Cmd that should run for a given project type.
func buildCommand(user *database.User, p *database.Project) (*exec.Cmd, error) {
	if p.WorkingDir == "" {
		return nil, fmt.Errorf("project %d has no working directory", p.ID)
	}
	if !dirExists(p.WorkingDir) {
		return nil, fmt.Errorf("working directory %q does not exist", p.WorkingDir)
	}

	port := p.AssignedPort
	var cmd *exec.Cmd
	switch p.ProjectType {
	case "nodejs":
		hasPackage := fileExists(filepath.Join(p.WorkingDir, "package.json"))
		// npm start runs server.js when package.json names no start script
		switch {
		case hasPackage && (nodeStartScript(p.WorkingDir) || fileExists(filepath.Join(p.WorkingDir, "server.js"))):
			if dirExists(filepath.Join(p.WorkingDir, "node_modules")) {
				cmd = exec.Command("npm", "start")
			} else {
				// the first start installs what the project needs; a failed install leaves nothing half-done behind
				cmd = exec.Command("sh", "-c", "npm install --no-audit --no-fund || { rm -rf node_modules; exit 1; }; exec npm start")
			}
		case fileExists(filepath.Join(p.WorkingDir, "index.js")):
			cmd = exec.Command("node", "index.js")
		default:
			return nil, errors.New("nodejs project needs a start script in package.json or an index.js")
		}

	case "python":
		if !fileExists(filepath.Join(p.WorkingDir, "app.py")) {
			return nil, errors.New("python project needs app.py in its folder")
		}
		bind := fmt.Sprintf("%s:%d", loopback, port)
		switch {
		case fileExists(filepath.Join(p.WorkingDir, "requirements.txt")) || dirExists(filepath.Join(p.WorkingDir, ".venv")):
			// the packages go in a virtualenv of the project, never into the system Python
			script := `if [ ! -d .venv ]; then python3 -m venv .venv && .venv/bin/pip install --no-input -r requirements.txt || { rm -rf .venv; exit 1; }; fi; ` +
				`if [ -x .venv/bin/gunicorn ]; then exec .venv/bin/gunicorn app:app --bind ` + bind + `; else exec .venv/bin/python app.py; fi`
			cmd = exec.Command("sh", "-c", script)
		case which("gunicorn"):
			cmd = exec.Command("gunicorn", "app:app", "--bind", bind)
		default:
			cmd = exec.Command("python3", "app.py")
		}

	case "php":
		serve := fmt.Sprintf("php -S %s:%d", loopback, port)
		// frameworks keep their entry point in public/
		if !fileExists(filepath.Join(p.WorkingDir, "index.php")) && fileExists(filepath.Join(p.WorkingDir, "public", "index.php")) {
			serve += " -t public"
		}
		if fileExists(filepath.Join(p.WorkingDir, "composer.json")) && !dirExists(filepath.Join(p.WorkingDir, "vendor")) && which("composer") {
			serve = "composer install --no-interaction --no-dev --no-progress || { rm -rf vendor; exit 1; }; exec " + serve
		} else {
			serve = "exec " + serve
		}
		if !which("php") {
			return nil, errors.New("php is not installed on this server")
		}
		cmd = exec.Command("sh", "-c", serve)

	case "static":
		if !fileExists(filepath.Join(p.WorkingDir, "index.html")) {
			return nil, fmt.Errorf("static project %d missing index.html in working directory %q", p.ID, p.WorkingDir)
		}
		listen := fmt.Sprintf("tcp://%s:%d", loopback, port)
		if p.SPAFallback && which("serve") {
			cmd = exec.Command("serve", "-s", "-l", listen, ".")
		} else if which("serve") {
			cmd = exec.Command("serve", "-l", listen, ".")
		} else if p.SPAFallback {
			cmd = exec.Command("python3", "-c", staticSPAServerScript(), fmt.Sprintf("%d", port))
		} else {
			cmd = exec.Command("python3", "-m", "http.server", fmt.Sprintf("%d", port), "--bind", loopback)
		}

	case "proxy":
		// Parent caller should set up reverse proxy config, not managed here
		return nil, fmt.Errorf("proxy type is managed via tunnel ingress, not a process")

	case "docker":
		return nil, fmt.Errorf("docker type is managed via docker module, not a process")

	case "custom":
		if p.RepoURL != "" && strings.HasSuffix(strings.TrimSpace(p.RepoURL), ".sh") {
			cmd = exec.Command("bash", strings.TrimSpace(p.RepoURL))
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
	// a program that is not installed says so now, not as a process that ends at once
	if cmd.Err != nil {
		return nil, cmd.Err
	}

	if runtime.GOOS == "linux" {
		cmd = limitProcesses(cmd)
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

// limitProcesses caps how many processes and files the account's projects can hold open,
// so a runaway loop of forks cannot take the host down.
func limitProcesses(cmd *exec.Cmd) *exec.Cmd {
	args := append([]string{"-c", `ulimit -u 2048 2>/dev/null; ulimit -n 16384 2>/dev/null; exec "$0" "$@"`, cmd.Path}, cmd.Args[1:]...)
	return exec.Command("sh", args...)
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
server = ThreadingHTTPServer(("127.0.0.1", port), SPAHandler)
server.serve_forever()
`
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

// PortInUse reports whether something already listens on the local port.
func PortInUse(port int) bool { return isLocalPortOpen(port) }

func terminateLocalPort(port int) error {
	if port <= 0 || !isLocalPortOpen(port) {
		return nil
	}
	if runtime.GOOS != "linux" {
		return fmt.Errorf("port %d masih menerima koneksi setelah stop", port)
	}

	target := fmt.Sprintf("%d/tcp", port)
	if which("fuser") {
		_ = exec.Command("fuser", "-k", "-TERM", target).Run()
		time.Sleep(700 * time.Millisecond)
		if !isLocalPortOpen(port) {
			return nil
		}
		_ = exec.Command("fuser", "-k", "-KILL", target).Run()
		time.Sleep(300 * time.Millisecond)
		if !isLocalPortOpen(port) {
			return nil
		}
	}

	if which("lsof") && which("xargs") {
		portArg := fmt.Sprintf("%d", port)
		_ = exec.Command("sh", "-c", "lsof -tiTCP:"+portArg+" -sTCP:LISTEN | xargs -r kill -TERM").Run()
		time.Sleep(700 * time.Millisecond)
		if !isLocalPortOpen(port) {
			return nil
		}
		_ = exec.Command("sh", "-c", "lsof -tiTCP:"+portArg+" -sTCP:LISTEN | xargs -r kill -KILL").Run()
		time.Sleep(300 * time.Millisecond)
		if !isLocalPortOpen(port) {
			return nil
		}
	}

	return fmt.Errorf("port %d masih menerima koneksi setelah stop", port)
}
