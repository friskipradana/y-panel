// Package cloudflare — daemon.go manages cloudflared process lifecycle.
// Each user tunnel runs a separate cloudflared process using their credentials.
package cloudflare

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// TunnelProcess represents a running cloudflared tunnel process.
type TunnelProcess struct {
	TunnelID   string
	UserID     int64
	CredFile   string
	ConfigFile string
	cmd        *exec.Cmd
	mu         sync.Mutex
	stopped    bool
}

// Daemon manages multiple cloudflared tunnel processes.
type Daemon struct {
	mu       sync.RWMutex
	tunnels  map[string]*TunnelProcess // key = tunnelID
	stateDir string
}

// NewDaemon creates a new Daemon that stores credentials/configs under stateDir.
func NewDaemon(stateDir string) *Daemon {
	return &Daemon{
		tunnels:  make(map[string]*TunnelProcess),
		stateDir: stateDir,
	}
}

// StartTunnel starts a cloudflared tunnel process for the given tunnel.
// credJSON is the credential JSON from Cloudflare API (stored to disk).
// configYAML is the cloudflared config YAML content.
func (d *Daemon) StartTunnel(tunnelID string, userID int64, credJSON, configYAML []byte) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if existing, ok := d.tunnels[tunnelID]; ok {
		existing.mu.Lock()
		alive := isProcessAlive(existing.cmd)
		existing.mu.Unlock()
		if alive {
			return nil // already running
		}
		delete(d.tunnels, tunnelID)
	}

	// Create user tunnel directory
	tunnelDir := d.tunnelDir(userID, tunnelID)
	if err := os.MkdirAll(tunnelDir, 0700); err != nil {
		return fmt.Errorf("mkdir tunnel dir: %w", err)
	}

	credFile := filepath.Join(tunnelDir, "credentials.json")
	configFile := filepath.Join(tunnelDir, "config.yml")

	if err := os.WriteFile(credFile, credJSON, 0600); err != nil {
		return fmt.Errorf("write cred file: %w", err)
	}
	if err := os.WriteFile(configFile, configYAML, 0644); err != nil {
		return fmt.Errorf("write config file: %w", err)
	}

	proc := &TunnelProcess{
		TunnelID:   tunnelID,
		UserID:     userID,
		CredFile:   credFile,
		ConfigFile: configFile,
	}

	if err := proc.start(); err != nil {
		return fmt.Errorf("start cloudflared: %w", err)
	}

	d.tunnels[tunnelID] = proc
	log.Printf("[cloudflared] tunnel started id=%s user=%d pid=%d", tunnelID, userID, proc.cmd.Process.Pid)

	// Monitor and auto-restart
	go d.watch(tunnelID, userID, credJSON, configYAML)

	return nil
}

// StopTunnel terminates a cloudflared tunnel process.
func (d *Daemon) StopTunnel(tunnelID string) error {
	d.mu.Lock()
	proc, ok := d.tunnels[tunnelID]
	if ok {
		delete(d.tunnels, tunnelID)
	}
	d.mu.Unlock()

	if !ok {
		return nil
	}

	proc.mu.Lock()
	defer proc.mu.Unlock()
	proc.stopped = true

	if proc.cmd != nil && proc.cmd.Process != nil {
		if err := proc.cmd.Process.Kill(); err != nil {
			log.Printf("[cloudflared] kill tunnel id=%s err=%v", tunnelID, err)
		}
	}
	log.Printf("[cloudflared] tunnel stopped id=%s", tunnelID)
	return nil
}

// IsRunning reports whether a tunnel process is currently active.
func (d *Daemon) IsRunning(tunnelID string) bool {
	d.mu.RLock()
	proc, ok := d.tunnels[tunnelID]
	d.mu.RUnlock()
	if !ok {
		return false
	}
	proc.mu.Lock()
	defer proc.mu.Unlock()
	return isProcessAlive(proc.cmd)
}

// StopAll terminates all managed tunnel processes.
func (d *Daemon) StopAll() {
	d.mu.Lock()
	ids := make([]string, 0, len(d.tunnels))
	for id := range d.tunnels {
		ids = append(ids, id)
	}
	d.mu.Unlock()

	for _, id := range ids {
		_ = d.StopTunnel(id)
	}
}

// ─── Internal ────────────────────────────────────────────────────────────────

func (p *TunnelProcess) start() error {
	cmd := exec.Command("cloudflared",
		"tunnel",
		"--config", p.ConfigFile,
		"--credentials-file", p.CredFile,
		"run", p.TunnelID,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	p.cmd = cmd
	return nil
}

func (d *Daemon) watch(tunnelID string, userID int64, credJSON, configYAML []byte) {
	const maxRestarts = 10
	restarts := 0
	backoff := 5 * time.Second

	for {
		time.Sleep(5 * time.Second)

		d.mu.RLock()
		proc, ok := d.tunnels[tunnelID]
		d.mu.RUnlock()

		if !ok {
			return // tunnel was explicitly stopped
		}

		proc.mu.Lock()
		isStopped := proc.stopped
		alive := isProcessAlive(proc.cmd)
		proc.mu.Unlock()

		if isStopped || alive {
			continue
		}

		// Process died unexpectedly — restart
		restarts++
		if restarts > maxRestarts {
			log.Printf("[cloudflared] tunnel id=%s exceeded max restarts, giving up", tunnelID)
			d.mu.Lock()
			delete(d.tunnels, tunnelID)
			d.mu.Unlock()
			return
		}

		log.Printf("[cloudflared] tunnel id=%s died, restarting in %s (attempt %d/%d)", tunnelID, backoff, restarts, maxRestarts)
		time.Sleep(backoff)
		backoff = min2(backoff*2, 2*time.Minute)

		proc.mu.Lock()
		if err := proc.start(); err != nil {
			log.Printf("[cloudflared] restart failed id=%s err=%v", tunnelID, err)
		} else {
			log.Printf("[cloudflared] tunnel restarted id=%s pid=%d", tunnelID, proc.cmd.Process.Pid)
			restarts = 0
			backoff = 5 * time.Second
		}
		proc.mu.Unlock()
	}
}

func (d *Daemon) tunnelDir(userID int64, tunnelID string) string {
	return filepath.Join(d.stateDir, "tunnels", fmt.Sprintf("user_%d", userID), tunnelID)
}

// CredFilePathFor returns the expected credential file path for a tunnel
// without starting the tunnel. Used by handlers to pass to config generator.
func (d *Daemon) CredFilePathFor(userID int64, tunnelID string) string {
	return filepath.Join(d.tunnelDir(userID, tunnelID), "credentials.json")
}

func isProcessAlive(cmd *exec.Cmd) bool {
	if cmd == nil || cmd.Process == nil {
		return false
	}
	// Check if process has exited by sending signal 0
	err := cmd.Process.Signal(os.Signal(nil))
	return err == nil
}

func min2(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
