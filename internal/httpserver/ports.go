package httpserver

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

// One host port, one owner. A port is refused when a project, a database or a container already
// holds it (stopped ones too: they take it again when they start), when the same request asks
// for it twice, or when something on the host is listening on it.

type portKey struct {
	port  int
	proto string
}

// portIgnore names what is being replaced by the request itself, so its own ports do not count against it.
type portIgnore struct {
	containerID string // a container that is deleted before the new one is created
	composeName string // a compose project that is deployed again under the same name
}

// portConflictError is a port that cannot be given; handlers answer it with 409.
type portConflictError struct {
	port  int
	proto string
	by    string
}

func (e *portConflictError) Error() string {
	return fmt.Sprintf("port %d/%s is already used by %s", e.port, e.proto, e.by)
}

func isPortConflict(err error) bool {
	var conflict *portConflictError
	return errors.As(err, &conflict)
}

// portClaims is who holds what, and which ports belong to the thing being replaced.
type portClaims struct {
	held    map[portKey]string
	ignored map[portKey]bool
}

func (s *Server) loadPortClaims(ig portIgnore) (*portClaims, error) {
	claims := &portClaims{held: map[portKey]string{}, ignored: map[portKey]bool{}}

	const page = 500
	for offset := 0; ; offset += page {
		list, total, err := s.database.ListAllProjects(page, offset)
		if err != nil {
			return nil, err
		}
		for _, p := range list {
			if p.AssignedPort > 0 {
				claims.held[portKey{p.AssignedPort, "tcp"}] = fmt.Sprintf("project %q", p.Name)
			}
		}
		if int64(offset+page) >= total || len(list) == 0 {
			break
		}
	}

	databases, err := s.database.ManagedDatabasePorts()
	if err != nil {
		return nil, err
	}
	for port := range databases {
		claims.held[portKey{port, "tcp"}] = "a database"
	}

	// without docker there are no containers to hold ports
	if published, err := docker.PublishedPorts(); err == nil {
		for _, p := range published {
			key := portKey{p.Port, p.Proto}
			replaced := (ig.containerID != "" && strings.HasPrefix(p.ID, ig.containerID)) || (ig.composeName != "" && p.Project == ig.composeName)
			if replaced {
				claims.ignored[key] = true
				continue
			}
			claims.held[key] = fmt.Sprintf("container %q", p.Container)
		}
	}
	return claims, nil
}

// listening reports whether something on the host already has the port open.
func listening(port int, proto string) bool {
	addr := fmt.Sprintf(":%d", port)
	if proto == "udp" {
		conn, err := net.ListenPacket("udp", addr)
		if err != nil {
			return true
		}
		_ = conn.Close()
		return false
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return true
	}
	_ = ln.Close()
	return false
}

func (c *portClaims) check(port int, proto string) error {
	if port < 1 || port > 65535 {
		return fmt.Errorf("port %d is outside 1-65535", port)
	}
	key := portKey{port, proto}
	if by, ok := c.held[key]; ok {
		return &portConflictError{port, proto, by}
	}
	if !c.ignored[key] && listening(port, proto) {
		return &portConflictError{port, proto, "a service running on the host"}
	}
	return nil
}

// ensurePortsFree refuses a request that would open a port someone else holds.
func (s *Server) ensurePortsFree(wants []docker.HostPort, ig portIgnore) error {
	if len(wants) == 0 {
		return nil
	}
	seen := map[portKey]bool{}
	for _, want := range wants {
		key := portKey{want.Port, want.Proto}
		if seen[key] {
			return &portConflictError{want.Port, want.Proto, "another mapping in this same request"}
		}
		seen[key] = true
	}
	claims, err := s.loadPortClaims(ig)
	if err != nil {
		return err
	}
	for _, want := range wants {
		if err := claims.check(want.Port, want.Proto); err != nil {
			return err
		}
	}
	return nil
}

// freePort finds the first port in [from, to] that nobody holds and nothing listens on.
func (s *Server) freePort(from, to int, skip func(int) bool) (int, error) {
	claims, err := s.loadPortClaims(portIgnore{})
	if err != nil {
		return 0, err
	}
	for port := from; port <= to; port++ {
		if skip != nil && skip(port) {
			continue
		}
		if claims.check(port, "tcp") == nil {
			return port, nil
		}
	}
	return 0, errors.New("no free port left in the range")
}

// writePortError answers a refused port with 409. Only the superadmin is told who holds the port:
// to everyone else that would name another account's project or container.
func (s *Server) writePortError(w http.ResponseWriter, actor *database.User, err error) {
	var conflict *portConflictError
	if !errors.As(err, &conflict) {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	by := conflict.by
	if (actor == nil || actor.Role != "superadmin") && !strings.HasPrefix(by, "another mapping") {
		by = "another service"
	}
	s.writeJSON(w, http.StatusConflict, jsonResponse{
		"error": fmt.Sprintf("port %d/%s is already used by %s", conflict.port, conflict.proto, by),
		"code":  "port_in_use",
		"port":  conflict.port,
	})
}
