package httpserver

import (
	"bytes"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// Embedded base64 of public/brand/reneo-icon-128.png
const reneoLogoPNGData = "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"

type emailTemplateData struct {
	Subject       string
	Title         string
	Badge         string
	FormattedBody string
	Domain        string
	Method        string
	From          string
	SentAt        string
	PanelURL      string
}

func buildReneoEmailTemplate(cfg database.EmailServerConfig, fromAddr, subject, body string, isTest bool) (plainText string, htmlContent string) {
	domain := strings.TrimSpace(cfg.Domain)
	if domain == "" {
		domain = "reneo.local"
	}
	methodStr := strings.ToUpper(strings.TrimSpace(cfg.Method))
	if methodStr == "CLOUDFLARE" {
		if cfg.CFOutboundRelay == "smtp" {
			methodStr = "Cloudflare (Relay SMTP)"
		} else {
			methodStr = "Cloudflare (Email Worker)"
		}
	} else if methodStr == "IP" {
		methodStr = "MTA Server Lokal (Postfix/Dovecot)"
	} else {
		methodStr = "SMTP Server"
	}

	badge := "AKTIF"
	title := subject
	if isTest {
		badge = "TERVERIFIKASI"
		title = "Pengujian Email Server Berhasil"
	}

	panelURL := ""
	if domain != "" && !strings.Contains(domain, "localhost") {
		panelURL = "https://" + domain
	}

	nowStr := time.Now().Format("02 Jan 2006, 15:04:05 MST")

	// 1. Plain text version
	var plainBuf strings.Builder
	plainBuf.WriteString("========================================\r\n")
	plainBuf.WriteString("RENEO SERVER CONTROL PANEL\r\n")
	plainBuf.WriteString("========================================\r\n\r\n")
	plainBuf.WriteString(fmt.Sprintf("[%s] %s\r\n\r\n", badge, title))
	plainBuf.WriteString(body + "\r\n\r\n")
	plainBuf.WriteString("----------------------------------------\r\n")
	plainBuf.WriteString(fmt.Sprintf("Domain Server    : %s\r\n", domain))
	plainBuf.WriteString(fmt.Sprintf("Metode Layanan   : %s\r\n", methodStr))
	plainBuf.WriteString(fmt.Sprintf("Alamat Pengirim  : %s\r\n", fromAddr))
	plainBuf.WriteString(fmt.Sprintf("Waktu Pengiriman : %s\r\n", nowStr))
	if panelURL != "" {
		plainBuf.WriteString(fmt.Sprintf("Tautan Panel     : %s\r\n", panelURL))
	}
	plainBuf.WriteString("----------------------------------------\r\n")
	plainBuf.WriteString("Email ini dikirim otomatis oleh sistem Reneo Server Control Panel.\r\n")
	plainText = plainBuf.String()

	// 2. HTML version with responsive styling & embedded logo
	htmlBodyEscaped := strings.ReplaceAll(html.EscapeString(body), "\n", "<br/>")

	buttonHTML := ""
	if panelURL != "" {
		buttonHTML = fmt.Sprintf(`
              <div style="margin: 24px 0 8px 0;">
                <a href="%s" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 6px; box-shadow: 0 1px 3px rgba(37,99,235,0.25);">
                  Buka Control Panel &rarr;
                </a>
              </div>`, html.EscapeString(panelURL))
	}

	htmlContent = fmt.Sprintf(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>%s</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.06);">
          
          <!-- Header Bar -->
          <tr>
            <td style="background-color: #0f172a; padding: 20px 24px; border-bottom: 1px solid #1e293b;">
              <table role="presentation" width="100%%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 12px;">
                          <img src="cid:reneo-logo" alt="Reneo" width="36" height="36" style="display: block; width: 36px; height: 36px; border-radius: 8px; border: 0;" />
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="display: block; font-size: 16px; font-weight: 700; color: #ffffff; letter-spacing: -0.2px;">Reneo</span>
                          <span style="display: block; font-size: 11px; color: #94a3b8; font-weight: 500;">Server Control Panel</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 600; color: #10b981; background-color: rgba(16,185,129,0.14); border: 1px solid rgba(16,185,129,0.3); border-radius: 9999px;">
                      %s
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 28px 24px;">
              <h1 style="margin: 0 0 16px 0; font-size: 19px; font-weight: 700; color: #0f172a; line-height: 1.35;">
                %s
              </h1>
              
              <div style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                %s
              </div>

              <!-- Metadata Table -->
              <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; font-size: 12px;">
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 500; width: 130px;">Domain Server</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 600;">%s</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 500;">Metode Layanan</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Consolas, monospace;">%s</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 500;">Alamat Pengirim</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Consolas, monospace;">%s</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; color: #64748b; font-weight: 500;">Waktu Pengiriman</td>
                  <td style="padding: 10px 14px; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Consolas, monospace;">%s</td>
                </tr>
              </table>

              %s
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;">
                Email ini dikirim secara otomatis oleh <strong>Reneo Server Control Panel</strong>.
              </p>
              <p style="margin: 0; font-size: 10px; color: #94a3b8;">
                Domain: %s &bull; Harap tidak membalas langsung ke alamat ini jika merupakan pesan otomatis sistem.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
		html.EscapeString(subject),
		html.EscapeString(badge),
		html.EscapeString(title),
		htmlBodyEscaped,
		html.EscapeString(domain),
		html.EscapeString(methodStr),
		html.EscapeString(fromAddr),
		html.EscapeString(nowStr),
		buttonHTML,
		html.EscapeString(domain),
	)

	return plainText, htmlContent
}

// buildMIMEEnvelope builds a complete RFC 5322 MIME message with multipart/related,
// embedding the Reneo PNG logo via cid:reneo-logo and providing both plain and HTML alternatives.
func buildMIMEEnvelope(fromHeader, toAddr, subject, plainText, htmlContent string) []byte {
	relatedBoundary := fmt.Sprintf("=_reneo_rel_%d", time.Now().UnixNano())
	altBoundary := fmt.Sprintf("=_reneo_alt_%d", time.Now().UnixNano())

	var buf bytes.Buffer
	buf.WriteString("From: " + fromHeader + "\r\n")
	buf.WriteString("To: " + toAddr + "\r\n")
	buf.WriteString("Subject: " + subject + "\r\n")
	buf.WriteString("Date: " + time.Now().Format(time.RFC1123Z) + "\r\n")
	buf.WriteString("MIME-Version: 1.0\r\n")
	buf.WriteString(fmt.Sprintf("Content-Type: multipart/related; boundary=\"%s\"; type=\"text/html\"\r\n", relatedBoundary))
	buf.WriteString("\r\n")

	// 1. Related Part 1: multipart/alternative (Plain + HTML)
	buf.WriteString("--" + relatedBoundary + "\r\n")
	buf.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n", altBoundary))
	buf.WriteString("\r\n")

	// 1a. Plain text part
	buf.WriteString("--" + altBoundary + "\r\n")
	buf.WriteString("Content-Type: text/plain; charset=UTF-8; format=flowed\r\n")
	buf.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	buf.WriteString("\r\n")
	buf.WriteString(plainText)
	buf.WriteString("\r\n\r\n")

	// 1b. HTML part
	buf.WriteString("--" + altBoundary + "\r\n")
	buf.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	buf.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	buf.WriteString("\r\n")
	buf.WriteString(htmlContent)
	buf.WriteString("\r\n\r\n")

	buf.WriteString("--" + altBoundary + "--\r\n\r\n")

	// 2. Related Part 2: Embedded Logo Image (CID: reneo-logo)
	buf.WriteString("--" + relatedBoundary + "\r\n")
	buf.WriteString("Content-Type: image/png; name=\"reneo-icon.png\"\r\n")
	buf.WriteString("Content-Transfer-Encoding: base64\r\n")
	buf.WriteString("Content-ID: <reneo-logo>\r\n")
	buf.WriteString("Content-Disposition: inline; filename=\"reneo-icon.png\"\r\n")
	buf.WriteString("\r\n")

	// Write base64 lines (wrap at 76 chars as per RFC 2045)
	rawB64 := reneoLogoPNGData
	for len(rawB64) > 76 {
		buf.WriteString(rawB64[:76] + "\r\n")
		rawB64 = rawB64[76:]
	}
	if len(rawB64) > 0 {
		buf.WriteString(rawB64 + "\r\n")
	}
	buf.WriteString("\r\n")

	buf.WriteString("--" + relatedBoundary + "--\r\n")

	return buf.Bytes()
}
