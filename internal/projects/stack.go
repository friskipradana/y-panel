package projects

import (
	"fmt"
	"net"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// A project made of several processes: a frontend and a backend, a site and a worker. Each process is supervised like a project of
// one (started again when it dies, its output in the log of the project with its name in front), and the gateway of the project
// gives them one address.

// freePort asks the system for a port nobody listens on; the process is handed it as PORT
func freePort() (int, error) {
	ln, err := net.Listen("tcp", loopback+":0")
	if err != nil {
		return 0, err
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

// serviceDir is the folder a process runs in: inside the project folder, symlinks resolved, and there
func serviceDir(realWork, rel string) (string, error) {
	clean, err := cleanRelDir("the folder", rel)
	if err != nil {
		return "", err
	}
	dir := realWork
	if clean != "" {
		dir = filepath.Join(realWork, filepath.FromSlash(clean))
	}
	real, err := realPath(dir)
	if err != nil {
		return "", err
	}
	if !within(real, realWork) {
		return "", fmt.Errorf("the folder %q is outside the project folder", rel)
	}
	if !dirExists(real) {
		return "", fmt.Errorf("the folder %q does not exist", rel)
	}
	return real, nil
}

// ServiceDir is the folder of a process of a project of several, checked to be inside the project folder
func ServiceDir(workingDir, rel string) (string, error) {
	realWork, err := realPath(workingDir)
	if err != nil {
		return "", err
	}
	return serviceDir(realWork, rel)
}

// shellQuote makes a word safe for sh
func shellQuote(word string) string {
	return "'" + strings.ReplaceAll(word, "'", `'\''`) + "'"
}

// abortLocked ends a process that was started a moment ago, without waiting; the caller holds the lock
func (m *Manager) abortLocked(key string) {
	e, ok := m.procs[key]
	if !ok {
		return
	}
	delete(m.procs, key)
	e.stopping = true
	close(e.stopCh)
	if e.cmd != nil {
		terminateGroup(e.cmd, true)
	}
}

// startStack starts every process of the project and the gateway in front of them; the caller holds the lock
func (m *Manager) startStack(user *database.User, project *database.Project) error {
	if err := ValidateRun("stack", project.Run, project.AssignedPort); err != nil {
		return err
	}
	realWork, err := realPath(project.WorkingDir)
	if err != nil {
		return err
	}

	var keys []string
	var ports []int
	var routes []gatewayRoute
	rollback := func() {
		for _, key := range keys {
			m.abortLocked(key)
		}
	}

	for _, svc := range project.Run.Services {
		svc := svc
		dir, err := serviceDir(realWork, svc.Dir)
		if err != nil {
			rollback()
			return fmt.Errorf("process %s: %w", svc.Name, err)
		}
		port := svc.Port
		if port == 0 {
			if port, err = freePort(); err != nil {
				rollback()
				return err
			}
		}

		// what the process runs: its command, or the small server that serves a folder
		start := svc.Command
		serviceType := "process-service"
		if svc.Kind == "static" {
			serve, serveErr := cleanRelDir("the folder it serves", svc.Serve)
			if serveErr != nil {
				rollback()
				return fmt.Errorf("process %s: %w", svc.Name, serveErr)
			}
			if serve == "" {
				serve = "."
			}
			start = fmt.Sprintf(`cd %s && python3 -c "$RENEO_STATIC_SERVER" %d`, shellQuote(serve), port)
			serviceType = "static-service"
		}
		script := composeScript(svc.Install, svc.Build, start)

		child := *project
		child.AssignedPort = port
		child.ProjectType = serviceType
		e := &entry{
			project: child,
			key:     procKey(project.ID) + "/" + svc.Name,
			service: svc.Name,
			dir:     dir,
			stopCh:  make(chan struct{}),
		}
		if user != nil {
			owner := *user
			e.user = &owner
		}
		e.build = func() (*exec.Cmd, error) { return finishCommand(e.user, exec.Command("sh", "-c", script)) }
		if err := m.launch(e); err != nil {
			rollback()
			return fmt.Errorf("process %s: %w", svc.Name, err)
		}
		m.procs[e.key] = e
		keys = append(keys, e.key)
		ports = append(ports, port)
		go m.watch(e)

		prefix := svc.Path
		if prefix == "/" {
			prefix = ""
		}
		routes = append(routes, gatewayRoute{name: svc.Name, prefix: prefix, port: port})
	}

	gw, err := startGateway(project.AssignedPort, routes, func(format string, args ...any) { m.logLine(project.ID, format, args...) })
	if err != nil {
		rollback()
		return err
	}
	m.stacks[project.ID] = &stack{gateway: gw, keys: keys, ports: ports}
	m.logLine(project.ID, "the gateway listens on port %d for %d processes", project.AssignedPort, len(keys))
	return nil
}

// ready says whether a project accepts connections: its port, and for a project of several every process behind it
func (m *Manager) ready(project *database.Project) bool {
	if !isLocalPortOpen(project.AssignedPort) {
		return false
	}
	m.mu.RLock()
	st, ok := m.stacks[project.ID]
	m.mu.RUnlock()
	if !ok {
		return true
	}
	for _, port := range st.ports {
		if !isLocalPortOpen(port) {
			return false
		}
	}
	return true
}
