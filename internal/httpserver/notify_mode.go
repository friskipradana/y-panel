package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/notify"
)

// How an account gets its notices depends on its plan: a plan that brings its own channels lets the account use its own
// Telegram bot and scan its own WhatsApp; any other follows the server, linking a chat to the bot of the seller and
// proving a WhatsApp number with a code sent from the WhatsApp of the seller.

func (s *Server) handleMyNotifyMode(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	if u == nil || !s.notifyReady(w) {
		return
	}
	own := u.Role == auth.SuperadminRole
	if !own {
		own, _ = s.database.OwnNotifyAllowed(u.ID)
	}
	telegram := false
	if row, err := s.database.GetNotifyChannel("telegram"); err == nil && row != nil && row.Enabled {
		telegram = true
	}
	rec, _ := s.database.GetNotifyRecipient(u.ID, "waha")
	session, _ := s.database.GetWhatsAppSession(u.ID)
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"own":               own,
		"serverTelegram":    telegram,
		"serverWhatsApp":    s.notify.BuyerWhatsAppReady(),
		"whatsappViaServer": rec != nil && rec.ViaServer,
		"hasSession":        session != nil,
	})
}

// verificationFailure turns a reason the account can act on into an answer it can read; anything else is a fault
func (s *Server) verificationFailure(w http.ResponseWriter, err error) {
	var reason *notify.ErrVerification
	if errors.As(err, &reason) {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": reason.Message})
		return
	}
	s.writeError(w, http.StatusBadGateway, err)
}

func (s *Server) handleStartWhatsAppVerify(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.whatsappAllowed(w, r) {
		return
	}
	u := userFromCtx(r)
	if allowed, _ := s.allowRateLimit("wa-verify:"+u.Username, rateLimitRule{Window: time.Hour, Limit: 12}); !allowed {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many attempts, wait a while"})
		return
	}
	var req struct {
		Number   string `json:"number"`
		Language string `json:"language"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	phone, expires, err := s.notify.StartWhatsAppVerification(ctx, u.ID, req.Number, req.Language)
	if err != nil {
		s.verificationFailure(w, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"sentTo": maskAddress(phone), "expiresAt": expires})
}

func (s *Server) handleConfirmWhatsAppVerify(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.whatsappAllowed(w, r) {
		return
	}
	u := userFromCtx(r)
	if allowed, _ := s.allowRateLimit("wa-confirm:"+u.Username, rateLimitRule{Window: time.Minute, Limit: 10}); !allowed {
		s.writeJSON(w, http.StatusTooManyRequests, jsonResponse{"error": "too many attempts, wait a moment"})
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	if err := s.notify.ConfirmWhatsAppVerification(u.ID, req.Code); err != nil {
		s.verificationFailure(w, err)
		return
	}
	s.auditSensitiveAction(r, u, "notify.whatsapp.verify", "ok", nil)
	rec, _ := s.database.GetNotifyRecipient(u.ID, "waha")
	s.writeJSON(w, http.StatusOK, jsonResponse{"recipient": recipientViewOf(rec)})
}
