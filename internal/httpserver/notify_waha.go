package httpserver

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// WhatsApp through the WAHA container: the superadmin switches the runtime on, and every account (except the demo)
// connects its own phone to a session of it.

func (s *Server) handleWahaStatus(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	view, err := s.notify.WahaStatus(ctx)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, view)
}

// handleSetWaha switches the runtime on (the image is pulled in the background; the page reads the state) or off
func (s *Server) handleSetWaha(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.notifyReady(w) {
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	var err error
	if req.Enabled {
		err = s.notify.EnableWaha()
	} else {
		err = s.notify.DisableWaha(ctx)
	}
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	if actor := userFromCtx(r); actor != nil {
		s.auditSensitiveAction(r, actor, "notify.channel.waha", "ok", map[string]any{"enabled": req.Enabled})
	}
	s.handleWahaStatus(w, r)
}

func (s *Server) handleRestartWaha(w http.ResponseWriter, r *http.Request) {
	if !s.notifyReady(w) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	if err := s.notify.RestartWaha(ctx); err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	s.handleWahaStatus(w, r)
}

type whatsappView struct {
	notify.WhatsAppState
	Recipient recipientView `json:"recipient"`
	// DestinationIsSession: the notices go to the number of the session itself, which makes no sound on the phone
	DestinationIsSession bool `json:"destinationIsSession"`
	// ViaServer: the notices go to a verified number from the WhatsApp of the server, there is no session of the account
	ViaServer bool `json:"viaServer"`
}

// whatsappFor is the session of the account and where its notices go; the number is shown masked
func (s *Server) whatsappFor(userID int64, state notify.WhatsAppState) whatsappView {
	rec, _ := s.database.GetNotifyRecipient(userID, "waha")
	same := rec != nil && rec.Address != "" && rec.Address == state.Phone
	state.Phone = maskAddress(state.Phone)
	return whatsappView{WhatsAppState: state, Recipient: recipientViewOf(rec), DestinationIsSession: same, ViaServer: rec != nil && rec.ViaServer}
}

// whatsappAllowed refuses the demo account: a session belongs to a real phone
func (s *Server) whatsappAllowed(w http.ResponseWriter, r *http.Request) bool {
	if !s.notifyReady(w) {
		return false
	}
	if s.isDemoUser(userFromCtx(r)) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "the demo account cannot connect WhatsApp"})
		return false
	}
	return true
}

func (s *Server) handleMyWhatsApp(w http.ResponseWriter, r *http.Request) {
	if !s.whatsappAllowed(w, r) {
		return
	}
	u := userFromCtx(r)
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	state, err := s.notify.WhatsAppStatus(ctx, u.ID)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, s.whatsappFor(u.ID, state))
}

func (s *Server) handleConnectWhatsApp(w http.ResponseWriter, r *http.Request) {
	if !s.whatsappAllowed(w, r) {
		return
	}
	u := userFromCtx(r)
	// scanning a phone of the account's own is for the plans that bring their own channels (and for the superadmin, who is the sender)
	if session, _ := s.database.GetWhatsAppSession(u.ID); session == nil && u.Role != auth.SuperadminRole {
		if own, _ := s.database.OwnNotifyAllowed(u.ID); !own {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "your plan gets its notices from the WhatsApp of the server: verify your number instead of scanning a phone"})
			return
		}
	}
	if allowed, _ := s.allowRateLimit("wa-connect:"+u.Username, rateLimitRule{Window: time.Minute, Limit: 10}); !allowed {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many attempts, wait a moment"})
		return
	}
	// WAHA answers a new session only after it has tried to reach WhatsApp, which takes a while when the network is slow
	ctx, cancel := context.WithTimeout(r.Context(), 70*time.Second)
	defer cancel()
	state, err := s.notify.ConnectWhatsApp(ctx, u.ID, strings.ToLower(string(u.Role)), u.Username)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, s.whatsappFor(u.ID, state))
}

// handleWhatsAppQR gives the image to scan, and only to the account that owns the session: the name never comes from the client
func (s *Server) handleWhatsAppQR(w http.ResponseWriter, r *http.Request) {
	if !s.whatsappAllowed(w, r) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	img, ctype, err := s.notify.WhatsAppQR(ctx, userFromCtx(r).ID)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(img)
}

func (s *Server) handleDisconnectWhatsApp(w http.ResponseWriter, r *http.Request) {
	if !s.whatsappAllowed(w, r) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := s.notify.DisconnectWhatsApp(ctx, userFromCtx(r).ID); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleSetWhatsAppMuted(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.whatsappAllowed(w, r) {
		return
	}
	muted, ok := s.readMutedEvents(w, r)
	if !ok {
		return
	}
	u := userFromCtx(r)
	if err := s.database.SetNotifyMuted(u.ID, "waha", muted); err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "connect your WhatsApp first"})
		return
	}
	rec, _ := s.database.GetNotifyRecipient(u.ID, "waha")
	s.writeJSON(w, http.StatusOK, recipientViewOf(rec))
}

// handleTestWhatsApp queues a test message to the account's own WhatsApp, through the same queue as everything else
func (s *Server) handleTestWhatsApp(w http.ResponseWriter, r *http.Request) {
	if !s.whatsappAllowed(w, r) {
		return
	}
	id, err := s.notify.SendTestVia(userFromCtx(r).ID, "waha")
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusAccepted, jsonResponse{"id": id})
}

// forgetUserWhatsApp removes the WAHA session of an account that is being deleted; a failure is logged and the deletion goes on
func (s *Server) forgetUserWhatsApp(userID int64) {
	if s.notify == nil || s.database == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := s.notify.DisconnectWhatsApp(ctx, userID); err != nil {
		log.Printf("[notify] the WhatsApp session of account %d was not removed from WAHA: %v", userID, err)
	}
}

// handleRestartWhatsApp starts the session of the account over: a session that works is restarted and keeps the phone, any
// other is made again with a new code
func (s *Server) handleRestartWhatsApp(w http.ResponseWriter, r *http.Request) {
	if !s.whatsappAllowed(w, r) {
		return
	}
	u := userFromCtx(r)
	if allowed, _ := s.allowRateLimit("wa-restart:"+u.Username, rateLimitRule{Window: time.Minute, Limit: 10}); !allowed {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many attempts, wait a moment"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	state, err := s.notify.RestartWhatsApp(ctx, u.ID)
	if err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, s.whatsappFor(u.ID, state))
}

// handleSetWhatsAppDestination chooses the number the notices of the account are sent to; empty goes back to the session's own
func (s *Server) handleSetWhatsAppDestination(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.whatsappAllowed(w, r) {
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
	if allowed, _ := s.allowRateLimit("wa-dest:"+u.Username, rateLimitRule{Window: time.Minute, Limit: 10}); !allowed {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many attempts, wait a moment"})
		return
	}
	if err := s.notify.SetWhatsAppDestination(u.ID, req.Number); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	state, err := s.notify.WhatsAppStatus(ctx, u.ID)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "notify.waha.destination", "ok", map[string]any{"toSession": strings.TrimSpace(req.Number) == ""})
	s.writeJSON(w, http.StatusOK, s.whatsappFor(u.ID, state))
}
