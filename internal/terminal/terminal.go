package terminal

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/friskipradana/panel-desktop-ui/internal/osuser"
)

const (
	maxBufferedOutput = 256 * 1024
	defaultCols       = 120
	defaultRows       = 32

	// A session without an attached websocket is kept alive this long so the
	// browser can re-attach after a network drop, then it is reaped.
	detachedTTL  = 30 * time.Minute
	reapInterval = time.Minute
)

type Session struct {
	id     string
	cmd    *exec.Cmd
	pty    *os.File
	closed bool
	meta   SessionMeta

	mu         sync.RWMutex
	onChunk    func(string) error
	onClose    func()
	onReplaced func()
	attachGen  uint64
	detachedAt time.Time
	closeOnce  sync.Once
	callbackMu sync.RWMutex
	outputMu   sync.RWMutex
	streamMu   sync.Mutex
	outputBuf  []byte
}

type SessionMeta struct {
	Mode       string
	Target     string
	Cwd        string
	OSUsername string
}

type StartRequest struct {
	PanelUsername string
	DisplayName   string
	Role          string
	Target        string
	Cwd           string
}

type StartResult struct {
	SessionID  string
	Mode       string
	Target     string
	Cwd        string
	OSUsername string
}

type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

func NewManager() *Manager {
	m := &Manager{sessions: map[string]*Session{}}
	go m.reapLoop()
	return m
}

// reapLoop closes sessions that stayed detached longer than detachedTTL.
func (m *Manager) reapLoop() {
	ticker := time.NewTicker(reapInterval)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		var stale []*Session
		m.mu.RLock()
		for _, s := range m.sessions {
			s.callbackMu.RLock()
			attached := s.onChunk != nil
			detachedAt := s.detachedAt
			s.callbackMu.RUnlock()
			if !attached && !detachedAt.IsZero() && now.Sub(detachedAt) > detachedTTL {
				stale = append(stale, s)
			}
		}
		m.mu.RUnlock()
		for _, s := range stale {
			m.closeSession(s)
		}
	}
}

func (m *Manager) Start(req StartRequest) (*StartResult, error) {
	id, err := randomID(12)
	if err != nil {
		return nil, err
	}

	target := strings.TrimSpace(req.Target)
	cwd := strings.TrimSpace(req.Cwd)
	mode := "local-user"
	osUsername := ""

	var cmd *exec.Cmd
	if target == "" || target == "local" {
		cmd = exec.Command("/bin/bash", "-i")
		osUsername, err = osuser.EnsureUserForRole(req.PanelUsername, req.DisplayName, req.Role)
		if err != nil {
			return nil, err
		}
		cmd, err = osuser.WrapCommand(cmd, osUsername)
		if err != nil {
			return nil, err
		}
		if cwd != "" {
			cmd.Dir = cwd
		}
	} else {
		mode = "remote-ssh"
		cmd = exec.Command("ssh", "-t", target)
		if cwd != "" {
			cmd.Dir = cwd
		}
	}

	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)

	ptyFile, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(defaultCols), Rows: uint16(defaultRows)})
	if err != nil {
		return nil, fmt.Errorf("start pty shell: %w", err)
	}

	session := &Session{
		id:         id,
		cmd:        cmd,
		pty:        ptyFile,
		detachedAt: time.Now(),
		meta: SessionMeta{
			Mode:       mode,
			Target:     target,
			Cwd:        cwd,
			OSUsername: osUsername,
		},
	}

	m.mu.Lock()
	m.sessions[id] = session
	m.mu.Unlock()

	go m.captureOutput(session, ptyFile)
	go m.waitForExit(session)

	return &StartResult{SessionID: id, Mode: mode, Target: target, Cwd: cwd, OSUsername: osUsername}, nil
}

func (m *Manager) Write(id, input string) error {
	session, err := m.get(id)
	if err != nil {
		return err
	}

	session.mu.RLock()
	closed := session.closed
	session.mu.RUnlock()
	if closed {
		return fmt.Errorf("terminal session closed")
	}

	if _, err := io.WriteString(session.pty, input); err != nil {
		return fmt.Errorf("write terminal input: %w", err)
	}
	return nil
}

// Attach binds a websocket to the session and returns an attach generation.
// Output buffered while detached is flushed first. A previous attachment is
// told to go away through its onReplaced callback.
func (m *Manager) Attach(id string, onChunk func(string) error, onClose func(), onReplaced func()) (uint64, error) {
	session, err := m.get(id)
	if err != nil {
		return 0, err
	}

	var buffered string
	session.streamMu.Lock()
	session.outputMu.Lock()
	if len(session.outputBuf) > 0 {
		buffered = string(append([]byte(nil), session.outputBuf...))
		session.outputBuf = nil
	}
	session.outputMu.Unlock()
	session.callbackMu.Lock()
	previous := session.onReplaced
	session.attachGen++
	gen := session.attachGen
	session.onChunk = onChunk
	session.onClose = onClose
	session.onReplaced = onReplaced
	session.detachedAt = time.Time{}
	session.callbackMu.Unlock()
	session.streamMu.Unlock()

	if previous != nil {
		previous()
	}

	session.mu.RLock()
	closed := session.closed
	session.mu.RUnlock()

	if buffered != "" && onChunk != nil {
		if err := onChunk(buffered); err != nil {
			session.appendOutput([]byte(buffered))
			m.detachIfCurrent(session, gen)
		}
	}
	if closed && onClose != nil {
		onClose()
	}
	return gen, nil
}

// Detach releases the attachment only when gen still owns the session, so a
// stale connection can never wipe the callbacks of its replacement.
func (m *Manager) Detach(id string, gen uint64) error {
	session, err := m.get(id)
	if err != nil {
		return err
	}
	m.detachIfCurrent(session, gen)
	return nil
}

func (m *Manager) detachIfCurrent(session *Session, gen uint64) {
	session.callbackMu.Lock()
	defer session.callbackMu.Unlock()
	if session.attachGen != gen {
		return
	}
	session.onChunk = nil
	session.onClose = nil
	session.onReplaced = nil
	session.detachedAt = time.Now()
}

func (m *Manager) Close(id string) error {
	session, err := m.get(id)
	if err != nil {
		return err
	}
	m.closeSession(session)
	return nil
}

func (m *Manager) Resize(id string, cols, rows int) error {
	session, err := m.get(id)
	if err != nil {
		return err
	}

	if cols < 20 {
		cols = 20
	}
	if rows < 8 {
		rows = 8
	}

	if err := pty.Setsize(session.pty, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}); err != nil {
		return fmt.Errorf("resize terminal: %w", err)
	}
	return nil
}

func (m *Manager) captureOutput(session *Session, reader io.Reader) {
	buffer := make([]byte, 4096)
	for {
		n, err := reader.Read(buffer)
		if n > 0 {
			chunk := string(buffer[:n])
			m.deliver(session, chunk, buffer[:n])
		}
		if err != nil {
			if err != io.EOF {
				errChunk := "\r\n[terminal error] " + err.Error() + "\r\n"
				m.deliver(session, errChunk, []byte(errChunk))
			}
			m.closeSession(session)
			return
		}
	}
}

// deliver sends a chunk to the attached websocket, or buffers it when no
// websocket is attached or the write failed (so nothing is lost on reconnect).
func (m *Manager) deliver(session *Session, chunk string, raw []byte) {
	session.streamMu.Lock()
	defer session.streamMu.Unlock()

	session.callbackMu.RLock()
	cb := session.onChunk
	gen := session.attachGen
	session.callbackMu.RUnlock()

	if cb != nil {
		if err := cb(chunk); err == nil {
			return
		}
		m.detachIfCurrent(session, gen)
	}
	session.appendOutput(raw)
}

func (m *Manager) waitForExit(session *Session) {
	_ = session.cmd.Wait()
	m.closeSession(session)
}

func (m *Manager) closeSession(session *Session) {
	session.closeOnce.Do(func() {
		session.mu.Lock()
		session.closed = true
		session.mu.Unlock()

		if session.pty != nil {
			_ = session.pty.Close()
		}
		if session.cmd.Process != nil {
			_ = session.cmd.Process.Kill()
		}

		session.callbackMu.RLock()
		onClose := session.onClose
		session.callbackMu.RUnlock()
		if onClose != nil {
			onClose()
		}

		m.remove(session.id)
	})
}

func (m *Manager) get(id string) (*Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	session, ok := m.sessions[id]
	if !ok {
		return nil, fmt.Errorf("terminal session not found")
	}
	return session, nil
}

func (m *Manager) remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, id)
}

func (s *Session) appendOutput(chunk []byte) {
	s.outputMu.Lock()
	defer s.outputMu.Unlock()

	s.outputBuf = append(s.outputBuf, chunk...)
	if len(s.outputBuf) <= maxBufferedOutput {
		return
	}
	s.outputBuf = append([]byte(nil), s.outputBuf[len(s.outputBuf)-maxBufferedOutput:]...)
}

func randomID(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("random id: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

func (m *Manager) SessionMeta(id string) (SessionMeta, error) {
	session, err := m.get(id)
	if err != nil {
		return SessionMeta{}, err
	}
	return session.meta, nil
}
