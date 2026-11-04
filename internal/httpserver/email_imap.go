package httpserver

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// syncIMAPInbox connects to the configured IMAP server (e.g. Gmail or local Dovecot),
// fetches the latest messages, and inserts new ones into the database.
func (s *Server) syncIMAPInbox(limit int) (int, error) {
	if s.database == nil || !s.database.IsConnected() {
		return 0, fmt.Errorf("database tidak terhubung")
	}
	cfg := s.loadEmailConfig()
	if !cfg.Enabled {
		return 0, fmt.Errorf("email server belum diaktifkan")
	}
	if strings.TrimSpace(cfg.SMTPUser) == "" || cfg.SMTPPasswordEnc == "" {
		return 0, fmt.Errorf("kredensial email (pengguna & sandi) belum diatur di Pengaturan > Email Server")
	}

	pass := cfg.SMTPPasswordEnc
	if s.cfg.EncryptionKey != "" {
		if dec, err := crypto.Decrypt(s.cfg.EncryptionKey, cfg.SMTPPasswordEnc); err == nil && dec != "" {
			pass = dec
		}
	}

	imapHost := strings.TrimSpace(cfg.SMTPHost)
	if strings.EqualFold(imapHost, "smtp.gmail.com") {
		imapHost = "imap.gmail.com"
	} else if imapHost == "" || imapHost == "127.0.0.1" || imapHost == "localhost" {
		imapHost = "127.0.0.1"
	}
	imapPort := cfg.IMAPPort
	if imapPort <= 0 {
		imapPort = 993
	}

	addr := net.JoinHostPort(imapHost, strconv.Itoa(imapPort))
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	tlsConfig := &tls.Config{
		ServerName:         imapHost,
		InsecureSkipVerify: imapHost == "127.0.0.1" || imapHost == "localhost",
	}

	conn, err := tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
	if err != nil {
		return 0, fmt.Errorf("gagal terhubung ke IMAP di %s: %w", addr, err)
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(12 * time.Second))
	reader := bufio.NewReader(conn)

	// Read initial greeting
	greeting, err := reader.ReadString('\n')
	if err != nil {
		return 0, fmt.Errorf("gagal membaca salam pembuka IMAP: %w", err)
	}
	if !strings.HasPrefix(greeting, "* OK") {
		return 0, fmt.Errorf("respon salam IMAP tidak valid: %s", strings.TrimSpace(greeting))
	}

	// 1. LOGIN
	loginCmd := fmt.Sprintf("a01 LOGIN \"%s\" \"%s\"\r\n", escapeIMAPString(cfg.SMTPUser), escapeIMAPString(pass))
	if _, err := conn.Write([]byte(loginCmd)); err != nil {
		return 0, err
	}
	resp, ok := readUntilTag(reader, "a01")
	if !ok {
		return 0, fmt.Errorf("autentikasi IMAP gagal: %s", resp)
	}

	// 2. SELECT INBOX
	if _, err := conn.Write([]byte("a02 SELECT INBOX\r\n")); err != nil {
		return 0, err
	}
	selectResp, ok := readUntilTag(reader, "a02")
	if !ok {
		return 0, fmt.Errorf("gagal membuka kotak masuk (INBOX): %s", selectResp)
	}

	totalExists := parseExistsCount(selectResp)
	if totalExists <= 0 {
		_, _ = conn.Write([]byte("a99 LOGOUT\r\n"))
		return 0, nil
	}

	if limit <= 0 || limit > 50 {
		limit = 15
	}
	startSeq := totalExists - limit + 1
	if startSeq < 1 {
		startSeq = 1
	}

	// 3. FETCH RFC822 for messages from startSeq to totalExists
	fetchCmd := fmt.Sprintf("a03 FETCH %d:%d (RFC822)\r\n", startSeq, totalExists)
	if _, err := conn.Write([]byte(fetchCmd)); err != nil {
		return 0, err
	}

	fetchedCount := 0
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		if strings.HasPrefix(line, "a03 OK") || strings.HasPrefix(line, "a03 NO") || strings.HasPrefix(line, "a03 BAD") {
			break
		}

		if strings.Contains(line, "FETCH (RFC822 {") {
			sizeStr := line[strings.Index(line, "{")+1 : strings.Index(line, "}")]
			size, _ := strconv.Atoi(sizeStr)
			if size > 0 && size < 5<<20 { // max 5MB per email
				buf := make([]byte, size)
				if _, err := io.ReadFull(reader, buf); err == nil {
					if msg, err := mail.ReadMessage(strings.NewReader(string(buf))); err == nil {
						fromHeader := msg.Header.Get("From")
						toHeader := msg.Header.Get("To")
						subjectHeader := msg.Header.Get("Subject")
						messageID := msg.Header.Get("Message-ID")
						dateHeader := msg.Header.Get("Date")

						bodyBytes, _ := io.ReadAll(io.LimitReader(msg.Body, 1<<20))
						bodyStr := string(bodyBytes)

						fromAddr := fromHeader
						fromName := ""
						if addr, err := mail.ParseAddress(fromHeader); err == nil {
							fromAddr = addr.Address
							fromName = addr.Name
						}

						receivedAt := time.Now()
						if parsedDate, err := mail.ParseDate(dateHeader); err == nil {
							receivedAt = parsedDate
						}

						// Check if message is already in database (by message_id or combination)
						dbMsg := database.EmailMessage{
							Direction:  "inbound",
							FromAddr:   fromAddr,
							FromName:   fromName,
							ToAddr:     toHeader,
							Subject:    subjectHeader,
							BodyText:   bodyStr,
							MessageID:  messageID,
							ReceivedAt: receivedAt,
						}
						if _, err := s.database.InsertEmailMessage(dbMsg); err == nil {
							fetchedCount++
						}
					}
				}
			}
		}
	}

	_, _ = conn.Write([]byte("a99 LOGOUT\r\n"))
	return fetchedCount, nil
}

func escapeIMAPString(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	return strings.ReplaceAll(s, "\"", "\\\"")
}

func readUntilTag(r *bufio.Reader, tag string) (string, bool) {
	var lines []string
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return strings.Join(lines, "\n"), false
		}
		lines = append(lines, strings.TrimSpace(line))
		if strings.HasPrefix(line, tag+" OK") {
			return strings.Join(lines, "\n"), true
		}
		if strings.HasPrefix(line, tag+" NO") || strings.HasPrefix(line, tag+" BAD") {
			return strings.Join(lines, "\n"), false
		}
	}
}

func parseExistsCount(resp string) int {
	for _, line := range strings.Split(resp, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "* ") && strings.HasSuffix(line, " EXISTS") {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				if n, err := strconv.Atoi(parts[1]); err == nil {
					return n
				}
			}
		}
	}
	return 0
}

