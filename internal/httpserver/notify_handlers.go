package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// The settings of notices outside the panel, for the superadmin: the channels, where the superadmin wants the notices,
// the queue, and the thresholds of the attack alerts.

func (s *Server) notifyReady(w http.ResponseWriter) bool {
	if s.notify == nil || s.database == nil || !s.database.IsConnected() {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": "notifications need the database"})
		return false
	}
	return true
}

// maskAddress shows the end of a chat id or a number, enough to recognise it and not enough to use it; at least
// half of it is always hidden, so a short one is not shown whole
func maskAddress(address string) string {
	keep := len(address) / 2
	if keep > 4 {
		keep = 4
	}
	return strings.Repeat("•", len(address)-keep) + address[len(address)-keep:]
}

type recipientView struct {
	Linked      bool       `json:"linked"`
	Address     string     `json:"address"`
	VerifiedAt  *time.Time `json:"verifiedAt"`
	Blocked     bool       `json:"blocked"`
	MutedEvents []string   `json:"mutedEvents"`
	// PendingUntil is set while a link is waiting to be completed
	PendingUntil *time.Time `json:"pendingUntil"`
}

func recipientViewOf(r *database.NotifyRecipient) recipientView {
	if r == nil {
		return recipientView{MutedEvents: []string{}}
	}
	view := recipientView{
		Linked: r.VerifiedAt != nil && r.Address != "", Address: maskAddress(r.Address), VerifiedAt: r.VerifiedAt,
		Blocked: r.BlockedAt != nil, MutedEvents: r.MutedEvents,
	}
	if r.LinkCode != "" && r.LinkExpiresAt != nil && r.LinkExpiresAt.After(time.Now()) {
		view.PendingUntil = r.LinkExpiresAt
	}
	return view
}

// handleNotifyOverview is everything the tab needs on opening: the channels, the account's own link, and the queue counts
func (s *Server) handleNotifyOverview(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	u := userFromCtx(r)
	channels, err := s.notify.ChannelViews()
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	rec, _ := s.database.GetNotifyRecipient(u.ID, "telegram")
	pending, failed, _ := s.database.OutboxCounts()
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"channels": channels, "telegram": recipientViewOf(rec), "pending": pending, "failed": failed,
	})
}

// handleSaveTelegramChannel saves the bot token (checked with Telegram first) and the switch of the channel
func (s *Server) handleSaveTelegramChannel(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
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
	if err := s.notify.ConfigureTelegram(ctx, req.BotToken, req.Enabled); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "notify.channel.telegram", "ok", map[string]any{"enabled": req.Enabled, "tokenChanged": req.BotToken != nil})
	}
	s.handleNotifyOverview(w, r)
}

// handleTestTelegram queues a test message to the superadmin's own Telegram, through the same queue as everything else
func (s *Server) handleTestTelegram(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	channel, _ := s.notify.Channel("telegram")
	if channel == nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "switch the Telegram channel on first"})
		return
	}
	id, err := s.notify.SendTest(userFromCtx(r).ID)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusAccepted, jsonResponse{"id": id})
}

func (s *Server) handleStartTelegramLink(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	link, err := s.notify.StartTelegramLink(userFromCtx(r).ID)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, link)
}

// handleCheckTelegramLink reads what was sent to the bot; the page asks every few seconds while the link is waiting
func (s *Server) handleCheckTelegramLink(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	u := userFromCtx(r)
	if allowed, retry := s.allowRateLimit("tglink:"+u.Username, rateLimitRule{Window: time.Minute, Limit: 30}); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())+1))
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many checks, wait a moment"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	linked, err := s.notify.CheckTelegramLink(ctx, u.ID)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	rec, _ := s.database.GetNotifyRecipient(u.ID, "telegram")
	s.writeJSON(w, http.StatusOK, jsonResponse{"linked": linked, "telegram": recipientViewOf(rec)})
}

// validMute accepts an event of the catalog, or one of its groups
func validMute(key string) bool {
	if notify.Known(key) {
		return true
	}
	switch key {
	case "security", "attack", "order", "plan", "domain":
		return true
	}
	return false
}

func (s *Server) handleSetTelegramMuted(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
		return
	}
	var req struct {
		MutedEvents []string `json:"mutedEvents"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	seen := map[string]bool{}
	muted := []string{}
	for _, key := range req.MutedEvents {
		key = strings.TrimSpace(key)
		if !validMute(key) {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": key + " is not a notice that can be switched off"})
			return
		}
		if !seen[key] {
			seen[key] = true
			muted = append(muted, key)
		}
	}
	u := userFromCtx(r)
	if err := s.database.SetNotifyMuted(u.ID, "telegram", muted); err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "connect your Telegram first"})
		return
	}
	rec, _ := s.database.GetNotifyRecipient(u.ID, "telegram")
	s.writeJSON(w, http.StatusOK, recipientViewOf(rec))
}

func (s *Server) handleUnlinkTelegram(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	if err := s.database.DeleteNotifyRecipient(userFromCtx(r).ID, "telegram"); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

type outboxView struct {
	database.OutboxMessage
	Address  string `json:"address"`
	Username string `json:"username"`
	Text     string `json:"text"`
}

// handleListOutbox shows the newest messages of the queue with what each one said, so a failure can be understood
func (s *Server) handleListOutbox(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	rows, err := s.database.ListOutbox(strings.TrimSpace(r.URL.Query().Get("status")), parseIntQuery(r, "limit", 50))
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	names := map[int64]string{}
	items := make([]outboxView, 0, len(rows))
	for _, row := range rows {
		name, seen := names[row.UserID]
		if !seen {
			if u, _ := s.database.GetUserByID(row.UserID); u != nil {
				name = u.Username
			}
			names[row.UserID] = name
		}
		var data map[string]any
		_ = json.Unmarshal(row.Payload, &data)
		items = append(items, outboxView{OutboxMessage: row, Address: maskAddress(row.Address), Username: name, Text: notify.Render(row.Event, "id", data)})
	}
	pending, failed, _ := s.database.OutboxCounts()
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items, "pending": pending, "failed": failed})
}

func (s *Server) handleRetryOutbox(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	ok, err := s.database.RequeueOutbox(parsePathID(r, "id"))
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "only a failed or cancelled message can be sent again"})
		return
	}
	s.notify.Wake()
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleGetThresholds(w http.ResponseWriter, _ *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"detectors": s.notify.Thresholds(), "defaults": notify.SortedDetectors(notify.DefaultDetectors())})
}

func (s *Server) handleSetThresholds(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
		return
	}
	var req struct {
		Detectors []notify.DetectorConfig `json:"detectors"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := s.notify.SaveThresholds(req.Detectors); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "notify.thresholds.save", "ok", nil)
	}
	s.handleGetThresholds(w, r)
}

func (s *Server) handleResetThresholds(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	if err := s.notify.ResetThresholds(); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "notify.thresholds.reset", "ok", nil)
	}
	s.handleGetThresholds(w, r)
}
