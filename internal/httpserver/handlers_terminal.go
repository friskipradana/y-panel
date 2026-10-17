package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/system"
	"github.com/friskipradana/panel-desktop-ui/internal/terminal"
)

// ─── Terminal Session Handlers ──────────────────────────────────────────────

type terminalSocketMessage struct {
	Type    string `json:"type"`
	Data    string `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
	Closed  bool   `json:"closed,omitempty"`
	Session string `json:"sessionId,omitempty"`
	Cols    int    `json:"cols,omitempty"`
	Rows    int    `json:"rows,omitempty"`
}

func (s *Server) handleTerminalSessionStart(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		Target string `json:"target"`
		Cwd    string `json:"cwd"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	currentUser := s.currentUserRecord(r)
	if currentUser == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	if !s.cfg.TerminalEnabled {
		s.auditSensitiveAction(r, currentUser, "terminal.start", "blocked", map[string]any{"reason": "terminal_disabled"})
		s.writeError(w, http.StatusForbidden, errors.New("terminal host dinonaktifkan oleh konfigurasi panel"))
		return
	}

	target := strings.TrimSpace(req.Target)
	cwd := strings.TrimSpace(req.Cwd)
	isRemote := target != "" && target != "local"
	if isRemote && !auth.HasCapability(currentUser.Role, auth.CapabilityTerminalRemote) {
		s.auditSensitiveAction(r, currentUser, "terminal.start", "blocked", map[string]any{"reason": "missing_remote_terminal_capability", "target": target, "cwd": cwd})
		s.writeError(w, http.StatusForbidden, errors.New("terminal remote tidak diizinkan untuk role ini"))
		return
	}
	if isRemote && !s.cfg.TerminalAllowRemote {
		s.auditSensitiveAction(r, currentUser, "terminal.start", "blocked", map[string]any{"reason": "remote_terminal_disabled", "target": target, "cwd": cwd})
		s.writeError(w, http.StatusForbidden, errors.New("terminal remote SSH dinonaktifkan oleh konfigurasi panel"))
		return
	}

	startReq := terminal.StartRequest{
		OwnerID:       currentUser.ID,
		PanelUsername: currentUser.Username,
		DisplayName:   currentUser.DisplayName,
		Role:          currentUser.Role,
		Target:        target,
		Cwd:           cwd,
	}
	if !auth.IsSuperAdmin(currentUser.Role) {
		if quota, qerr := s.database.GetUserQuota(currentUser.ID); qerr == nil && quota != nil {
			startReq.CPULimitPct, startReq.MemoryLimitMB = quota.CPULimitPct, quota.MemoryLimitMB
		}
	}
	startResult, err := s.terminalManager.Start(startReq)
	if err != nil {
		log.Printf("[terminal] start failed remote=%s err=%v", remoteAddr(r), err)
		s.auditSensitiveAction(r, currentUser, "terminal.start", "failed", map[string]any{"target": target, "cwd": cwd, "error": err.Error()})
		status := http.StatusBadGateway
		switch {
		case errors.Is(err, terminal.ErrTooManySessions):
			status = http.StatusTooManyRequests
		case errors.Is(err, terminal.ErrInvalid):
			status = http.StatusBadRequest
		}
		s.writeError(w, status, err)
		return
	}

	username, _ := s.currentUser(r)
	log.Printf("[terminal] session started id=%s user=%q remote=%s", startResult.SessionID, username, remoteAddr(r))
	s.auditSensitiveAction(r, currentUser, "terminal.start", "success", map[string]any{"sessionId": startResult.SessionID, "mode": startResult.Mode, "target": startResult.Target, "cwd": startResult.Cwd, "osUsername": startResult.OSUsername})
	s.writeJSON(w, http.StatusOK, jsonResponse{"sessionId": startResult.SessionID})
}

const (
	terminalWriteWait  = 10 * time.Second
	terminalPongWait   = 75 * time.Second
	terminalPingPeriod = 25 * time.Second
	terminalReadLimit  = 64 * 1024
)

func (s *Server) handleTerminalSessionWebSocket(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing session id"})
		return
	}

	// only the account that started a session may attach to it; a foreign id looks like an unknown one
	owner := s.currentUserRecord(r)
	if owner == nil || s.terminalManager.Authorize(id, owner.ID) != nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "terminal session not found"})
		return
	}

	username, _ := s.currentUser(r)
	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[terminal] ws upgrade failed id=%s user=%q remote=%s err=%v", id, username, remoteAddr(r), err)
		return
	}

	log.Printf("[terminal] ws attached id=%s user=%q remote=%s", id, username, remoteAddr(r))

	var (
		writeMu   sync.Mutex
		closeOnce sync.Once
	)
	closed := make(chan struct{})
	markClosed := func() { closeOnce.Do(func() { close(closed) }) }

	// A write deadline keeps one half-open client from stalling the PTY reader
	// (and with it every later re-attach of the same session).
	safeWrite := func(payload terminalSocketMessage) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		_ = conn.SetWriteDeadline(time.Now().Add(terminalWriteWait))
		return conn.WriteJSON(payload)
	}

	conn.SetReadLimit(terminalReadLimit)
	_ = conn.SetReadDeadline(time.Now().Add(terminalPongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(terminalPongWait))
	})

	gen, err := s.terminalManager.Attach(
		id,
		func(chunk string) error {
			return safeWrite(terminalSocketMessage{Type: "output", Data: chunk, Session: id})
		},
		func() {
			log.Printf("[terminal] session closed id=%s user=%q", id, username)
			_ = safeWrite(terminalSocketMessage{Type: "closed", Closed: true, Session: id})
			markClosed()
			_ = conn.Close()
		},
		func() {
			log.Printf("[terminal] ws replaced by newer connection id=%s user=%q", id, username)
			markClosed()
			_ = conn.Close()
		},
	)
	if err != nil {
		log.Printf("[terminal] attach failed id=%s user=%q remote=%s err=%v", id, username, remoteAddr(r), err)
		_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
		_ = conn.Close()
		return
	}

	pingDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(terminalPingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-pingDone:
				return
			case <-closed:
				return
			case <-ticker.C:
				writeMu.Lock()
				err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(terminalWriteWait))
				writeMu.Unlock()
				if err != nil {
					_ = conn.Close()
					return
				}
			}
		}
	}()

	defer func() {
		close(pingDone)
		log.Printf("[terminal] ws detached id=%s user=%q remote=%s", id, username, remoteAddr(r))
		_ = s.terminalManager.Detach(id, gen)
		_ = conn.Close()
	}()

	_ = safeWrite(terminalSocketMessage{Type: "ready", Session: id})

	for {
		select {
		case <-closed:
			return
		default:
		}

		var msg terminalSocketMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(terminalPongWait))

		switch msg.Type {
		case "ping":
			_ = safeWrite(terminalSocketMessage{Type: "pong", Session: id})
		case "input":
			if err := s.terminalManager.Write(id, msg.Data); err != nil {
				log.Printf("[terminal] input failed id=%s user=%q err=%v", id, username, err)
				_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
				return
			}
		case "resize":
			if err := s.terminalManager.Resize(id, msg.Cols, msg.Rows); err != nil {
				// A bad size must not tear down a healthy shell; report and continue.
				log.Printf("[terminal] resize failed id=%s user=%q cols=%d rows=%d err=%v", id, username, msg.Cols, msg.Rows, err)
				_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
			}
		case "close":
			log.Printf("[terminal] close requested id=%s user=%q", id, username)
			_ = s.terminalManager.Close(id)
			return
		default:
			_ = safeWrite(terminalSocketMessage{Type: "error", Error: "unknown websocket message type", Session: id})
		}
	}
}

func (s *Server) handleTerminalSessionClose(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing session id"})
		return
	}

	currentUser := s.currentUserRecord(r)
	if currentUser == nil || s.terminalManager.Authorize(id, currentUser.ID) != nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "terminal session not found"})
		return
	}
	meta, _ := s.terminalManager.SessionMeta(id)
	if err := s.terminalManager.Close(id); err != nil {
		s.writeError(w, http.StatusNotFound, err)
		return
	}
	s.auditSensitiveAction(r, currentUser, "terminal.close", "success", map[string]any{"sessionId": id, "mode": meta.Mode, "target": meta.Target, "cwd": meta.Cwd})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// ─── System Stats WebSocket ─────────────────────────────────────────────────

func (s *Server) handleSystemStatsWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	stop := make(chan struct{})
	go func() {
		_, _, _ = conn.ReadMessage()
		close(stop)
	}()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			summary := system.Inspect(s.cfg.StateDir)
			if err := conn.WriteJSON(summary); err != nil {
				return
			}
		}
	}
}

// ─── Terminal Preset Handlers ────────────────────────────────────────────────

func (s *Server) handleListTerminalPresets(w http.ResponseWriter, r *http.Request) {
	currentUser := s.currentUserRecord(r)
	var userID *int64
	if currentUser != nil {
		userID = &currentUser.ID
	}
	presets, err := s.database.ListTerminalPresets(userID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"presets": presets})
}

func (s *Server) handleCreateTerminalPreset(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		Label   string `json:"label"`
		Command string `json:"command"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	currentUser := s.currentUserRecord(r)
	var userID *int64
	if currentUser != nil {
		userID = &currentUser.ID
	}
	preset, err := s.database.CreateTerminalPreset(userID, req.Label, req.Command)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err)
		return
	}
	s.notifyCurrentServerUser(r, "Preset terminal dibuat 💻", fmt.Sprintf("Preset command '%s' berhasil ditambahkan.", preset.Command), "success")
	s.writeJSON(w, http.StatusCreated, jsonResponse{"preset": preset})
}

func (s *Server) handleDeleteTerminalPreset(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid preset id"})
		return
	}
	currentUser := s.currentUserRecord(r)
	var userID *int64
	if currentUser != nil {
		userID = &currentUser.ID
	}
	if err := s.database.DeleteTerminalPreset(id, userID); err != nil {
		s.writeError(w, http.StatusNotFound, err)
		return
	}
	s.notifyCurrentServerUser(r, "Preset terminal dihapus 🗑️", "Preset terminal berhasil dihapus.", "warning")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleResetTerminalPresets(w http.ResponseWriter, r *http.Request) {
	currentUser := s.currentUserRecord(r)
	var userID *int64
	if currentUser != nil {
		userID = &currentUser.ID
	}
	if err := s.database.ResetTerminalPresets(userID); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	presets, _ := s.database.ListTerminalPresets(userID)
	s.notifyCurrentServerUser(r, "Preset terminal direset ♻️", fmt.Sprintf("Preset terminal berhasil direset. Total preset aktif: %d.", len(presets)), "info")
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "presets": presets})
}
