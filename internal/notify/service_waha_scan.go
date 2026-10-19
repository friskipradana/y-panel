package notify

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// SessionExpired is the end of a wait for a scan: the session was stopped because nobody scanned the code in time. It is
// the panel's own state, WAHA only knows the session as stopped.
const SessionExpired = "EXPIRED"

// The limits of a wait for a scan. A session that waits longer than the window, or whose code has changed more times than
// the limit without being scanned, is stopped and must be restarted by the account. Variables so a test need not wait.
var (
	ScanWindow       = 5 * time.Minute
	ScanMaxQRChanges = 3
)

// ErrScanExpired is the answer for the code of a wait that has ended
var ErrScanExpired = errors.New("the QR code expired because it was not scanned in time: restart the session to get a new one")

// expireScan ends the wait: the session is stopped in WAHA, so it stops making new codes, and marked as expired
func (s *Service) expireScan(ctx context.Context, admin *Waha, row *database.WhatsAppSession) (WhatsAppState, error) {
	if err := admin.StopSession(ctx, row.SessionName); err != nil {
		log.Printf("[notify] the session %s was not stopped after its wait ended: %v", row.SessionName, err)
	}
	_ = s.db.UpdateWhatsAppSession(row.UserID, SessionExpired, "")
	_ = s.db.EndWhatsAppScan(row.UserID)
	return WhatsAppState{Available: true, Status: SessionExpired, SessionName: row.SessionName}, nil
}

func qrFingerprint(img []byte) string {
	sum := sha256.Sum256(img)
	return hex.EncodeToString(sum[:8])
}

// noteQR counts the codes shown to the account. The first code does not count as a change; the one that replaces it does.
// It says whether the limit is reached.
func (s *Service) noteQR(userID int64, img []byte) bool {
	changes, err := s.db.NoteWhatsAppQR(userID, qrFingerprint(img))
	return err == nil && changes >= ScanMaxQRChanges
}

// RestartWhatsApp starts the session of an account over. A session that works is stopped and started again, which keeps
// the phone connected. Any other (failed, expired, still waiting for a scan) is made again from nothing, with a new key and
// a new code, because a session that failed or ended does not come back by being started.
func (s *Service) RestartWhatsApp(ctx context.Context, userID int64) (WhatsAppState, error) {
	if !s.ready() {
		return WhatsAppState{}, errors.New("the database is not connected")
	}
	w, err := s.wahaClient()
	if err != nil {
		return WhatsAppState{}, err
	}
	lock := s.sessionLock(userID)
	lock.Lock()
	defer lock.Unlock()
	row, err := s.db.GetWhatsAppSession(userID)
	if err != nil {
		return WhatsAppState{}, err
	}
	if row == nil {
		return WhatsAppState{}, errors.New("press connect first")
	}
	_ = s.db.EndWhatsAppScan(userID)
	row.ScanStartedAt, row.QRChanges, row.QRHash = nil, 0, ""

	if session, err := w.Session(ctx, row.SessionName); err == nil && session.Status == SessionWorking {
		if err := w.StopSession(ctx, row.SessionName); err != nil {
			return WhatsAppState{}, err
		}
		if err := w.StartSession(ctx, row.SessionName); err != nil {
			return WhatsAppState{}, err
		}
		if session, err = w.Session(ctx, row.SessionName); err != nil {
			return WhatsAppState{}, err
		}
		return s.recordSession(ctx, w, row, session)
	}

	// from nothing: the key and the session go, and both are made again
	if row.APIKeyID != "" {
		_ = w.DeleteKey(ctx, row.APIKeyID)
		_ = s.db.SetWhatsAppSessionKey(userID, "", "")
		row.APIKeyID, row.APIKeyEncrypted = "", ""
	}
	if err := w.DeleteSession(ctx, row.SessionName); err != nil {
		return WhatsAppState{}, err
	}
	_ = s.db.DeleteNotifyRecipient(userID, wahaKind)
	_ = s.db.UpdateWhatsAppSession(userID, SessionStopped, "")
	if err := w.CreateSession(ctx, row.SessionName); err != nil {
		return WhatsAppState{}, fmt.Errorf("%w (does the WAHA container reach web.whatsapp.com? check its internet and DNS)", err)
	}
	if _, err := s.sessionClient(ctx, w, row, false); err != nil {
		log.Printf("[notify] the key of the session %s was not made, the panel key is used: %v", row.SessionName, err)
	}
	session, err := w.Session(ctx, row.SessionName)
	if err != nil {
		return WhatsAppState{}, err
	}
	return s.recordSession(ctx, w, row, session)
}
