package httpserver

import (
	"encoding/json"
	"net/http"
	"net/mail"
	"regexp"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/ufw"
)

var emailLocalPartRegex = regexp.MustCompile(`^[a-z0-9._+-]{1,64}$`)

func (s *Server) loadEmailConfig() database.EmailServerConfig {
	if s.database == nil || !s.database.IsConnected() {
		return database.DefaultEmailServerConfig()
	}
	cfg, err := s.database.GetEmailServerConfig()
	if err != nil {
		return database.DefaultEmailServerConfig()
	}
	return cfg
}

func (s *Server) buildEmailSettingsResponse(r *http.Request, cfg database.EmailServerConfig) jsonResponse {
	publicCfg := cfg
	publicCfg.SMTPPasswordEnc = ""
	publicCfg.SMTPPasswordSet = cfg.SMTPPasswordEnc != ""

	records := verifyEmailDNSRecords(r.Context(), buildEmailDNSRecords(cfg))
	zones := make([]cloudflareapi.ZoneInfo, 0)
	cfReady := s.publicCloudflareReady()
	if cfReady {
		if client, err := s.publicCloudflare(); err == nil && client != nil {
			if list, err := client.ListZones(); err == nil {
				zones = list
			}
		}
	}

	return jsonResponse{
		"config":          publicCfg,
		"dnsRecords":      records,
		"firewall":        emailFirewallStatus(cfg),
		"cloudflareReady": cfReady,
		"cloudflareZones": zones,
		"addresses":       localAddresses(),
	}
}

func (s *Server) handleGetEmailSettings(w http.ResponseWriter, r *http.Request) {
	cfg := s.loadEmailConfig()
	s.writeJSON(w, http.StatusOK, s.buildEmailSettingsResponse(r, cfg))
}

func (s *Server) handleSaveEmailSettings(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	if !s.requireDatabase(w) {
		return
	}
	var req struct {
		database.EmailServerConfig
		SMTPPassword      string `json:"smtpPassword"`
		ClearSMTPPassword bool   `json:"clearSmtpPassword"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}

	current := s.loadEmailConfig()
	next := req.EmailServerConfig
	next.Method = strings.ToLower(strings.TrimSpace(next.Method))
	if next.Method != "cloudflare" && next.Method != "ip" {
		next.Method = "cloudflare"
	}
	next.Domain = strings.ToLower(strings.TrimSpace(next.Domain))
	next.FromName = strings.TrimSpace(next.FromName)
	next.FromAddress = strings.ToLower(strings.TrimSpace(next.FromAddress))
	next.CFZoneID = strings.TrimSpace(next.CFZoneID)
	next.CFForwardTo = strings.ToLower(strings.TrimSpace(next.CFForwardTo))
	next.CFOutboundRelay = strings.ToLower(strings.TrimSpace(next.CFOutboundRelay))
	if next.CFOutboundRelay != "smtp" && next.CFOutboundRelay != "worker" {
		next.CFOutboundRelay = "smtp"
	}
	next.MailHostname = strings.ToLower(strings.TrimSpace(next.MailHostname))
	next.PublicIP = strings.TrimSpace(next.PublicIP)
	next.SMTPHost = strings.TrimSpace(next.SMTPHost)
	next.TLSMode = strings.ToLower(strings.TrimSpace(next.TLSMode))
	if next.TLSMode != "starttls" && next.TLSMode != "tls" && next.TLSMode != "none" {
		next.TLSMode = "starttls"
	}
	next.SMTPUser = strings.TrimSpace(next.SMTPUser)
	next.DKIMSelector = strings.TrimSpace(next.DKIMSelector)
	if next.DKIMSelector == "" {
		next.DKIMSelector = "default"
	}
	next.DKIMPublicKey = strings.TrimSpace(next.DKIMPublicKey)

	if next.SMTPPort <= 0 || next.SMTPPort > 65535 {
		next.SMTPPort = 25
	}
	if next.SubmissionPort <= 0 || next.SubmissionPort > 65535 {
		next.SubmissionPort = 587
	}
	if next.SMTPSPort <= 0 || next.SMTPSPort > 65535 {
		next.SMTPSPort = 465
	}
	if next.IMAPPort <= 0 || next.IMAPPort > 65535 {
		next.IMAPPort = 993
	}

	if req.ClearSMTPPassword {
		next.SMTPPasswordEnc = ""
	} else if strings.TrimSpace(req.SMTPPassword) != "" {
		if s.cfg.EncryptionKey != "" {
			enc, err := crypto.Encrypt(s.cfg.EncryptionKey, req.SMTPPassword)
			if err != nil {
				s.writeError(w, http.StatusInternalServerError, err)
				return
			}
			next.SMTPPasswordEnc = enc
		} else {
			next.SMTPPasswordEnc = req.SMTPPassword
		}
	} else {
		next.SMTPPasswordEnc = current.SMTPPasswordEnc
	}

	if err := s.database.SaveEmailServerConfig(next); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "settings.email.save", "ok", map[string]any{
			"enabled": next.Enabled,
			"method":  next.Method,
			"domain":  next.Domain,
		})
	}
	s.writeJSON(w, http.StatusOK, s.buildEmailSettingsResponse(r, next))
}

func (s *Server) handleTestEmailSettings(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		To string `json:"to"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req)
	toAddr := strings.TrimSpace(req.To)

	cfg := s.loadEmailConfig()
	if strings.TrimSpace(cfg.Domain) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "isi domain utama email terlebih dahulu lalu simpan pengaturan"})
		return
	}

	if cfg.Method == "cloudflare" && toAddr == "" {
		records := verifyEmailDNSRecords(r.Context(), buildEmailDNSRecords(cfg))
		verifiedCount := 0
		for _, rec := range records {
			if rec.Status == "verified" {
				verifiedCount++
			}
		}
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":      true,
			"method":  "cloudflare",
			"message": "Pemeriksaan DNS Cloudflare selesai",
			"verified": verifiedCount,
			"total":   len(records),
		})
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

	fromAddr := cfg.FromAddress
	if fromAddr == "" {
		fromAddr = "noreply@" + cfg.Domain
	}

	if toAddr != "" {
		if _, err := mail.ParseAddress(toAddr); err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "alamat email tujuan uji tidak valid"})
			return
		}
		err := testOrSendSMTP(
			cfg,
			smtpPass,
			fromAddr,
			toAddr,
			"Reneo Email Server — Pesan Uji",
			"Email uji dari Reneo berhasil dikirim melalui metode "+strings.ToUpper(cfg.Method)+" pada domain "+cfg.Domain+".",
			false,
		)
		if err != nil {
			s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
			return
		}
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "sentTo": toAddr})
		return
	}

	if err := testOrSendSMTP(cfg, smtpPass, fromAddr, fromAddr, "", "", true); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleSyncEmailDNS(w http.ResponseWriter, r *http.Request) {
	cfg := s.loadEmailConfig()
	if strings.TrimSpace(cfg.Domain) == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "isi dan simpan domain email terlebih dahulu"})
		return
	}
	client, err := s.publicCloudflare()
	if err != nil || client == nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "token Cloudflare superadmin belum terpasang"})
		return
	}
	zones, err := client.ListZones()
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "Cloudflare tidak merespons: " + err.Error()})
		return
	}
	var targetZoneID string
	if cfg.CFZoneID != "" {
		targetZoneID = cfg.CFZoneID
	} else if z := zoneFor(cfg.Domain, zones); z != nil {
		targetZoneID = z.ID
	}
	if targetZoneID == "" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "domain " + cfg.Domain + " tidak ditemukan di akun Cloudflare Anda"})
		return
	}

	records := buildEmailDNSRecords(cfg)
	existing, err := client.ListDNSRecords(targetZoneID)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": "gagal membaca DNS Cloudflare: " + err.Error()})
		return
	}

	created := 0
	skipped := 0
	for _, want := range records {
		if strings.Contains(want.Content, "IP_PUBLIK_SERVER") || strings.Contains(want.Content, "ISI_PUBLIC_KEY_DKIM") {
			skipped++
			continue
		}
		already := false
		for _, ex := range existing {
			if strings.EqualFold(ex.Type, want.Type) &&
				strings.EqualFold(strings.TrimSuffix(ex.Name, "."), strings.TrimSuffix(want.Name, ".")) &&
				strings.EqualFold(strings.TrimSuffix(ex.Content, "."), strings.TrimSuffix(want.Content, ".")) {
				already = true
				break
			}
		}
		if already {
			skipped++
			continue
		}
		payload := cloudflareapi.DNSRecordPayload{
			Type:    want.Type,
			Name:    want.Name,
			Content: want.Content,
			TTL:     1,
			Proxied: false,
			Comment: "Reneo Email Server (" + cfg.Method + ")",
		}
		if want.Priority > 0 {
			prio := want.Priority
			payload.Priority = &prio
		}
		if _, err := client.CreateDNSRecord(targetZoneID, payload); err == nil {
			created++
		}
	}

	verified := verifyEmailDNSRecords(r.Context(), records)
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":         true,
		"created":    created,
		"skipped":    skipped,
		"dnsRecords": verified,
	})
}

func (s *Server) handleOpenEmailFirewallPorts(w http.ResponseWriter, r *http.Request) {
	cfg := s.loadEmailConfig()
	ports := emailServerPorts(cfg)
	if err := ufw.Allow(ports, "Reneo mail server"); err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "settings.email.firewall", "ok", map[string]any{"ports": ports})
	}
	s.writeJSON(w, http.StatusOK, emailFirewallStatus(cfg))
}

func (s *Server) handleEmailOverview(w http.ResponseWriter, r *http.Request) {
	cfg := s.loadEmailConfig()
	user := userFromCtx(r)
	var scopeUserID int64
	if user != nil && user.Role != auth.SuperadminRole && user.Role != auth.AdminRole {
		scopeUserID = user.ID
	}
	accounts := []database.EmailAccount{}
	if s.database != nil && s.database.IsConnected() {
		if list, err := s.database.ListEmailAccounts(scopeUserID); err == nil {
			accounts = list
		}
	}
	activeCount, mailboxCount, forwardCount := 0, 0, 0
	for _, a := range accounts {
		if a.Enabled {
			activeCount++
		}
		if a.Mode == "forward" {
			forwardCount++
		} else {
			mailboxCount++
		}
	}
	records := verifyEmailDNSRecords(r.Context(), buildEmailDNSRecords(cfg))
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"enabled":        cfg.Enabled,
		"method":         cfg.Method,
		"domain":         cfg.Domain,
		"fromName":       cfg.FromName,
		"fromAddress":    cfg.FromAddress,
		"cfCatchAll":     cfg.CFCatchAll,
		"cfForwardTo":    cfg.CFForwardTo,
		"mailHostname":   cfg.MailHostname,
		"publicIp":       cfg.PublicIP,
		"smtpHost":       cfg.SMTPHost,
		"smtpPort":       cfg.SMTPPort,
		"submissionPort": cfg.SubmissionPort,
		"smtpsPort":      cfg.SMTPSPort,
		"imapPort":       cfg.IMAPPort,
		"tlsMode":        cfg.TLSMode,
		"dnsRecords":     records,
		"accountCount":   len(accounts),
		"activeCount":    activeCount,
		"mailboxCount":   mailboxCount,
		"forwardCount":   forwardCount,
	})
}

