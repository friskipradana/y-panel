package httpserver

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

func (s *Server) handleListEmailAccounts(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	user := userFromCtx(r)
	var scopeUserID int64
	if user != nil && user.Role != auth.SuperadminRole && user.Role != auth.AdminRole {
		scopeUserID = user.ID
	}
	items, err := s.database.ListEmailAccounts(scopeUserID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"items": items})
}

func (s *Server) handleCreateEmailAccount(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireDatabase(w) {
		return
	}
	user := userFromCtx(r)
	if user == nil || user.Role == "demo" {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akun demo tidak dapat membuat alamat email"})
		return
	}
	var req struct {
		LocalPart   string `json:"localPart"`
		Domain      string `json:"domain"`
		DisplayName string `json:"displayName"`
		Mode        string `json:"mode"`
		ForwardTo   string `json:"forwardTo"`
		Password    string `json:"password"`
		QuotaMB     int    `json:"quotaMb"`
		Enabled     *bool  `json:"enabled"`
		Note        string `json:"note"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	cfg := s.loadEmailConfig()
	localPart := strings.ToLower(strings.TrimSpace(req.LocalPart))
	if !emailLocalPartRegex.MatchString(localPart) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "nama pengguna email (sebelum @) hanya boleh berisi huruf kecil, angka, titik, strip, atau plus"})
		return
	}
	domain := strings.ToLower(strings.TrimSpace(req.Domain))
	if domain == "" {
		domain = strings.ToLower(strings.TrimSpace(cfg.Domain))
	}
	if domain == "" || !strings.Contains(domain, ".") {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "domain email belum diatur; atur domain di Pengaturan > Email Server terlebih dahulu"})
		return
	}
	mode := strings.ToLower(strings.TrimSpace(req.Mode))
	if mode != "mailbox" && mode != "forward" {
		mode = "mailbox"
	}
	forwardTo := strings.ToLower(strings.TrimSpace(req.ForwardTo))
	if mode == "forward" {
		if _, err := mail.ParseAddress(forwardTo); err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "alamat email tujuan penerusan tidak valid"})
			return
		}
	}
	quotaMB := req.QuotaMB
	if quotaMB <= 0 {
		quotaMB = 1024
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	passEnc := ""
	if strings.TrimSpace(req.Password) != "" {
		if s.cfg.EncryptionKey != "" {
			if enc, err := crypto.Encrypt(s.cfg.EncryptionKey, req.Password); err == nil {
				passEnc = enc
			}
		} else {
			passEnc = req.Password
		}
	}

	created, err := s.database.CreateEmailAccount(database.EmailAccount{
		UserID:      user.ID,
		LocalPart:   localPart,
		Domain:      domain,
		Address:     localPart + "@" + domain,
		DisplayName: strings.TrimSpace(req.DisplayName),
		Mode:        mode,
		ForwardTo:   forwardTo,
		QuotaMB:     quotaMB,
		Enabled:     enabled,
		Note:        strings.TrimSpace(req.Note),
	}, passEnc)
	if err != nil {
		if errors.Is(err, database.ErrEmailAddressTaken) {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "alamat email tersebut sudah terdaftar"})
			return
		}
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateEmailAccount(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireDatabase(w) {
		return
	}
	user := userFromCtx(r)
	if user == nil || user.Role == "demo" {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akun demo tidak dapat mengubah alamat email"})
		return
	}
	id := parsePathID(r, "id")
	existing, err := s.database.GetEmailAccount(id)
	if err != nil || existing == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "alamat email tidak ditemukan"})
		return
	}
	if user.Role != auth.SuperadminRole && user.Role != auth.AdminRole && existing.UserID != user.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "tidak diizinkan mengubah alamat email akun lain"})
		return
	}

	var req struct {
		DisplayName *string `json:"displayName"`
		Mode        *string `json:"mode"`
		ForwardTo   *string `json:"forwardTo"`
		Password    *string `json:"password"`
		QuotaMB     *int    `json:"quotaMb"`
		Enabled     *bool   `json:"enabled"`
		Note        *string `json:"note"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}

	displayName := existing.DisplayName
	if req.DisplayName != nil {
		displayName = strings.TrimSpace(*req.DisplayName)
	}
	mode := existing.Mode
	if req.Mode != nil {
		m := strings.ToLower(strings.TrimSpace(*req.Mode))
		if m == "mailbox" || m == "forward" {
			mode = m
		}
	}
	forwardTo := existing.ForwardTo
	if req.ForwardTo != nil {
		forwardTo = strings.ToLower(strings.TrimSpace(*req.ForwardTo))
	}
	if mode == "forward" {
		if _, err := mail.ParseAddress(forwardTo); err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "alamat email tujuan penerusan tidak valid"})
			return
		}
	}
	quotaMB := existing.QuotaMB
	if req.QuotaMB != nil && *req.QuotaMB > 0 {
		quotaMB = *req.QuotaMB
	}
	enabled := existing.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	note := existing.Note
	if req.Note != nil {
		note = strings.TrimSpace(*req.Note)
	}

	var passEncPtr *string
	if req.Password != nil && strings.TrimSpace(*req.Password) != "" {
		rawPass := strings.TrimSpace(*req.Password)
		encVal := rawPass
		if s.cfg.EncryptionKey != "" {
			if enc, err := crypto.Encrypt(s.cfg.EncryptionKey, rawPass); err == nil {
				encVal = enc
			}
		}
		passEncPtr = &encVal
	}

	updated, err := s.database.UpdateEmailAccount(id, displayName, mode, forwardTo, quotaMB, enabled, note, passEncPtr)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteEmailAccount(w http.ResponseWriter, r *http.Request) {
	if !s.requireDatabase(w) {
		return
	}
	user := userFromCtx(r)
	if user == nil || user.Role == "demo" {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akun demo tidak dapat menghapus alamat email"})
		return
	}
	id := parsePathID(r, "id")
	existing, err := s.database.GetEmailAccount(id)
	if err != nil || existing == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "alamat email tidak ditemukan"})
		return
	}
	if user.Role != auth.SuperadminRole && user.Role != auth.AdminRole && existing.UserID != user.ID {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "tidak diizinkan menghapus alamat email akun lain"})
		return
	}
	if err := s.database.DeleteEmailAccount(id); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleSendEmail(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	user := userFromCtx(r)
	if user == nil || user.Role == "demo" {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "akun demo tidak dapat mengirim email"})
		return
	}
	cfg := s.loadEmailConfig()
	if !cfg.Enabled {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "Email Server belum diaktifkan di Pengaturan > Email Server"})
		return
	}
	var req struct {
		From    string `json:"from"`
		To      string `json:"to"`
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	fromAddr := strings.ToLower(strings.TrimSpace(req.From))
	if fromAddr == "" {
		fromAddr = cfg.FromAddress
	}
	if fromAddr == "" && cfg.Domain != "" {
		fromAddr = "noreply@" + cfg.Domain
	}
	toAddr := strings.TrimSpace(req.To)
	if _, err := mail.ParseAddress(toAddr); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "alamat email tujuan tidak valid"})
		return
	}
	subject := strings.TrimSpace(req.Subject)
	if subject == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "subjek email wajib diisi"})
		return
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "isi pesan email wajib diisi"})
		return
	}

	smtpPass := ""
	if cfg.SMTPPasswordEnc != "" {
		if s.cfg.EncryptionKey != "" {
			if dec, err := crypto.Decrypt(s.cfg.EncryptionKey, cfg.SMTPPasswordEnc); err == nil {
				smtpPass = dec
			}
		} else {
			smtpPass = cfg.SMTPPasswordEnc
		}
	}

	if err := testOrSendSMTP(cfg, smtpPass, fromAddr, toAddr, subject, body, false); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "sentTo": toAddr})
}
