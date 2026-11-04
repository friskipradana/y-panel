package httpserver

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/system"
	"github.com/friskipradana/panel-desktop-ui/internal/ufw"
)

type emailDNSRecord struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Content  string `json:"content"`
	Priority int    `json:"priority,omitempty"`
	Purpose  string `json:"purpose"`
	Status   string `json:"status"` // "verified" | "missing" | "pending"
	Found    string `json:"found,omitempty"`
}

func emailServerPorts(cfg database.EmailServerConfig) []int {
	candidates := []int{cfg.SMTPPort, cfg.SubmissionPort, cfg.SMTPSPort, cfg.IMAPPort}
	seen := map[int]bool{}
	out := make([]int, 0, 4)
	for _, p := range candidates {
		if p > 0 && p <= 65535 && !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []int{25, 587, 465, 993}
	}
	return out
}

func emailFirewallStatus(cfg database.EmailServerConfig) jsonResponse {
	ports := emailServerPorts(cfg)
	st := ufw.Check(ports)
	list := make([]jsonResponse, 0, len(ports))
	for _, p := range ports {
		list = append(list, jsonResponse{"port": p, "open": st.Open[p]})
	}
	return jsonResponse{
		"installed": st.Installed,
		"active":    st.Active,
		"ports":     list,
	}
}

func buildEmailDNSRecords(cfg database.EmailServerConfig) []emailDNSRecord {
	domain := strings.TrimSpace(strings.ToLower(cfg.Domain))
	if domain == "" {
		return []emailDNSRecord{}
	}
	dmarcHost := "_dmarc." + domain
	dmarcVal := fmt.Sprintf("v=DMARC1; p=quarantine; rua=mailto:postmaster@%s", domain)

	if cfg.Method == "cloudflare" {
		return []emailDNSRecord{
			{Type: "MX", Name: domain, Content: "route1.mx.cloudflare.net", Priority: 69, Purpose: "Cloudflare Email Routing MX 1", Status: "pending"},
			{Type: "MX", Name: domain, Content: "route2.mx.cloudflare.net", Priority: 99, Purpose: "Cloudflare Email Routing MX 2", Status: "pending"},
			{Type: "MX", Name: domain, Content: "route3.mx.cloudflare.net", Priority: 40, Purpose: "Cloudflare Email Routing MX 3", Status: "pending"},
			{Type: "TXT", Name: domain, Content: "v=spf1 include:_spf.mx.cloudflare.net ~all", Purpose: "SPF Cloudflare Email", Status: "pending"},
			{Type: "TXT", Name: dmarcHost, Content: dmarcVal, Purpose: "DMARC Policy", Status: "pending"},
		}
	}

	mailHost := strings.TrimSpace(strings.ToLower(cfg.MailHostname))
	if mailHost == "" {
		mailHost = "mail." + domain
	}
	pubIP := strings.TrimSpace(cfg.PublicIP)
	spf := "v=spf1 mx a ~all"
	if pubIP != "" {
		spf = fmt.Sprintf("v=spf1 mx a ip4:%s ~all", pubIP)
	}
	records := []emailDNSRecord{}
	if pubIP != "" {
		records = append(records, emailDNSRecord{
			Type:    "A",
			Name:    mailHost,
			Content: pubIP,
			Purpose: "Host IP Mail Server",
			Status:  "pending",
		})
	} else {
		records = append(records, emailDNSRecord{
			Type:    "A",
			Name:    mailHost,
			Content: "IP_PUBLIK_SERVER",
			Purpose: "Host IP Mail Server",
			Status:  "pending",
		})
	}
	records = append(records,
		emailDNSRecord{Type: "MX", Name: domain, Content: mailHost, Priority: 10, Purpose: "Mail Exchange (MX)", Status: "pending"},
		emailDNSRecord{Type: "TXT", Name: domain, Content: spf, Purpose: "SPF Otorisasi IP", Status: "pending"},
	)
	selector := strings.TrimSpace(cfg.DKIMSelector)
	if selector == "" {
		selector = "default"
	}
	dkimKey := strings.TrimSpace(cfg.DKIMPublicKey)
	dkimVal := "v=DKIM1; k=rsa; p=" + dkimKey
	if dkimKey == "" {
		dkimVal = "v=DKIM1; k=rsa; p=ISI_PUBLIC_KEY_DKIM"
	}
	records = append(records,
		emailDNSRecord{Type: "TXT", Name: selector + "._domainkey." + domain, Content: dkimVal, Purpose: "DKIM Signature", Status: "pending"},
		emailDNSRecord{Type: "TXT", Name: dmarcHost, Content: dmarcVal, Purpose: "DMARC Policy", Status: "pending"},
	)
	return records
}

var publicDNSResolver = &net.Resolver{
	PreferGo: true,
	Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
		d := net.Dialer{Timeout: 3 * time.Second}
		return d.DialContext(ctx, "udp", "1.1.1.1:53")
	},
}

var googleDNSResolver = &net.Resolver{
	PreferGo: true,
	Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
		d := net.Dialer{Timeout: 3 * time.Second}
		return d.DialContext(ctx, "udp", "8.8.8.8:53")
	},
}

func lookupTXTWithFallback(parent context.Context, name string) ([]string, error) {
	ctx, cancel := context.WithTimeout(parent, 3*time.Second)
	defer cancel()

	res, err := net.DefaultResolver.LookupTXT(ctx, name)
	if err == nil && len(res) > 0 {
		return res, nil
	}

	ctx2, cancel2 := context.WithTimeout(parent, 3*time.Second)
	defer cancel2()
	if cfRes, cfErr := publicDNSResolver.LookupTXT(ctx2, name); cfErr == nil && len(cfRes) > 0 {
		return cfRes, nil
	}

	ctx3, cancel3 := context.WithTimeout(parent, 3*time.Second)
	defer cancel3()
	if gRes, gErr := googleDNSResolver.LookupTXT(ctx3, name); gErr == nil && len(gRes) > 0 {
		return gRes, nil
	}

	return res, err
}

func lookupMXWithFallback(parent context.Context, name string) ([]*net.MX, error) {
	ctx, cancel := context.WithTimeout(parent, 3*time.Second)
	defer cancel()

	res, err := net.DefaultResolver.LookupMX(ctx, name)
	if err == nil && len(res) > 0 {
		return res, nil
	}

	ctx2, cancel2 := context.WithTimeout(parent, 3*time.Second)
	defer cancel2()
	if cfRes, cfErr := publicDNSResolver.LookupMX(ctx2, name); cfErr == nil && len(cfRes) > 0 {
		return cfRes, nil
	}

	ctx3, cancel3 := context.WithTimeout(parent, 3*time.Second)
	defer cancel3()
	if gRes, gErr := googleDNSResolver.LookupMX(ctx3, name); gErr == nil && len(gRes) > 0 {
		return gRes, nil
	}

	return res, err
}

func lookupHostWithFallback(parent context.Context, name string) ([]string, error) {
	ctx, cancel := context.WithTimeout(parent, 3*time.Second)
	defer cancel()

	res, err := net.DefaultResolver.LookupHost(ctx, name)
	if err == nil && len(res) > 0 {
		return res, nil
	}

	ctx2, cancel2 := context.WithTimeout(parent, 3*time.Second)
	defer cancel2()
	if cfRes, cfErr := publicDNSResolver.LookupHost(ctx2, name); cfErr == nil && len(cfRes) > 0 {
		return cfRes, nil
	}

	return res, err
}

func verifyEmailDNSRecords(parent context.Context, records []emailDNSRecord) []emailDNSRecord {
	if len(records) == 0 {
		return records
	}
	ctx, cancel := context.WithTimeout(parent, 6*time.Second)
	defer cancel()
	out := make([]emailDNSRecord, len(records))
	copy(out, records)

	txtCache := make(map[string][]string)
	mxCache := make(map[string][]*net.MX)
	hostCache := make(map[string][]string)

	for _, rec := range out {
		name := strings.TrimSpace(rec.Name)
		if name == "" {
			continue
		}
		switch rec.Type {
		case "TXT":
			if _, ok := txtCache[name]; !ok {
				txts, _ := lookupTXTWithFallback(ctx, name)
				txtCache[name] = txts
			}
		case "MX":
			if _, ok := mxCache[name]; !ok {
				mxs, _ := lookupMXWithFallback(ctx, name)
				mxCache[name] = mxs
			}
		case "A":
			if _, ok := hostCache[name]; !ok {
				hosts, _ := lookupHostWithFallback(ctx, name)
				hostCache[name] = hosts
			}
		}
	}

	for i := range out {
		rec := &out[i]
		name := strings.TrimSpace(rec.Name)
		switch rec.Type {
		case "A":
			addrs := hostCache[name]
			if len(addrs) == 0 {
				rec.Status = "missing"
				continue
			}
			rec.Found = strings.Join(addrs, ", ")
			matched := false
			for _, a := range addrs {
				if strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(rec.Content)) {
					matched = true
					break
				}
			}
			if matched {
				rec.Status = "verified"
			} else {
				rec.Status = "missing"
			}
		case "MX":
			mxs := mxCache[name]
			if len(mxs) == 0 {
				rec.Status = "missing"
				continue
			}
			foundHosts := make([]string, 0, len(mxs))
			matched := false
			wantHost := strings.TrimSuffix(strings.ToLower(rec.Content), ".")
			for _, mx := range mxs {
				h := strings.TrimSuffix(strings.ToLower(mx.Host), ".")
				foundHosts = append(foundHosts, h)
				if h == wantHost {
					matched = true
				}
			}
			rec.Found = strings.Join(foundHosts, ", ")
			if matched {
				rec.Status = "verified"
			} else {
				rec.Status = "missing"
			}
		case "TXT":
			txts := txtCache[name]
			if len(txts) == 0 {
				rec.Status = "missing"
				continue
			}
			rec.Found = strings.Join(txts, " | ")
			matched := false
			wantPrefix := strings.ToLower(rec.Content)
			if strings.HasPrefix(wantPrefix, "v=spf1") {
				for _, t := range txts {
					if strings.Contains(strings.ToLower(t), "v=spf1") {
						matched = true
						break
					}
				}
			} else if strings.HasPrefix(wantPrefix, "v=dmarc1") {
				for _, t := range txts {
					if strings.Contains(strings.ToLower(t), "v=dmarc1") {
						matched = true
						break
					}
				}
			} else if strings.HasPrefix(wantPrefix, "v=dkim1") && !strings.Contains(rec.Content, "ISI_PUBLIC_KEY_DKIM") {
				for _, t := range txts {
					if strings.Contains(strings.ToLower(t), "v=dkim1") {
						matched = true
						break
					}
				}
			}
			if matched {
				rec.Status = "verified"
			} else {
				rec.Status = "missing"
			}
		}
	}
	return out
}

func sendViaMailChannels(cfg database.EmailServerConfig, fromAddr, toAddr, subject, body string) error {
	if strings.TrimSpace(toAddr) == "" {
		return fmt.Errorf("alamat email tujuan tidak boleh kosong")
	}
	if fromAddr == "" {
		fromAddr = "noreply@" + cfg.Domain
	}
	fromName := strings.TrimSpace(cfg.FromName)
	if fromName == "" {
		fromName = "Reneo Mail"
	}

	plainText, htmlContent := buildReneoEmailTemplate(cfg, fromAddr, subject, body, strings.Contains(strings.ToLower(subject), "uji") || strings.Contains(strings.ToLower(subject), "test"))

	payload := map[string]any{
		"personalizations": []map[string]any{
			{"to": []map[string]string{{"email": toAddr}}},
		},
		"from": map[string]string{
			"email": fromAddr,
			"name":  fromName,
		},
		"subject": subject,
		"content": []map[string]string{
			{"type": "text/plain", "value": plainText},
			{"type": "text/html", "value": htmlContent},
		},
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 4 * time.Second}
	req, err := http.NewRequest(http.MethodPost, "https://api.mailchannels.net/tx/v1/send", bytes.NewReader(payloadBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("gagal menghubungi MailChannels API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusAccepted || resp.StatusCode == http.StatusOK {
		return nil
	}

	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<10))
	return fmt.Errorf("respons MailChannels (%d): %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
}

func testOrSendSMTP(cfg database.EmailServerConfig, smtpPassword, fromAddr, toAddr, subject, body string, testOnly bool) error {
	host := strings.TrimSpace(cfg.SMTPHost)
	if host == "" {
		host = strings.TrimSpace(cfg.MailHostname)
	}
	if host == "" {
		host = "127.0.0.1"
	}
	port := cfg.SubmissionPort
	if cfg.TLSMode == "tls" && cfg.SMTPSPort > 0 {
		port = cfg.SMTPSPort
	} else if cfg.TLSMode == "none" && cfg.SMTPPort > 0 {
		port = cfg.SMTPPort
	}
	if port <= 0 {
		port = 587
	}
	addr := net.JoinHostPort(host, strconv.Itoa(port))

	var client *smtp.Client
	var err error
	dialer := &net.Dialer{Timeout: 3 * time.Second}
	if cfg.TLSMode == "tls" {
		conn, dialErr := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: host == "127.0.0.1" || host == "localhost",
		})
		if dialErr != nil {
			if host == "127.0.0.1" || host == "localhost" {
				return fmt.Errorf("layanan SMTP lokal di %s tidak aktif. Jika menggunakan Cloudflare, kirim keluar memerlukan relay SMTP (mis. Brevo/Gmail/MTA lokal)", addr)
			}
			return fmt.Errorf("koneksi TLS ke %s gagal: %w", addr, dialErr)
		}
		client, err = smtp.NewClient(conn, host)
		if err != nil {
			_ = conn.Close()
			return fmt.Errorf("inisialisasi SMTP di %s gagal: %w", addr, err)
		}
	} else {
		conn, dialErr := dialer.Dial("tcp", addr)
		if dialErr != nil {
			if host == "127.0.0.1" || host == "localhost" {
				return fmt.Errorf("layanan SMTP lokal di %s tidak aktif. Jika menggunakan Cloudflare, kirim keluar memerlukan relay SMTP (mis. Brevo/Gmail/MTA lokal)", addr)
			}
			return fmt.Errorf("koneksi ke %s gagal: %w", addr, dialErr)
		}
		client, err = smtp.NewClient(conn, host)
		if err != nil {
			_ = conn.Close()
			return fmt.Errorf("inisialisasi SMTP di %s gagal: %w", addr, err)
		}
		if cfg.TLSMode == "starttls" {
			if ok, _ := client.Extension("STARTTLS"); ok {
				tlsCfg := &tls.Config{
					ServerName:         host,
					InsecureSkipVerify: host == "127.0.0.1" || host == "localhost",
				}
				if err := client.StartTLS(tlsCfg); err != nil {
					_ = client.Close()
					return fmt.Errorf("STARTTLS di %s gagal: %w", addr, err)
				}
			}
		}
	}
	defer client.Close()

	if strings.TrimSpace(cfg.SMTPUser) != "" && smtpPassword != "" {
		if ok, _ := client.Extension("AUTH"); ok {
			auth := smtp.PlainAuth("", strings.TrimSpace(cfg.SMTPUser), smtpPassword, host)
			if err := client.Auth(auth); err != nil {
				return fmt.Errorf("autentikasi SMTP gagal: %w", err)
			}
		}
	}

	if testOnly {
		return client.Noop()
	}

	envelopeSender := fromAddr
	if strings.TrimSpace(cfg.SMTPUser) != "" && strings.Contains(strings.ToLower(host), "gmail.com") {
		envelopeSender = strings.TrimSpace(cfg.SMTPUser)
	}
	if err := client.Mail(envelopeSender); err != nil {
		if err2 := client.Mail(fromAddr); err2 != nil {
			return fmt.Errorf("pengirim ditolak (%s): %w", fromAddr, err)
		}
	}
	if err := client.Rcpt(toAddr); err != nil {
		return fmt.Errorf("penerima ditolak (%s): %w", toAddr, err)
	}
	wc, err := client.Data()
	if err != nil {
		return fmt.Errorf("gagal membuka stream pesan: %w", err)
	}
	fromHeader := fromAddr
	if strings.TrimSpace(cfg.FromName) != "" {
		fromHeader = fmt.Sprintf("%s <%s>", strings.TrimSpace(cfg.FromName), fromAddr)
	}
	replyToHeader := fromHeader
	senderHeader := ""
	if strings.TrimSpace(cfg.SMTPUser) != "" && !strings.EqualFold(strings.TrimSpace(cfg.SMTPUser), fromAddr) {
		senderHeader = strings.TrimSpace(cfg.SMTPUser)
	}

	isTestEmail := strings.Contains(strings.ToLower(subject), "uji") || strings.Contains(strings.ToLower(subject), "test")
	plainText, htmlContent := buildReneoEmailTemplate(cfg, fromAddr, subject, body, isTestEmail)
	msgBytes := buildMIMEEnvelope(fromHeader, replyToHeader, senderHeader, toAddr, subject, plainText, htmlContent)
	if _, err := wc.Write(msgBytes); err != nil {
		_ = wc.Close()
		return err
	}
	if err := wc.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func readMailLogFile(limit int) ([]system.LogEntry, error) {
	paths := []string{"/var/log/mail.log", "/var/log/mail.err", "/var/log/maillog"}
	for _, p := range paths {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() && fi.Size() > 0 {
			data, err := os.ReadFile(p)
			if err == nil {
				lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
				filtered := make([]system.LogEntry, 0, limit)
				for i := len(lines) - 1; i >= 0 && len(filtered) < limit; i-- {
					line := strings.TrimSpace(lines[i])
					if line != "" {
						filtered = append(filtered, system.LogEntry{Line: line})
					}
				}
				for i, j := 0, len(filtered)-1; i < j; i, j = i+1, j-1 {
					filtered[i], filtered[j] = filtered[j], filtered[i]
				}
				return filtered, nil
			}
		}
	}
	return nil, os.ErrNotExist
}

func (s *Server) readEmailActivityLogs(limit int) []system.LogEntry {
	entries := make([]system.LogEntry, 0)
	if s.database != nil && s.database.IsConnected() {
		if rows, err := s.database.ListRuntimeLogs(limit); err == nil {
			for _, r := range rows {
				if strings.Contains(strings.ToLower(r.Service), "email") || strings.Contains(strings.ToLower(r.Message), "email") {
					entries = append(entries, system.LogEntry{
						Line: fmt.Sprintf("[%s] [%s] %s: %s", r.CreatedAt.Format("2006-01-02 15:04:05"), strings.ToUpper(r.Level), r.Service, r.Message),
					})
				}
			}
		}
	}
	if len(entries) == 0 {
		cfg := s.loadEmailConfig()
		status := "Nonaktif"
		if cfg.Enabled {
			status = "Aktif (" + strings.ToUpper(cfg.Method) + ")"
		}
		entries = append(entries,
			system.LogEntry{Line: fmt.Sprintf("[%s] [INFO] reneo-mail: Status Email Server: %s, Domain: %s", time.Now().Format("2006-01-02 15:04:05"), status, cfg.Domain)},
			system.LogEntry{Line: fmt.Sprintf("[%s] [INFO] reneo-mail: Layanan siap menerima dan memproses lalu lintas email.", time.Now().Format("2006-01-02 15:04:05"))},
		)
	}
	return entries
}

func (s *Server) readEmailLogs(service string, limit int) ([]system.LogEntry, string, error) {
	if service == "" || service == "auto" {
		if entries, err := system.ReadServiceLogs("postfix", limit); err == nil && len(entries) > 0 && !isDefaultEmptyLog(entries) {
			return entries, "postfix", nil
		}
		if entries, err := system.ReadServiceLogs("dovecot", limit); err == nil && len(entries) > 0 && !isDefaultEmptyLog(entries) {
			return entries, "dovecot", nil
		}
		if entries, err := system.ReadServiceLogs("exim4", limit); err == nil && len(entries) > 0 && !isDefaultEmptyLog(entries) {
			return entries, "exim4", nil
		}
		if entries, err := readMailLogFile(limit); err == nil && len(entries) > 0 {
			return entries, "mail.log", nil
		}
		return s.readEmailActivityLogs(limit), "activity", nil
	}

	if service == "activity" {
		return s.readEmailActivityLogs(limit), "activity", nil
	}

	if service == "mail.log" {
		entries, err := readMailLogFile(limit)
		if err != nil || len(entries) == 0 {
			return []system.LogEntry{
				{Line: fmt.Sprintf("[%s] File /var/log/mail.log tidak ditemukan atau belum ada entri log mail sistem.", time.Now().Format("2006-01-02 15:04:05"))},
			}, "mail.log", nil
		}
		return entries, "mail.log", nil
	}

	entries, err := system.ReadServiceLogs(service, limit)
	if err != nil {
		return []system.LogEntry{
			{Line: fmt.Sprintf("[%s] Layanan %s tidak aktif atau journalctl tidak menemukan unit %s: %v", time.Now().Format("2006-01-02 15:04:05"), service, service, err)},
		}, service, nil
	}
	return entries, service, nil
}

func isDefaultEmptyLog(entries []system.LogEntry) bool {
	if len(entries) == 1 && strings.Contains(entries[0].Line, "Belum ada log yang tersedia") {
		return true
	}
	return false
}
