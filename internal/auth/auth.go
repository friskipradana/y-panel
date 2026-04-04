package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

type sessionRecord struct {
	username  string
	expiresAt int64
}

type Manager struct {
	username string
	password string
	ttlNanos int64

	mu       sync.RWMutex
	sessions map[string]sessionRecord
}

func NewManager(username, password string, ttl time.Duration) *Manager {
	return &Manager{
		username: username,
		password: password,
		ttlNanos: ttl.Nanoseconds(),
		sessions: make(map[string]sessionRecord),
	}
}

func (m *Manager) Login(username, password string) (string, error) {
	if subtle.ConstantTimeCompare([]byte(username), []byte(m.username)) != 1 {
		return "", errors.New("invalid credentials")
	}
	if subtle.ConstantTimeCompare([]byte(password), []byte(m.password)) != 1 {
		return "", errors.New("invalid credentials")
	}

	token, err := randomToken(32)
	if err != nil {
		return "", err
	}

	m.mu.Lock()
	m.sessions[token] = sessionRecord{
		username:  username,
		expiresAt: time.Now().Add(time.Duration(m.ttlNanos)).UnixNano(),
	}
	m.mu.Unlock()

	return token, nil
}

func (m *Manager) Validate(token string) (string, bool) {
	now := time.Now().UnixNano()

	m.mu.Lock()
	defer m.mu.Unlock()

	record, ok := m.sessions[token]
	if !ok {
		return "", false
	}
	if record.expiresAt <= now {
		delete(m.sessions, token)
		return "", false
	}

	record.expiresAt = time.Now().Add(time.Duration(m.ttlNanos)).UnixNano()
	m.sessions[token] = record
	return record.username, true
}

func (m *Manager) Logout(token string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, token)
}

func randomToken(length int) (string, error) {
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
