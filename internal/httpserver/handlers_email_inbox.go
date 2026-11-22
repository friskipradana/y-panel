package httpserver

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func (s *Server) handleListInboxMessages(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}

	q := r.URL.Query()
	filter := database.EmailMessageFilter{
		Direction:  strings.TrimSpace(q.Get("direction")),
		Query:      strings.TrimSpace(q.Get("q")),
		UnreadOnly: q.Get("unread") == "true",
		Limit:      50,
		Offset:     0,
	}
	if limitStr := q.Get("limit"); limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			filter.Limit = n
		}
	}
	if offsetStr := q.Get("offset"); offsetStr != "" {
		if n, err := strconv.Atoi(offsetStr); err == nil && n >= 0 {
			filter.Offset = n
		}
	}

	items, total, err := s.database.ListEmailMessages(filter)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	// If empty and no filter, seed an introductory welcome message so the inbox isn't blank
	if total == 0 && filter.Query == "" && !filter.UnreadOnly && filter.Direction == "" {
		cfg := s.loadEmailConfig()
		domain := cfg.Domain
		if domain == "" {
			domain = "reneo.my.id"
		}
		welcomeMsg := database.EmailMessage{
			Direction:  "inbound",
			FromAddr:   "system@" + domain,
			FromName:   "Reneo Server Control Panel",
			ToAddr:     "admin@" + domain,
			Subject:    "Selamat Datang di Kotak Masuk Reneo Mail",
			Snippet:    "Email server Reneo Anda telah aktif dan siap digunakan. Anda dapat memantau pesan masuk dan membalasnya langsung dari jendela ini.",
			BodyText:   "Halo,\n\nSelamat! Layanan email server Reneo Anda telah berhasil dikonfigurasi dan aktif.\n\nDengan jendela Email Reneo ini, Anda dapat:\n1. Membaca pesan email yang masuk ke domain server Anda.\n2. Membalas pesan secara langsung dengan mengklik tombol 'Balas'.\n3. Melakukan sinkronisasi otomatis menggunakan IMAP dari relay Gmail atau server lokal.\n\nJika Anda menggunakan perutean Cloudflare, pesan juga otomatis diteruskan ke kotak masuk utama Anda.\n\nSalam hangat,\nTim Pengembang Reneo",
			IsRead:     false,
			IsStarred:  true,
			ReceivedAt: time.Now(),
		}
		if inserted, err := s.database.InsertEmailMessage(welcomeMsg); err == nil && inserted != nil {
			items = []database.EmailMessage{*inserted}
			total = 1
		}
	}

	unreadCount := 0
	for _, it := range items {
		if !it.IsRead {
			unreadCount++
		}
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"items":  items,
		"total":  total,
		"unread": unreadCount,
	})
}

func (s *Server) handleGetInboxMessage(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	idStr := strings.TrimPrefix(r.URL.Path, "/api/v1/email/inbox/")
	idStr = strings.TrimSuffix(idStr, "/read")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID pesan tidak valid"})
		return
	}

	msg, err := s.database.GetEmailMessage(id)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if msg == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "pesan tidak ditemukan"})
		return
	}

	// Auto mark as read when fetching detail
	if !msg.IsRead {
		_ = s.database.MarkEmailMessageRead(id, true)
		msg.IsRead = true
	}

	s.writeJSON(w, http.StatusOK, msg)
}

func (s *Server) handleMarkInboxMessageRead(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireDatabase(w) {
		return
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "URL tidak valid"})
		return
	}
	id, err := strconv.ParseInt(parts[3], 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID pesan tidak valid"})
		return
	}

	var req struct {
		IsRead bool `json:"isRead"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 2<<10)).Decode(&req)

	if err := s.database.MarkEmailMessageRead(id, req.IsRead); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "id": id, "isRead": req.IsRead})
}

func (s *Server) handleDeleteInboxMessage(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	idStr := strings.TrimPrefix(r.URL.Path, "/api/v1/email/inbox/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "ID pesan tidak valid"})
		return
	}

	if err := s.database.DeleteEmailMessage(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "id": id})
}

func (s *Server) handleSyncInbox(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	count, err := s.syncIMAPInbox(20)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{
			"error": "Sinkronisasi IMAP gagal: " + err.Error(),
		})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":     true,
		"synced": count,
	})
}

