package notify

import (
	"context"
	"fmt"
	"strings"
)

// PublicInquiryNotice carries a public contact/feature/source-code inquiry from an app landing page.
type PublicInquiryNotice struct {
	AppName      string
	Name         string
	BuyerPhone   string
	BusinessName string
	InquiryType  string
	Message      string
}

// SendPublicInquiry delivers an inquiry summary to all active superadmin notification targets
// configured in Reneo Panel, and sends an immediate WhatsApp acknowledgement to the buyer.
func (s *Service) SendPublicInquiry(ctx context.Context, in PublicInquiryNotice) (adminNotified int, buyerNotified bool) {
	if !s.ready() {
		return 0, false
	}
	appName := strings.TrimSpace(in.AppName)
	if appName == "" {
		appName = "Reneo CRM"
	}
	topic := strings.TrimSpace(in.InquiryType)
	if topic == "" {
		topic = "Permintaan Fitur / Pembelian Aset Program"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "*Permintaan Baru — %s*\n", appName)
	fmt.Fprintf(&b, "Jenis: %s\n", topic)
	fmt.Fprintf(&b, "Nama: %s\n", strings.TrimSpace(in.Name))
	if strings.TrimSpace(in.BusinessName) != "" {
		fmt.Fprintf(&b, "Usaha/Perusahaan: %s\n", strings.TrimSpace(in.BusinessName))
	}
	fmt.Fprintf(&b, "WhatsApp: %s\n", strings.TrimSpace(in.BuyerPhone))
	fmt.Fprintf(&b, "Pesan:\n%s", strings.TrimSpace(in.Message))
	adminText := b.String()

	serverSender, _ := s.db.WhatsAppSenderID()

	if adminIDs, err := s.db.ActiveSuperadminIDs(); err == nil && len(adminIDs) > 0 {
		if targets, err := s.db.NotifyTargets(adminIDs); err == nil {
			for _, t := range targets {
				if strings.TrimSpace(t.Address) == "" {
					continue
				}
				var sendErr error
				switch t.Kind {
				case wahaKind:
					senderID := t.UserID
					if t.ViaServer && serverSender > 0 {
						senderID = serverSender
					}
					if senderID > 0 {
						_, sendErr = s.sendFromSession(ctx, senderID, t.Address, adminText)
					} else {
						continue
					}
				default:
					ch, chErr := s.Channel(t.Kind)
					if chErr != nil || ch == nil {
						continue
					}
					_, sendErr = ch.Send(ctx, t.Address, adminText)
				}
				if sendErr == nil {
					adminNotified++
				}
			}
		}
	}

	buyerPhone, normErr := NormalizePhone(in.BuyerPhone)
	if normErr == nil && buyerPhone != "" {
		buyerText := fmt.Sprintf(
			"Halo %s, terima kasih telah menghubungi kami terkait *%s* (%s).\n\nPermintaan Anda sudah kami terima. Anda akan segera mendapat balasan oleh tim kami.",
			strings.TrimSpace(in.Name),
			topic,
			appName,
		)
		buyerKind := s.BuyerChannel()
		switch buyerKind {
		case wahaKind:
			if serverSender > 0 {
				if _, err := s.sendFromSession(ctx, serverSender, buyerPhone, buyerText); err == nil {
					buyerNotified = true
				}
			}
		case cloudKind:
			if ch, err := s.Channel(cloudKind); err == nil && ch != nil {
				if _, err := ch.Send(ctx, buyerPhone, buyerText); err == nil {
					buyerNotified = true
				}
			}
		}
	}

	return adminNotified, buyerNotified
}
