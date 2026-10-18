package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// WhatsApp Cloud (the official API of Meta): the superadmin saves the token and the ids, makes the templates, and
// sets the number that gets the notices of the seller.

func (s *Server) handleSaveCloudChannel(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
		return
	}
	var req struct {
		Enabled     bool    `json:"enabled"`
		AccessToken *string `json:"accessToken"`
		PhoneID     string  `json:"phoneId"`
		WABAID      string  `json:"wabaId"`
		Version     string  `json:"version"`
		AppSecret   *string `json:"appSecret"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if req.AccessToken != nil {
		token := strings.TrimSpace(*req.AccessToken)
		if token == "" {
			req.AccessToken = nil
		} else {
			req.AccessToken = &token
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	err := s.notify.ConfigureWhatsAppCloud(ctx, notify.CloudSettings{
		Token: req.AccessToken, PhoneID: req.PhoneID, WABAID: req.WABAID, Version: strings.TrimSpace(req.Version), Enabled: req.Enabled,
		AppSecret: req.AppSecret,
	})
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "notify.channel.whatsapp_cloud", "ok", map[string]any{"enabled": req.Enabled, "tokenChanged": req.AccessToken != nil})
	}
	s.handleNotifyOverview(w, r)
}

func (s *Server) handleCloudTemplates(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	states, err := s.notify.CloudTemplateStates(ctx)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"templates": states})
}

func (s *Server) handleCreateCloudTemplates(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	created, err := s.notify.CreateCloudTemplates(ctx)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error(), "created": created})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"created": created})
}

// handleSetCloudNumber saves the number of the seller for WhatsApp Cloud
func (s *Server) handleSetCloudNumber(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
		return
	}
	var req struct {
		Number string `json:"number"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	u := userFromCtx(r)
	if err := s.notify.SetCloudNumber(u.ID, req.Number); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	rec, _ := s.database.GetNotifyRecipient(u.ID, "whatsapp_cloud")
	s.writeJSON(w, http.StatusOK, recipientViewOf(rec))
}

func (s *Server) handleDeleteCloudNumber(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	if err := s.database.DeleteNotifyRecipient(userFromCtx(r).ID, "whatsapp_cloud"); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleSetCloudMuted(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
		return
	}
	muted, ok := s.readMutedEvents(w, r)
	if !ok {
		return
	}
	u := userFromCtx(r)
	if err := s.database.SetNotifyMuted(u.ID, "whatsapp_cloud", muted); err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "save the number first"})
		return
	}
	rec, _ := s.database.GetNotifyRecipient(u.ID, "whatsapp_cloud")
	s.writeJSON(w, http.StatusOK, recipientViewOf(rec))
}

func (s *Server) handleTestCloud(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	ch, _ := s.notify.Channel("whatsapp_cloud")
	if ch == nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "switch WhatsApp Cloud on first"})
		return
	}
	id, err := s.notify.SendTestVia(userFromCtx(r).ID, "whatsapp_cloud")
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusAccepted, jsonResponse{"id": id})
}

// ─── Webhooks: what Meta and WAHA send back ───────────────────────────────────

// webhookAllowed limits the webhook routes per address: they are open to the internet, and their only protection is
// the signature, so a flood of unsigned requests is refused before it costs anything
func (s *Server) webhookAllowed(w http.ResponseWriter, r *http.Request, name string) bool {
	if allowed, _ := s.allowRateLimit(name+":"+clientIP(r), rateLimitRule{Window: time.Minute, Limit: 300}); !allowed {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many requests"})
		return false
	}
	return true
}

// handleCloudWebhookVerify answers the check Meta makes when the webhook address is saved in the app
func (s *Server) handleCloudWebhookVerify(w http.ResponseWriter, r *http.Request) {
	if s.notify == nil || !s.webhookAllowed(w, r, "cloud-hook") {
		return
	}
	q := r.URL.Query()
	if q.Get("hub.mode") != "subscribe" || !s.notify.VerifyCloudWebhook(q.Get("hub.verify_token")) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "forbidden"})
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	_, _ = w.Write([]byte(q.Get("hub.challenge")))
}

// handleCloudWebhook takes what Meta sends: statuses of messages, and answers from people
func (s *Server) handleCloudWebhook(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if s.notify == nil || !s.webhookAllowed(w, r, "cloud-hook") {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "unreadable body"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := s.notify.HandleCloudWebhook(ctx, body, r.Header.Get("X-Hub-Signature-256")); err != nil {
		if errors.Is(err, notify.ErrBadSignature) {
			s.notify.WebhookRejected(clientIP(r))
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "bad signature"})
			return
		}
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// handleWahaWebhook takes what the WAHA container sends: answers from people to the notices
func (s *Server) handleWahaWebhook(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if s.notify == nil || !s.webhookAllowed(w, r, "waha-hook") {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "unreadable body"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := s.notify.HandleWahaWebhook(ctx, body, r.Header.Get("X-Webhook-Hmac")); err != nil {
		if errors.Is(err, notify.ErrBadSignature) {
			s.notify.WebhookRejected(clientIP(r))
			s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "bad signature"})
			return
		}
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}
