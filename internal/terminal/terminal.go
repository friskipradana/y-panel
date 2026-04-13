package terminal

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
)

const (
	maxBufferedOutput = 256 * 1024
	defaultCols       = 120
	defaultRows       = 32
)

type Session struct {
	id     string
	cmd    *exec.Cmd
	pty    *os.File
	closed bool

	mu         sync.RWMutex
	onChunk    func(string)
	onClose    func()
	closeOnce  sync.Once
	callbackMu sync.RWMutex
	outputMu   sync.RWMutex
	streamMu   sync.Mutex
	outputBuf  []byte
}

type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

func NewManager() *Manager {
	return &Manager{sessions: map[string]*Session{}}
}

func (m *Manager) Start(target string) (string, error) {
	id, err := randomID(12)
	if err != nil {
		return "", err
	}

	var cmd *exec.Cmd
	if target == "" || target == "local" {
		cmd = exec.Command("/bin/bash", "-i")
	} else {
		// target format: user@host or host
		cmd = exec.Command("ssh", "-t", target)
	}

	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)

	ptyFile, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(defaultCols), Rows: uint16(defaultRows)})
	if err != nil {
		return "", fmt.Errorf("start pty shell: %w", err)
	}

	session := &Session{
		id:  id,
		cmd: cmd,
		pty: ptyFile,
	}

	m.mu.Lock()
	m.sessions[id] = session
	m.mu.Unlock()

	go m.captureOutput(session, ptyFile)
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

	if _, err := io.WriteString(session.pty, input); err != nil {
		return fmt.Errorf("write terminal input: %w", err)
	}
	return nil
}

func (m *Manager) Attach(id string, onChunk func(string), onClose func()) error {
	session, err := m.get(id)
	if err != nil {
		return err
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
	session.onChunk = onChunk
	session.onClose = onClose
	session.callbackMu.Unlock()
	session.streamMu.Unlock()

	session.mu.RLock()
	closed := session.closed
	session.mu.RUnlock()

	if buffered != "" && onChunk != nil {
		onChunk(buffered)
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
			session.streamMu.Lock()
			session.callbackMu.RLock()
			cb := session.onChunk
			session.callbackMu.RUnlock()
			if cb != nil {
				cb(chunk)
			} else {
				session.appendOutput(buffer[:n])
			}
			session.streamMu.Unlock()
		}
		if err != nil {
			if err != io.EOF {
				errChunk := "\r\n[terminal error] " + err.Error() + "\r\n"
				session.streamMu.Lock()
				session.callbackMu.RLock()
				cb := session.onChunk
				session.callbackMu.RUnlock()
				if cb != nil {
					cb(errChunk)
				} else {
					session.appendOutput([]byte(errChunk))
				}
				session.streamMu.Unlock()
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
