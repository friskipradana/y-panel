package terminal

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
)

const maxBufferedOutput = 256 * 1024

type Session struct {
	id     string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	closed bool

	mu         sync.RWMutex
	onChunk    func(string)
	onClose    func()
	closeOnce  sync.Once
	callbackMu sync.RWMutex
	outputMu   sync.RWMutex
	outputBuf  []byte
}

type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

func NewManager() *Manager {
	return &Manager{sessions: map[string]*Session{}}
}

func (m *Manager) Start() (string, error) {
	id, err := randomID(12)
	if err != nil {
		return "", err
	}

	cmd := exec.Command("script", "-qfc", "export TERM=xterm-256color COLORTERM=truecolor COLUMNS=120 LINES=32; stty cols 120 rows 32 2>/dev/null; exec /bin/bash -i", "/dev/null")
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"COLUMNS=120",
		"LINES=32",
	)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", fmt.Errorf("terminal stdin: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("terminal stdout: %w", err)
	}
	cmd.Stderr = cmd.Stdout

	session := &Session{
		id:    id,
		cmd:   cmd,
		stdin: stdin,
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("start shell: %w", err)
	}

	m.mu.Lock()
	m.sessions[id] = session
	m.mu.Unlock()

	go m.captureOutput(session, stdout)
	go m.waitForExit(session)

	return id, nil
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

	if _, err := io.WriteString(session.stdin, input); err != nil {
		return fmt.Errorf("write terminal input: %w", err)
	}
	return nil
}

func (m *Manager) Attach(id string, onChunk func(string), onClose func()) error {
	session, err := m.get(id)
	if err != nil {
		return err
	}

	session.callbackMu.Lock()
	session.onChunk = onChunk
	session.onClose = onClose
	closed := session.closed
	session.callbackMu.Unlock()

	if onChunk != nil {
		session.outputMu.RLock()
		buffered := string(session.outputBuf)
		session.outputMu.RUnlock()
		if buffered != "" {
			onChunk(buffered)
		}
	}

	if closed && onClose != nil {
		onClose()
	}
	return nil
}

func (m *Manager) Detach(id string) error {
	session, err := m.get(id)
	if err != nil {
		return err
	}

	session.callbackMu.Lock()
	session.onChunk = nil
	session.onClose = nil
	session.callbackMu.Unlock()
	return nil
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

	command := fmt.Sprintf("stty cols %d rows %d 2>/dev/null; export COLUMNS=%d LINES=%d\n", cols, rows, cols, rows)
	if _, err := io.WriteString(session.stdin, command); err != nil {
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
			session.appendOutput(buffer[:n])
			session.callbackMu.RLock()
			cb := session.onChunk
			session.callbackMu.RUnlock()
			if cb != nil {
				cb(chunk)
			}
		}
		if err != nil {
			if err != io.EOF {
				errChunk := "\r\n[terminal error] " + err.Error() + "\r\n"
				session.appendOutput([]byte(errChunk))
				session.callbackMu.RLock()
				cb := session.onChunk
				session.callbackMu.RUnlock()
				if cb != nil {
					cb(errChunk)
				}
			}
			m.closeSession(session)
			return
		}
	}
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

		_ = session.stdin.Close()
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
