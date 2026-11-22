package notify

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
)

type cloudConfig struct {
	PhoneID   string `json:"phoneId"`
	WABAID    string `json:"wabaId"`
	Version   string `json:"version"`
	Phone     string `json:"phone"`
	PhoneName string `json:"phoneName"`
}

// CloudSettings is what the owner types for WhatsApp Cloud. A nil Token keeps the one saved.
type CloudSettings struct {
	Token   *string
	PhoneID string
	WABAID  string
	Version string
	Enabled bool
	// AppSecret signs what Meta sends to the webhook; nil keeps the saved one
	AppSecret *string
}

// ConfigureWhatsAppCloud saves the token (checked with Meta first, together with the phone number id) and the switch
func (s *Service) ConfigureWhatsAppCloud(ctx context.Context, in CloudSettings) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	row, err := s.db.GetNotifyChannel(cloudKind)
	if err != nil {
		return err
	}
	var cfg cloudConfig
	if row != nil {
		_ = json.Unmarshal(row.Config, &cfg)
	}
	token := ""
	var encrypted *string
	switch {
	case in.Token != nil:
		token = strings.TrimSpace(*in.Token)
		enc, err := crypto.Encrypt(s.key, token)
		if err != nil {
			return err
		}
		encrypted = &enc
	case row != nil && row.SecretEncrypted != "":
		if token, err = crypto.Decrypt(s.key, row.SecretEncrypted); err != nil {
			return errors.New("the stored token cannot be decrypted")
		}
	default:
		return errors.New("enter the access token first")
	}
	in.PhoneID, in.WABAID = strings.TrimSpace(in.PhoneID), strings.TrimSpace(in.WABAID)
	if in.PhoneID == "" {
		return errors.New("enter the phone number id")
	}
	if in.WABAID == "" {
		return errors.New("enter the WhatsApp Business Account id")
	}
	c := NewWhatsAppCloud(token, in.PhoneID, in.WABAID, in.Version)
	if s.cloudBase != "" {
		c.WithBase(s.cloudBase)
	}
	info, err := c.Phone(ctx)
	if err != nil {
		return fmt.Errorf("Meta did not accept these details: %w", err)
	}
	cfg = cloudConfig{PhoneID: in.PhoneID, WABAID: in.WABAID, Version: in.Version, Phone: info.Display, PhoneName: info.VerifiedName}
	config, _ := json.Marshal(cfg)
	if err := s.db.SaveNotifyChannel(cloudKind, in.Enabled, config, encrypted, "active", ""); err != nil {
		return err
	}
	if in.AppSecret != nil && strings.TrimSpace(*in.AppSecret) != "" {
		if err := s.SetCloudAppSecret(*in.AppSecret); err != nil {
			return err
		}
	}
	s.invalidate()
	return nil
}

func (s *Service) cloudClient() (*WhatsAppCloud, error) {
	s.chMu.Lock()
	ch, err := s.buildLocked(cloudKind, false)
	s.chMu.Unlock()
	if err != nil {
		return nil, err
	}
	c, ok := ch.(*WhatsAppCloud)
	if !ok || c == nil {
		return nil, errors.New("set up WhatsApp Cloud first")
	}
	return c, nil
}

// CloudTemplateStates is where each template of the catalog stands with Meta
func (s *Service) CloudTemplateStates(ctx context.Context) ([]TemplateState, error) {
	c, err := s.cloudClient()
	if err != nil {
		return nil, err
	}
	return c.TemplateStates(ctx)
}

// CreateCloudTemplates sends the templates Meta does not have yet for review
func (s *Service) CreateCloudTemplates(ctx context.Context) (int, error) {
	c, err := s.cloudClient()
	if err != nil {
		return 0, err
	}
	return c.CreateTemplates(ctx)
}

// SetCloudNumber makes a number the place of this account's notices on WhatsApp Cloud. The account types it itself,
// and a test message to it shows whether it works.
func (s *Service) SetCloudNumber(userID int64, input string) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	phone, err := NormalizePhone(input)
	if err != nil {
		return err
	}
	return s.db.ConnectNotifyRecipient(userID, cloudKind, phone)
}

// BuyerChannel is the channel a buyer's notices will go through: WhatsApp through WAHA when a superadmin's phone is
// connected, else WhatsApp Cloud when it is on; empty when neither can deliver
func (s *Service) BuyerChannel() string {
	if !s.ready() {
		return ""
	}
	if s.BuyerWhatsAppReady() {
		return wahaKind
	}
	if row, err := s.db.GetNotifyChannel(cloudKind); err == nil && row != nil && row.Enabled && row.SecretEncrypted != "" {
		return cloudKind
	}
	return ""
}

const (
	cloudAppSecretKey   = "cloud_app_secret"
	cloudVerifyTokenKey = "cloud_verify_token"
)

// CloudWebhook is what the owner pastes into the webhook settings of the Meta app
type CloudWebhook struct {
	VerifyToken string `json:"verifyToken"`
	// SecretSet: the app secret is saved, so a signed request can be checked; without it every request is refused
	SecretSet bool `json:"secretSet"`
}

func (s *Service) settingDecrypted(key string) string {
	raw, _ := s.db.GetNotifySetting(key)
	if raw == "" {
		return ""
	}
	value, err := crypto.Decrypt(s.key, raw)
	if err != nil {
		return ""
	}
	return value
}

// CloudWebhookInfo gives the verify token (made on first use) and says whether the app secret is saved
func (s *Service) CloudWebhookInfo() (CloudWebhook, error) {
	if !s.ready() {
		return CloudWebhook{}, errors.New("the database is not connected")
	}
	token := s.settingDecrypted(cloudVerifyTokenKey)
	if token == "" {
		token = randomHex(16)
		enc, err := crypto.Encrypt(s.key, token)
		if err != nil {
			return CloudWebhook{}, err
		}
		if err := s.db.SetNotifySetting(cloudVerifyTokenKey, enc); err != nil {
			return CloudWebhook{}, err
		}
	}
	return CloudWebhook{VerifyToken: token, SecretSet: s.settingDecrypted(cloudAppSecretKey) != ""}, nil
}

// SetCloudAppSecret saves the secret of the Meta app, with which Meta signs what it sends
func (s *Service) SetCloudAppSecret(secret string) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	enc, err := crypto.Encrypt(s.key, strings.TrimSpace(secret))
	if err != nil {
		return err
	}
	return s.db.SetNotifySetting(cloudAppSecretKey, enc)
}

// VerifyCloudWebhook answers Meta's check of the address: the token it sends must be the one shown to the owner
func (s *Service) VerifyCloudWebhook(token string) bool {
	if !s.ready() || token == "" {
		return false
	}
	want := s.settingDecrypted(cloudVerifyTokenKey)
	return want != "" && hmac.Equal([]byte(want), []byte(token))
}

// ErrBadSignature is a webhook request that Meta did not sign with the secret of the app
var ErrBadSignature = errors.New("the signature does not match")

// HandleCloudWebhook takes what Meta sent: the signature is checked first, with the saved secret and in constant
// time, then what happened to the messages is recorded and an answer ("stop", "start") is acted on and replied to.
func (s *Service) HandleCloudWebhook(ctx context.Context, body []byte, signature string) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	secret := s.settingDecrypted(cloudAppSecretKey)
	if secret == "" {
		return ErrBadSignature
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	want := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(want), []byte(strings.ToLower(strings.TrimSpace(signature)))) {
		return ErrBadSignature
	}
	var payload struct {
		Entry []struct {
			Changes []struct {
				Value struct {
					Statuses []struct {
						ID     string `json:"id"`
						Status string `json:"status"`
						Errors []struct {
							Code  int    `json:"code"`
							Title string `json:"title"`
						} `json:"errors"`
					} `json:"statuses"`
					Messages []struct {
						From string `json:"from"`
						Type string `json:"type"`
						Text struct {
							Body string `json:"body"`
						} `json:"text"`
					} `json:"messages"`
				} `json:"value"`
			} `json:"changes"`
		} `json:"entry"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return errors.New("the webhook body cannot be read")
	}
	var client *WhatsAppCloud
	for _, entry := range payload.Entry {
		for _, change := range entry.Changes {
			for _, st := range change.Value.Statuses {
				reason := ""
				if len(st.Errors) > 0 {
					reason = fmt.Sprintf("Meta: %s (code %d)", st.Errors[0].Title, st.Errors[0].Code)
				}
				_ = s.db.SetOutboxProviderStatus(cloudKind, st.ID, st.Status, reason)
			}
			for _, m := range change.Value.Messages {
				if m.Type != "text" {
					continue
				}
				intent := InboundIntent(m.Text.Body)
				if intent == "" {
					continue
				}
				reply := s.HandleInbound(cloudKind, onlyDigits(m.From), intent)
				if reply == "" {
					continue
				}
				if client == nil {
					client, _ = s.cloudClient()
				}
				if client != nil {
					_ = client.SendText(ctx, m.From, reply)
				}
			}
		}
	}
	return nil
}
