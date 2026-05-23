package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

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

	startResult, err := s.terminalManager.Start(terminal.StartRequest{
		PanelUsername: currentUser.Username,
		DisplayName:   currentUser.DisplayName,
		Role:          currentUser.Role,
		Target:        target,
		Cwd:           cwd,
	})
	if err != nil {
		log.Printf("[terminal] start failed remote=%s err=%v", remoteAddr(r), err)
		s.auditSensitiveAction(r, currentUser, "terminal.start", "failed", map[string]any{"target": target, "cwd": cwd, "error": err.Error()})
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	username, _ := s.currentUser(r)
	log.Printf("[terminal] session started id=%s user=%q remote=%s", startResult.SessionID, username, remoteAddr(r))
	s.auditSensitiveAction(r, currentUser, "terminal.start", "success", map[string]any{"sessionId": startResult.SessionID, "mode": startResult.Mode, "target": startResult.Target, "cwd": startResult.Cwd, "osUsername": startResult.OSUsername})
	s.writeJSON(w, http.StatusOK, jsonResponse{"sessionId": startResult.SessionID})
}

func (s *Server) handleTerminalSessionWebSocket(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "missing session id"})
		return
	}

	username, _ := s.currentUser(r)
	conn, err := s.terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[terminal] ws upgrade failed id=%s user=%q remote=%s err=%v", id, username, remoteAddr(r), err)
		return
	}

	log.Printf("[terminal] ws attached id=%s user=%q remote=%s", id, username, remoteAddr(r))
	writeMu := syncWriter{}
	closed := make(chan struct{})

	safeWrite := func(payload terminalSocketMessage) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteJSON(payload)
	}

	if err := s.terminalManager.Attach(
		id,
		func(chunk string) {
			_ = safeWrite(terminalSocketMessage{Type: "output", Data: chunk, Session: id})
		},
		func() {
			log.Printf("[terminal] session closed id=%s user=%q", id, username)
			_ = safeWrite(terminalSocketMessage{Type: "closed", Closed: true, Session: id})
			closeChannel(closed)
		},
	); err != nil {
		log.Printf("[terminal] attach failed id=%s user=%q remote=%s err=%v", id, username, remoteAddr(r), err)
		_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
		_ = conn.Close()
		return
	}
	defer func() {
		log.Printf("[terminal] ws detached id=%s user=%q remote=%s", id, username, remoteAddr(r))
		_ = s.terminalManager.Detach(id)
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

		switch msg.Type {
		case "input":
			if err := s.terminalManager.Write(id, msg.Data); err != nil {
				log.Printf("[terminal] input failed id=%s user=%q err=%v", id, username, err)
				_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
				return
			}
		case "resize":
			if err := s.terminalManager.Resize(id, msg.Cols, msg.Rows); err != nil {
				log.Printf("[terminal] resize failed id=%s user=%q cols=%d rows=%d err=%v", id, username, msg.Cols, msg.Rows, err)
				_ = safeWrite(terminalSocketMessage{Type: "error", Error: err.Error(), Session: id})
				return
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

	meta, _ := s.terminalManager.SessionMeta(id)
	if err := s.terminalManager.Close(id); err != nil {
		s.writeError(w, http.StatusNotFound, err)
		return
	}
	if currentUser := s.currentUserRecord(r); currentUser != nil {
		s.auditSensitiveAction(r, currentUser, "terminal.close", "success", map[string]any{"sessionId": id, "mode": meta.Mode, "target": meta.Target, "cwd": meta.Cwd})
	}

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
			summary := system.Inspect(s.cfg.PortainerURL, s.cfg.StateDir)
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
