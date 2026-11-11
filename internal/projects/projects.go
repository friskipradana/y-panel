// Package projects manages project lifecycle — port allocation, start/stop, and
// deploy pipeline for all supported project types.
package projects

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/osuser"
	"github.com/friskipradana/panel-desktop-ui/internal/performance"
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

// entry is one supervised process: the one that runs now, and what is needed to run it again. A project of one process has one
// entry, a project of several has one for each process.
type entry struct {
	user    *database.User
	project database.Project
	// key names the entry in the manager: the project id, and for a process of a project of several, its name after a slash
	key string
	// service is the name of the process of a project of several; empty for a project of one
	service string
	// build makes the command that runs it; the folder it runs in is dir
	build     func() (*exec.Cmd, error)
	dir       string
	cmd       *exec.Cmd
	done      chan struct{} // closed when the current process has ended
	startedAt time.Time
	restarts  int
	stopping  atomic.Bool
	stopCh    chan struct{}
}

func (e *entry) alive() bool {
	if e.done == nil {
		return false
	}
	select {
	case <-e.done:
		return false
	default:
		return true
	}
}

// stack is a project made of several processes: the gateway on its port, and the keys of the entries that run its processes
type stack struct {
	gateway *gateway
	gwPort  int
	keys    []string
	// ports are the ports of the processes behind the gateway
	ports []int
}

// Manager tracks running project processes in memory and keeps them running.
type Manager struct {
	mu       sync.RWMutex
	procs    map[string]*entry // key = project ID, or project ID/process for a project of several
	stacks   map[int64]*stack
	states   map[int64]ProcessStatus
	opMu     sync.Mutex
	opLocks  map[int64]*sync.Mutex
	startSem chan struct{}
	prober   *portProber
	stateDir string
	// envKey opens the variables a project keeps encrypted
	envKey string
}

func procKey(projectID int64) string { return strconv.FormatInt(projectID, 10) }

// tag is what a line of the log says about which process it is of, for a project of several
func (e *entry) tag() string {
	if e.service == "" {
		return ""
	}
	return "[" + e.service + "] "
}

// NewManager creates a project process Manager.
func NewManager(stateDir string) *Manager {
	return &Manager{
		procs:    make(map[string]*entry),
		stacks:   make(map[int64]*stack),
		states:   make(map[int64]ProcessStatus),
		opLocks:  make(map[int64]*sync.Mutex),
		startSem: make(chan struct{}, 8),
		prober:   newPortProber(defaultProbeWorkers, defaultProbeTTL, defaultProbeTimeout),
		stateDir: stateDir,
	}
}

func (m *Manager) projectOpLock(projectID int64) *sync.Mutex {
	m.opMu.Lock()
	defer m.opMu.Unlock()
	if m.opLocks == nil {
		m.opLocks = make(map[int64]*sync.Mutex)
	}
	lk, ok := m.opLocks[projectID]
	if !ok {
		lk = &sync.Mutex{}
		m.opLocks[projectID] = lk
	}
	return lk
}

func (m *Manager) setState(projectID int64, status ProcessStatus) {
	m.mu.Lock()
	if m.states == nil {
		m.states = make(map[int64]ProcessStatus)
	}
	m.states[projectID] = status
	m.mu.Unlock()
}

// SetEnvKey gives the manager the key that opens the variables of projects
func (m *Manager) SetEnvKey(hexKey string) { m.envKey = hexKey }

// projectEnv are the variables a project runs with, opened from what is stored encrypted
func (m *Manager) projectEnv(p *database.Project) ([]string, error) {
	if p.Run.EnvEnc == "" {
		return EnvPairs(p.Run.Env), nil
	}
	if m.envKey == "" {
		return nil, errors.New("the variables of the project cannot be opened: no encryption key")
	}
	plain, err := crypto.Decrypt(m.envKey, p.Run.EnvEnc)
	if err != nil {
		return nil, fmt.Errorf("the variables of the project cannot be opened: %w", err)
	}
	var env map[string]string
	if err := json.Unmarshal([]byte(plain), &env); err != nil {
		return nil, fmt.Errorf("the variables of the project cannot be read: %w", err)
	}
	return EnvPairs(env), nil
}

// Start launches a project process based on its type and working directory, and keeps it
// running: a project that dies on its own is started again. It returns once the process
// has been created; StartAndWait also waits for the project to accept connections.
func (m *Manager) Start(user *database.User, project *database.Project) (err error) {
	started := time.Now()
	defer func() {
		performance.DefaultRegistry.RecordProjectStart(time.Since(started), err)
	}()

	opMu := m.projectOpLock(project.ID)
	opMu.Lock()
	defer opMu.Unlock()

	m.mu.Lock()
	if _, ok := m.procs[procKey(project.ID)]; ok {
		m.mu.Unlock()
		return nil // already running, or waiting to be started again
	}
	if _, ok := m.stacks[project.ID]; ok {
		m.mu.Unlock()
		return nil
	}
	if m.states == nil {
		m.states = make(map[int64]ProcessStatus)
	}
	m.states[project.ID] = ProcessStarting
	m.mu.Unlock()

	setFailed := func() {
		m.setState(project.ID, ProcessFailed)
	}

	// a project the agent did not start itself (it outlived an agent restart) keeps its port
	if m.prober != nil && m.prober.ProbeFresh(project.AssignedPort) {
		m.setState(project.ID, ProcessRunning)
		return nil
	}

	// rows created before directory checks existed may still point outside the owner's home
	if user != nil {
		if _, _, dirErr := ResolveWorkingDir(project.WorkingDir, osuser.ResolveHomeDir(user.Username), user.Role == "superadmin"); dirErr != nil {
			setFailed()
			return fmt.Errorf("project %d: %w", project.ID, dirErr)
		}
	}

	if m.startSem != nil {
		m.startSem <- struct{}{}
		defer func() { <-m.startSem }()
	}

	if project.ProjectType == "stack" {
		if stackErr := m.startStack(user, project); stackErr != nil {
			setFailed()
			return stackErr
		}
		return nil
	}

	e := &entry{project: *project, key: procKey(project.ID), dir: project.WorkingDir, stopCh: make(chan struct{})}
	e.build = func() (*exec.Cmd, error) { return buildCommand(e.user, &e.project) }
	if user != nil {
		owner := *user
		e.user = &owner
	}
	if launchErr := m.launchEntry(e); launchErr != nil {
		setFailed()
		return launchErr
	}

	m.mu.Lock()
	m.procs[e.key] = e
	m.states[project.ID] = ProcessRunning
	m.mu.Unlock()

	if m.prober != nil && project.AssignedPort > 0 {
		m.prober.Invalidate(project.AssignedPort)
	}
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
		if m.ready(project) {
			if m.prober != nil && project.AssignedPort > 0 {
				m.prober.Mark(project.AssignedPort, true)
			}
			return true, nil
		}
		m.mu.RLock()
		e, ok := m.procs[procKey(project.ID)]
		exited := ok && !e.alive()
		_, isStack := m.stacks[project.ID]
		m.mu.RUnlock()
		if isStack {
			ok, exited = true, false
		}
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

var errEntryStopping = errors.New("project stopping during launch")

// launchEntry prepares, starts, and supervises one process without holding m.mu across I/O or fork.
func (m *Manager) launchEntry(e *entry) error {
	cmd, err := e.build()
	if err != nil {
		return err
	}
	cmd.Dir = e.dir
	// never hand the agent's own environment (secrets, DSN, keys) to user code
	cmd.Env = RuntimeEnv(e.project.AssignedPort)
	// the variables of the project, then the one the panel gives a static process
	env, err := m.projectEnv(&e.project)
	if err != nil {
		return err
	}
	cmd.Env = append(cmd.Env, env...)
	if e.service != "" && e.project.ProjectType == "static-service" {
		cmd.Env = append(cmd.Env, "RENEO_STATIC_SERVER="+staticSPAServerScript())
	}
	setProcessGroup(cmd)

	logFile := m.openLog(e.project.ID)
	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
		fmt.Fprintf(logFile, "[reneo] %s start %s%s on port %d\n", time.Now().Format("2006-01-02 15:04:05"), e.tag(), e.project.ProjectType, e.project.AssignedPort)
	}
	if err := cmd.Start(); err != nil {
		if logFile != nil {
			logFile.Close()
		}
		return fmt.Errorf("start project %d: %w", e.project.ID, err)
	}

	done := make(chan struct{})
	go func() {
		waitErr := cmd.Wait()
		if logFile != nil {
			// how it ended, so a process that dies at once does not leave a log with nothing in it
			fmt.Fprintf(logFile, "[reneo] %s%s\n", e.tag(), exitNote(waitErr))
			logFile.Close()
		}
		close(done)
	}()

	m.mu.Lock()
	if e.stopping.Load() {
		m.mu.Unlock()
		terminateGroup(cmd, true)
		<-done
		return errEntryStopping
	}
	e.cmd, e.done, e.startedAt = cmd, done, time.Now()
	m.mu.Unlock()
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
		if e.stopping.Load() {
			m.mu.Unlock()
			return
		}
		if time.Since(e.startedAt) > stableAfter {
			e.restarts = 0
		}
		e.restarts++
		attempt := e.restarts
		if attempt > maxRestarts {
			if m.procs[e.key] == e {
				delete(m.procs, e.key)
			}
			m.states[id] = ProcessFailed
			m.mu.Unlock()
			m.logLine(id, "%sstopped after %d failed attempts to keep it running", e.tag(), maxRestarts)
			return
		}
		m.states[id] = ProcessStarting
		m.mu.Unlock()

		delay := time.Duration(1<<attempt) * time.Second
		m.logLine(id, "%sthe process ended on its own; starting it again in %s (attempt %d of %d)", e.tag(), delay, attempt, maxRestarts)
		select {
		case <-e.stopCh:
			return
		case <-time.After(delay):
		}

		if e.stopping.Load() {
			return
		}
		if err := m.launchEntry(e); err != nil {
			if errors.Is(err, errEntryStopping) {
				return
			}
			// counts as one more failed run
			ended := make(chan struct{})
			close(ended)
			m.mu.Lock()
			e.done, e.startedAt = ended, time.Now()
			m.states[id] = ProcessFailed
			m.mu.Unlock()
			m.logLine(id, "%scould not start: %v", e.tag(), err)
			continue
		}
		m.setState(id, ProcessRunning)
	}
}

// Stop ends a project and everything it started: its process, or the gateway and the processes of a project of several.
func (m *Manager) Stop(projectID int64) error {
	started := time.Now()
	opMu := m.projectOpLock(projectID)
	opMu.Lock()
	defer opMu.Unlock()

	m.mu.Lock()
	if m.states == nil {
		m.states = make(map[int64]ProcessStatus)
	}
	m.states[projectID] = ProcessStopping
	st, isStack := m.stacks[projectID]
	if isStack {
		delete(m.stacks, projectID)
	}
	var assignedPort int
	if single, ok := m.procs[procKey(projectID)]; ok {
		assignedPort = single.project.AssignedPort
	}
	m.mu.Unlock()

	if isStack {
		assignedPort = st.gwPort
		if st.gateway != nil {
			st.gateway.Close()
		}
		for _, key := range st.keys {
			_ = m.stopKey(key)
		}
		if m.prober != nil {
			m.prober.Invalidate(assignedPort)
			for _, p := range st.ports {
				m.prober.Invalidate(p)
			}
		}
		m.setState(projectID, ProcessStopped)
		performance.DefaultRegistry.RecordProjectStop(time.Since(started), nil)
		return nil
	}

	err := m.stopKey(procKey(projectID))
	if m.prober != nil && assignedPort > 0 {
		m.prober.Invalidate(assignedPort)
	}
	m.setState(projectID, ProcessStopped)
	performance.DefaultRegistry.RecordProjectStop(time.Since(started), err)
	return err
}

// stopKey ends one supervised process and the children it started.
func (m *Manager) stopKey(key string) error {
	m.mu.Lock()
	e, ok := m.procs[key]
	if ok {
		delete(m.procs, key)
		if !e.stopping.Swap(true) {
			close(e.stopCh)
		}
	}
	var cmd *exec.Cmd
	var done chan struct{}
	if ok {
		cmd, done = e.cmd, e.done
	}
	m.mu.Unlock()

	return stopProcess(cmd, done)
}

func stopProcess(cmd *exec.Cmd, done chan struct{}) error {
	if cmd == nil || done == nil {
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
	err := terminateLocalPort(project.AssignedPort)
	if m.prober != nil && project.AssignedPort > 0 {
		m.prober.Invalidate(project.AssignedPort)
	}
	return err
}

// IsRunning reports if a project is currently running.
func (m *Manager) IsRunning(projectID int64) bool {
	snapshot := m.Snapshot(projectID, "")
	return snapshot.Running
}

func (m *Manager) Snapshot(projectID int64, desiredStatus string) RuntimeSnapshot {
	return m.snapshot(projectID, desiredStatus, 0, true)
}

func (m *Manager) SnapshotProject(project database.Project) RuntimeSnapshot {
	return m.snapshot(project.ID, project.Status, project.AssignedPort, true)
}

func (m *Manager) snapshot(projectID int64, desiredStatus string, assignedPort int, allowSyncProbe bool) RuntimeSnapshot {
	m.mu.RLock()
	e, single := m.procs[procKey(projectID)]
	processRunning := single && e.alive()
	st, isStack := m.stacks[projectID]
	if isStack {
		for _, key := range st.keys {
			if child, found := m.procs[key]; found && child.alive() {
				processRunning = true
			}
		}
	}
	state := m.states[projectID]
	ok := single || isStack
	port := assignedPort
	if port <= 0 && single {
		port = e.project.AssignedPort
	}
	m.mu.RUnlock()

	if state == "" {
		if processRunning {
			state = ProcessRunning
		} else {
			state = ProcessStopped
		}
	}

	portStatus := PortClosed
	portRunning := false
	var lastProbeAt time.Time
	if port > 0 && m.prober != nil {
		var needsRefresh bool
		portStatus, portRunning, lastProbeAt, needsRefresh = m.prober.LookupCached(port)
		if needsRefresh {
			if allowSyncProbe && portStatus == PortUnknown {
				portRunning = m.prober.ProbeFresh(port)
				portStatus = boolToPortStatus(portRunning)
				lastProbeAt = time.Now()
			} else {
				m.prober.ScheduleBatch([]int{port})
			}
		}
	} else if port > 0 {
		portRunning = isLocalPortOpen(port)
		portStatus = boolToPortStatus(portRunning)
	}

	return buildRuntimeSnapshot(ok, processRunning, portRunning, state, portStatus, lastProbeAt, desiredStatus)
}

func buildRuntimeSnapshot(known, processRunning, portRunning bool, state ProcessStatus, portStatus PortStatus, lastProbeAt time.Time, desiredStatus string) RuntimeSnapshot {
	running := processRunning || portRunning
	snapshot := RuntimeSnapshot{
		Known:         known || portRunning,
		Running:       running,
		Listening:     portRunning,
		Status:        "stopped",
		ProcessStatus: state,
		PortStatus:    portStatus,
	}
	if !lastProbeAt.IsZero() {
		snapshot.LastProbeAt = lastProbeAt.Unix()
	}
	if running {
		snapshot.Status = "active"
	}

	desired := strings.TrimSpace(strings.ToLower(desiredStatus))
	switch desired {
	case "active":
		if !running {
			snapshot.Drift = true
			if known {
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

	switch {
	case state == ProcessStarting || state == ProcessStopping:
		snapshot.HealthStatus = HealthTransitioning
	case snapshot.Drift:
		snapshot.HealthStatus = HealthDrift
	case state == ProcessFailed || desired == "error" || desired == "degraded":
		snapshot.HealthStatus = HealthDegraded
	case running:
		snapshot.HealthStatus = HealthHealthy
	default:
		snapshot.HealthStatus = HealthStopped
	}
	return snapshot
}

// SnapshotAll returns runtime snapshots for all projects, probing any uncached ports concurrently
// via the bounded worker pool and asynchronously refreshing stale entries.
func (m *Manager) SnapshotAll(projects []database.Project) map[int64]RuntimeSnapshot {
	return m.snapshotBatch(projects, true)
}

// SnapshotAllCached returns runtime snapshots purely from memory + cached port probe results,
// scheduling background refresh for stale/unknown ports without blocking on TCP dials.
func (m *Manager) SnapshotAllCached(projects []database.Project) map[int64]RuntimeSnapshot {
	return m.snapshotBatch(projects, false)
}

// WarmPorts schedules asynchronous background probing for the provided project ports.
func (m *Manager) WarmPorts(projects []database.Project) {
	if m.prober == nil || len(projects) == 0 {
		return
	}
	ports := make([]int, 0, len(projects))
	for _, p := range projects {
		if p.AssignedPort > 0 {
			ports = append(ports, p.AssignedPort)
		}
	}
	m.prober.ScheduleBatch(ports)
}

func (m *Manager) snapshotBatch(projects []database.Project, probeColdSync bool) map[int64]RuntimeSnapshot {
	type probeMeta struct {
		known          bool
		processRunning bool
		state          ProcessStatus
		port           int
	}
	metas := make([]probeMeta, len(projects))
	var coldPorts []int
	var stalePorts []int

	m.mu.RLock()
	for i, project := range projects {
		e, single := m.procs[procKey(project.ID)]
		processRunning := single && e.alive()
		st, isStack := m.stacks[project.ID]
		if isStack {
			for _, key := range st.keys {
				if child, found := m.procs[key]; found && child.alive() {
					processRunning = true
				}
			}
		}
		state := m.states[project.ID]
		port := project.AssignedPort
		if port <= 0 && single {
			port = e.project.AssignedPort
		}
		if state == "" {
			if processRunning {
				state = ProcessRunning
			} else {
				state = ProcessStopped
			}
		}
		metas[i] = probeMeta{
			known:          single || isStack,
			processRunning: processRunning,
			state:          state,
			port:           port,
		}
	}
	m.mu.RUnlock()

	if m.prober != nil {
		for i := range metas {
			port := metas[i].port
			if port <= 0 {
				continue
			}
			portStatus, _, _, needsRefresh := m.prober.LookupCached(port)
			if needsRefresh {
				if probeColdSync && portStatus == PortUnknown {
					coldPorts = append(coldPorts, port)
				} else {
					stalePorts = append(stalePorts, port)
				}
			}
		}
		if len(coldPorts) > 0 {
			m.prober.ProbeBatch(coldPorts)
		}
		if len(stalePorts) > 0 {
			m.prober.ScheduleBatch(stalePorts)
		}
	}

	result := make(map[int64]RuntimeSnapshot, len(projects))
	for i, project := range projects {
		meta := metas[i]
		portStatus := PortClosed
		portRunning := false
		var lastProbeAt time.Time
		if meta.port > 0 && m.prober != nil {
			portStatus, portRunning, lastProbeAt, _ = m.prober.LookupCached(meta.port)
		}
		result[project.ID] = buildRuntimeSnapshot(meta.known, meta.processRunning, portRunning, meta.state, portStatus, lastProbeAt, project.Status)
	}
	return result
}

// StopAll terminates all running projects concurrently.
func (m *Manager) StopAll() {
	m.mu.Lock()
	seen := map[int64]bool{}
	for _, e := range m.procs {
		seen[e.project.ID] = true
	}
	for id := range m.stacks {
		seen[id] = true
	}
	m.mu.Unlock()

	var wg sync.WaitGroup
	for id := range seen {
		id := id
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = m.Stop(id)
		}()
	}
	wg.Wait()
}

// Build Commands

// Runnable says whether a project type runs as a process of its own (docker and proxy do not)
func Runnable(projectType string) bool {
	switch projectType {
	case "nodejs", "python", "php", "static", "custom", "stack":
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
	// told how to run (a start command, and maybe an install and a build step), the project runs that, not what its folder suggests
	if p.Run.Start != "" && p.ProjectType != "static" && p.ProjectType != "stack" {
		cmd = exec.Command("sh", "-c", composeScript(p.Run.Install, p.Run.Build, p.Run.Start))
		return finishCommand(user, cmd)
	}
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
	return finishCommand(user, cmd)
}

// finishCommand puts a command under the limits and the account of the project
func finishCommand(user *database.User, cmd *exec.Cmd) (*exec.Cmd, error) {
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
	return dialLocalPort(port, defaultProbeTimeout)
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

// exitNote says in a line how a process ended
func exitNote(err error) string {
	if err == nil {
		return "the process exited"
	}
	return "the process exited: " + err.Error()
}
