package httpserver

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
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

func verifyEmailDNSRecords(parent context.Context, records []emailDNSRecord) []emailDNSRecord {
	if len(records) == 0 {
		return records
	}
	ctx, cancel := context.WithTimeout(parent, 2500*time.Millisecond)
	defer cancel()
	r := net.DefaultResolver
	out := make([]emailDNSRecord, len(records))
	copy(out, records)

	for i := range out {
		rec := &out[i]
		switch rec.Type {
		case "A":
			addrs, err := r.LookupHost(ctx, rec.Name)
			if err != nil || len(addrs) == 0 {
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
			mxs, err := r.LookupMX(ctx, rec.Name)
			if err != nil || len(mxs) == 0 {
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
			txts, err := r.LookupTXT(ctx, rec.Name)
			if err != nil || len(txts) == 0 {
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
	dialer := &net.Dialer{Timeout: 6 * time.Second}
	if cfg.TLSMode == "tls" {
		conn, dialErr := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
			ServerName:         host,
			InsecureSkipVerify: host == "127.0.0.1" || host == "localhost",
		})
		if dialErr != nil {
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

	if err := client.Mail(fromAddr); err != nil {
		return fmt.Errorf("pengirim ditolak (%s): %w", fromAddr, err)
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
	msg := strings.Join([]string{
		"From: " + fromHeader,
		"To: " + toAddr,
		"Subject: " + subject,
		"Date: " + time.Now().Format(time.RFC1123Z),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")
	if _, err := wc.Write([]byte(msg)); err != nil {
		_ = wc.Close()
		return err
	}
	if err := wc.Close(); err != nil {
		return err
	}
	return client.Quit()
}
