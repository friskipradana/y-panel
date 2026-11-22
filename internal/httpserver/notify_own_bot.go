package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// The own notification bot of an account, for the plans that include it: the account brings the token of its own Telegram
// bot and its notices leave from that bot instead of the seller's.

func (s *Server) handleGetOwnBot(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	state, err := s.notify.OwnBot(userFromCtx(r).ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleSaveOwnBot(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
		return
	}
	u := userFromCtx(r)
	if allowed, retry := s.allowRateLimit("ownbot:"+u.Username, rateLimitRule{Window: time.Minute, Limit: 10}); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())+1))
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many attempts, wait a moment"})
		return
	}
	var req struct {
		Enabled  bool    `json:"enabled"`
		BotToken *string `json:"botToken"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if req.BotToken != nil {
		token := strings.TrimSpace(*req.BotToken)
		if token == "" {
			req.BotToken = nil
		} else {
			req.BotToken = &token
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := s.notify.ConfigureOwnBot(ctx, u.ID, req.BotToken, req.Enabled); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, notify.ErrOwnBotNotAllowed) {
			status = http.StatusForbidden
		}
		s.writeJSON(w, status, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "notify.ownbot.save", "ok", map[string]any{"enabled": req.Enabled, "tokenChanged": req.BotToken != nil})
	s.handleGetOwnBot(w, r)
}

func (s *Server) handleRemoveOwnBot(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	u := userFromCtx(r)
	if err := s.notify.RemoveOwnBot(u.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "notify.ownbot.remove", "ok", nil)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}
