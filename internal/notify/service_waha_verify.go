package notify

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
)

// The verification of a number for the notices an account gets from the WhatsApp of the server: a code of six digits is sent
// to the number, and typing it back proves the number is the account's own.
const (
	verifyTTL         = 10 * time.Minute
	verifyGap         = time.Minute
	verifyDailyCap    = 5
	verifyMaxAttempts = 5
)

// ErrVerification is a reason the account can act on: wait, check the number, ask for a new code
type ErrVerification struct{ Message string }

func (e *ErrVerification) Error() string { return e.Message }

func verifyHash(userID int64, code string) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("reneo-wa-verify:%d:%s", userID, code)))
	return hex.EncodeToString(sum[:])
}

func newVerifyCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func verifyText(code, locale string) string {
	if locale == "en" {
		return fmt.Sprintf("Reneo verification code: *%s*\nIt is valid for %d minutes. Do not share it with anyone.", code, int(verifyTTL.Minutes()))
	}
	return fmt.Sprintf("Kode verifikasi Reneo: *%s*\nBerlaku %d menit. Jangan bagikan kode ini kepada siapa pun.", code, int(verifyTTL.Minutes()))
}

// StartWhatsAppVerification sends a code to a number from the session of the seller and returns the number it went to and
// when the code stops working
func (s *Service) StartWhatsAppVerification(ctx context.Context, userID int64, input, locale string) (string, time.Time, error) {
	if !s.ready() {
		return "", time.Time{}, errors.New("the database is not connected")
	}
	if !s.BuyerWhatsAppReady() {
		return "", time.Time{}, &ErrVerification{Message: "the WhatsApp of the server is not ready: ask the owner to connect it"}
	}
	phone, err := NormalizePhone(input)
	if err != nil {
		return "", time.Time{}, &ErrVerification{Message: err.Error()}
	}
	now := s.now()
	if prior, err := s.db.GetWhatsAppVerification(userID); err == nil && prior != nil {
		if wait := verifyGap - now.Sub(prior.SentAt); wait > 0 {
			return "", time.Time{}, &ErrVerification{Message: fmt.Sprintf("wait %d seconds before asking for another code", int(wait.Seconds())+1)}
		}
		today := now.Format("2006-01-02")
		if prior.SendsDay.Format("2006-01-02") == today && prior.SendsToday >= verifyDailyCap {
			return "", time.Time{}, &ErrVerification{Message: "too many codes today: try again tomorrow"}
		}
	}
	sender, err := s.db.WhatsAppSenderID()
	if err != nil || sender == 0 {
		return "", time.Time{}, &ErrVerification{Message: "the WhatsApp of the server is not ready: ask the owner to connect it"}
	}
	code, err := newVerifyCode()
	if err != nil {
		return "", time.Time{}, err
	}
	if _, err := s.sendFromSession(ctx, sender, phone, verifyText(code, strings.ToLower(locale))); err != nil {
		return "", time.Time{}, &ErrVerification{Message: "the code could not be sent: " + AsSendError(err).Message}
	}
	expires := now.Add(verifyTTL)
	if err := s.db.SaveWhatsAppVerification(userID, phone, verifyHash(userID, code), expires); err != nil {
		return "", time.Time{}, err
	}
	return phone, expires, nil
}

// ConfirmWhatsAppVerification checks the code that was typed back; a right one keeps the number for the account
func (s *Service) ConfirmWhatsAppVerification(userID int64, code string) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	pending, err := s.db.GetWhatsAppVerification(userID)
	if err != nil {
		return err
	}
	if pending == nil || !s.now().Before(pending.ExpiresAt) {
		return &ErrVerification{Message: "ask for a new code: there is none waiting"}
	}
	if pending.Attempts >= verifyMaxAttempts {
		return &ErrVerification{Message: "too many wrong codes: ask for a new one"}
	}
	code = strings.TrimSpace(code)
	if subtle.ConstantTimeCompare([]byte(verifyHash(userID, code)), []byte(pending.CodeHash)) != 1 {
		_, _ = s.db.CountWhatsAppVerificationAttempt(userID)
		return &ErrVerification{Message: "that code is not right"}
	}
	if err := s.db.ConnectServerWhatsApp(userID, wahaKind, pending.Phone); err != nil {
		return err
	}
	return s.db.DeleteWhatsAppVerification(userID)
}
