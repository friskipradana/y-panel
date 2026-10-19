package notify

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

const (
	telegramKind = "telegram"
	// the id of the next update to read is kept so each message to the bot is read once
	telegramOffsetKey = "telegram_update_offset"
	thresholdsKey     = "thresholds"
	linkLifetime      = 10 * time.Minute
)

// Service is what the rest of the panel talks to: it queues events, owns the worker and the detectors, and sets up
// the channels. A nil Service does nothing, so code and tests that have no notifications need no checks.
type Service struct {
	db     *database.Manager
	key    string
	worker *Worker

	detMu     sync.RWMutex
	detectors map[string]*Detector

	chMu   sync.Mutex
	cache  map[string]cachedChannel
	tgBase string
	tgPoll sync.Mutex
	// one reader at a time for the own bot of each account
	botLocks sync.Map
	// WhatsApp: the container being started, and one lock per account for its session
	waha      wahaRuntime
	wahaBase  string
	cloudBase string
	// where WAHA can reach the panel from inside its container, for the webhook of answers
	inboundURL string
	// the address the WAHA dashboard answers on, read from the settings and kept a few seconds
	dashHost   string
	dashHostAt time.Time
	sessMu    sync.Mutex
	sessLocks map[int64]*sync.Mutex
	stopSwp   chan struct{}
	wg        sync.WaitGroup
	now       func() time.Time
}

type cachedChannel struct {
	ch   Channel
	at   time.Time
	none bool
}

func New(db *database.Manager, encryptionKey string) *Service {
	s := &Service{db: db, key: encryptionKey, detectors: map[string]*Detector{}, cache: map[string]cachedChannel{}, stopSwp: make(chan struct{}), now: time.Now}
	for event, cfg := range DefaultDetectors() {
		s.detectors[event] = NewDetector(cfg)
	}
	return s
}

// UseTelegramBase points Telegram calls at another address; tests use it
func (s *Service) UseTelegramBase(base string) {
	s.chMu.Lock()
	s.tgBase = base
	s.cache = map[string]cachedChannel{}
	s.chMu.Unlock()
}

// SetClock changes what the service takes as now; tests use it to let a wait for a scan run out
func (s *Service) SetClock(now func() time.Time) {
	s.chMu.Lock()
	s.now = now
	s.chMu.Unlock()
}

// UseCloudBase points WhatsApp Cloud calls at another address; tests use it
func (s *Service) UseCloudBase(base string) {
	s.chMu.Lock()
	s.cloudBase = base
	s.cache = map[string]cachedChannel{}
	s.chMu.Unlock()
}

// UseWahaBase points WhatsApp calls at another address; tests use it
func (s *Service) UseWahaBase(base string) {
	s.chMu.Lock()
	s.wahaBase = base
	s.cache = map[string]cachedChannel{}
	s.chMu.Unlock()
}

// Start loads the settings of the detectors and starts the workers and the sweep of the detectors
func (s *Service) Start(workers int) {
	if s == nil || s.db == nil {
		return
	}
	if err := s.LoadDetectors(); err != nil {
		log.Printf("[notify] the saved thresholds are not used: %v", err)
	}
	s.worker = NewWorker(s.db, workers, s.Channel)
	s.worker.ownChannel = s.OwnChannel
	s.worker.Start()
	s.wg.Add(3)
	go s.sweepLoop()
	go s.telegramLoop()
	go s.ownBotLoop()
}

func (s *Service) Stop() {
	if s == nil {
		return
	}
	select {
	case <-s.stopSwp:
	default:
		close(s.stopSwp)
	}
	s.wg.Wait()
	if s.worker != nil {
		s.worker.Stop()
	}
}

func (s *Service) ready() bool { return s != nil && s.db != nil && s.db.IsConnected() }

// ─── Channels ─────────────────────────────────────────────────────────────────

// Channel gives the working channel of a kind, or nil when it is switched off or not set up. The answer is kept for ten
// seconds, so a burst of messages does not read and decrypt the token for each one.
func (s *Service) Channel(kind string) (Channel, error) {
	s.chMu.Lock()
	defer s.chMu.Unlock()
	if c, ok := s.cache[kind]; ok && s.now().Sub(c.at) < 10*time.Second {
		if c.none {
			return nil, nil
		}
		return c.ch, nil
	}
	ch, err := s.buildLocked(kind, true)
	if err != nil {
		return nil, err
	}
	s.cache[kind] = cachedChannel{ch: ch, at: s.now(), none: ch == nil}
	return ch, nil
}

// buildLocked makes the channel from what is stored. onlyEnabled false is for setting up a channel before it is on.
func (s *Service) buildLocked(kind string, onlyEnabled bool) (Channel, error) {
	row, err := s.db.GetNotifyChannel(kind)
	if err != nil {
		return nil, err
	}
	if row == nil || row.SecretEncrypted == "" || (onlyEnabled && !row.Enabled) {
		return nil, nil
	}
	secret, err := crypto.Decrypt(s.key, row.SecretEncrypted)
	if err != nil {
		return nil, errors.New("the stored token cannot be decrypted")
	}
	switch kind {
	case telegramKind:
		t := NewTelegram(secret)
		if s.tgBase != "" {
			t.WithBase(s.tgBase)
		}
		return t, nil
	case cloudKind:
		var cfg cloudConfig
		_ = json.Unmarshal(row.Config, &cfg)
		if cfg.PhoneID == "" {
			return nil, nil
		}
		c := NewWhatsAppCloud(secret, cfg.PhoneID, cfg.WABAID, cfg.Version)
		if s.cloudBase != "" {
			c.WithBase(s.cloudBase)
		}
		return c, nil
	case wahaKind:
		var cfg wahaConfig
		_ = json.Unmarshal(row.Config, &cfg)
		if cfg.BaseURL == "" {
			return nil, nil
		}
		return NewWahaChannel(NewWaha(cfg.BaseURL, secret), s.sendFromSession), nil
	}
	return nil, fmt.Errorf("unknown channel %q", kind)
}

func (s *Service) invalidate() {
	s.chMu.Lock()
	s.cache = map[string]cachedChannel{}
	s.chMu.Unlock()
}

// ChannelView is a channel as the owner sees it: never the token, only whether there is one
type ChannelView struct {
	Kind        string     `json:"kind"`
	Enabled     bool       `json:"enabled"`
	Configured  bool       `json:"configured"`
	Status      string     `json:"status"`
	LastError   string     `json:"lastError"`
	CheckedAt   *time.Time `json:"checkedAt"`
	BotUsername string     `json:"botUsername,omitempty"`
	BotName     string     `json:"botName,omitempty"`
	// the number WhatsApp Cloud sends from, and the name Meta verified for it
	Phone     string `json:"phone,omitempty"`
	PhoneName string `json:"phoneName,omitempty"`
	PhoneID   string `json:"phoneId,omitempty"`
	WABAID    string `json:"wabaId,omitempty"`
}

func (s *Service) ChannelViews() ([]ChannelView, error) {
	views := []ChannelView{{Kind: telegramKind, Status: "unconfigured"}, {Kind: wahaKind, Status: "unconfigured"}, {Kind: cloudKind, Status: "unconfigured"}}
	for i := range views {
		row, err := s.db.GetNotifyChannel(views[i].Kind)
		if err != nil {
			return nil, err
		}
		if row == nil {
			continue
		}
		var cfg struct {
			BotUsername string `json:"botUsername"`
			BotName     string `json:"botName"`
			PhoneID     string `json:"phoneId"`
			WABAID      string `json:"wabaId"`
			Phone       string `json:"phone"`
			PhoneName   string `json:"phoneName"`
		}
		_ = json.Unmarshal(row.Config, &cfg)
		views[i] = ChannelView{Kind: row.Kind, Enabled: row.Enabled, Configured: row.SecretEncrypted != "", Status: row.Status,
			LastError: row.LastError, CheckedAt: row.CheckedAt, BotUsername: cfg.BotUsername, BotName: cfg.BotName,
			Phone: cfg.Phone, PhoneName: cfg.PhoneName, PhoneID: cfg.PhoneID, WABAID: cfg.WABAID}
	}
	return views, nil
}

// ConfigureTelegram saves the bot token (checked with Telegram first) and whether the channel is on. A nil token keeps the saved one.
func (s *Service) ConfigureTelegram(ctx context.Context, token *string, enabled bool) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	row, err := s.db.GetNotifyChannel(telegramKind)
	if err != nil {
		return err
	}
	if token == nil {
		if row == nil || row.SecretEncrypted == "" {
			return errors.New("enter the bot token first")
		}
		// without a new token only the switch changes
		if err := s.db.SaveNotifyChannel(telegramKind, enabled, row.Config, nil, row.Status, row.LastError); err != nil {
			return err
		}
		s.invalidate()
		return nil
	}
	t := NewTelegram(*token)
	if s.tgBase != "" {
		t.WithBase(s.tgBase)
	}
	bot, err := t.GetMe(ctx)
	if err != nil {
		return fmt.Errorf("Telegram did not accept this token: %w", err)
	}
	encrypted, err := crypto.Encrypt(s.key, strings.TrimSpace(*token))
	if err != nil {
		return err
	}
	config, _ := json.Marshal(map[string]string{"botUsername": bot.Username, "botName": bot.Name})
	if err := s.db.SaveNotifyChannel(telegramKind, enabled, config, &encrypted, "active", ""); err != nil {
		return err
	}
	s.invalidate()
	return nil
}

// ─── Queueing ─────────────────────────────────────────────────────────────────

// Emit queues an event for everyone it concerns who has a channel that is on, and wakes the worker so it leaves at once.
// It never fails the caller: a notice that cannot be queued is logged and the work that caused it goes on.
func (s *Service) Emit(e Event) {
	if !s.ready() {
		return
	}
	if !Known(e.Name) {
		log.Printf("[notify] unknown event %q dropped", e.Name)
		return
	}
	if Group(e.Name) == "buyer" {
		s.emitBuyer(e)
		return
	}
	ids := e.UserIDs
	if len(ids) == 0 {
		var err error
		if ids, err = s.db.ActiveSuperadminIDs(); err != nil {
			log.Printf("[notify] cannot find the seller: %v", err)
			return
		}
	}
	targets, err := s.db.NotifyTargets(ids)
	if err != nil {
		log.Printf("[notify] cannot find where to send %s: %v", e.Name, err)
		return
	}
	payload, _ := json.Marshal(e.Data)
	key := e.Key
	if key == "" {
		key = "once-" + randomHex(8)
	}
	queued := false
	for _, t := range targets {
		if IsMuted(t.MutedEvents, e.Name) {
			continue
		}
		_, created, err := s.db.EnqueueOutbox(database.OutboxMessage{
			Event: e.Name, UserID: t.UserID, Kind: t.Kind, Address: t.Address, Payload: payload,
			Key: fmt.Sprintf("%s|%s|%d|%s", e.Name, key, t.UserID, t.Kind), Priority: PriorityOf(e.Name),
		})
		if err != nil {
			log.Printf("[notify] could not queue %s for account %d: %v", e.Name, t.UserID, err)
			continue
		}
		queued = queued || created
	}
	if queued && s.worker != nil {
		s.worker.Wake()
	}
}

// buyerDailyCap is how many notices an unverified number gets from sessions that are not its own in a day
const buyerDailyCap = 3

// emitBuyer tells a buyer about their order on WhatsApp. The number is the one from the order form, kept under the
// channel that was on when they ordered. Through WAHA, when the buyer has not connected their own WhatsApp it is sent
// from the superadmin's session; either way an unverified number gets at most buyerDailyCap notices a day.
func (s *Service) emitBuyer(e Event) {
	key := e.Key
	if key == "" {
		key = "once-" + randomHex(8)
	}
	queued := false
	for _, id := range e.UserIDs {
		for _, kind := range []string{wahaKind, cloudKind} {
			row, err := s.db.GetNotifyChannel(kind)
			if err != nil || row == nil || !row.Enabled {
				continue
			}
			rec, err := s.db.GetNotifyRecipient(id, kind)
			if err != nil || rec == nil || rec.Address == "" || rec.BlockedAt != nil || IsMuted(rec.MutedEvents, e.Name) {
				continue
			}
			if out, _ := s.db.IsNotifyOptedOut(kind, rec.Address); out {
				continue
			}
			var sender int64
			if kind == wahaKind {
				own, _ := s.db.GetWhatsAppSession(id)
				if rec.VerifiedAt == nil || own == nil || own.Status != SessionWorking {
					// not their own phone: a superadmin's connected session sends it
					if sender, err = s.db.WhatsAppSenderID(); err != nil || sender == 0 {
						log.Printf("[notify] no connected WhatsApp session to tell the buyer %d about %s", id, e.Name)
						continue
					}
				}
			}
			if rec.VerifiedAt == nil {
				if n, err := s.db.CountBuyerNotices(kind, rec.Address, s.now().Add(-24*time.Hour)); err == nil && n >= buyerDailyCap {
					log.Printf("[notify] the number of buyer %d has had %d notices today; %s is not sent", id, n, e.Name)
					continue
				}
			}
			_, created, err := s.db.EnqueueOutbox(database.OutboxMessage{
				Event: e.Name, UserID: id, Kind: kind, Address: rec.Address, Payload: mustJSON(e.Data),
				Key: fmt.Sprintf("%s|%s|%d|%s", e.Name, key, id, kind), Priority: PriorityOf(e.Name), SenderUserID: sender,
			})
			if err != nil {
				log.Printf("[notify] could not queue %s for buyer %d: %v", e.Name, id, err)
				continue
			}
			queued = queued || created
		}
	}
	if queued && s.worker != nil {
		s.worker.Wake()
	}
}

func mustJSON(v any) json.RawMessage {
	raw, _ := json.Marshal(v)
	return raw
}

// SendTest queues a test message to the account's own Telegram, through the same queue as everything else
func (s *Service) SendTest(userID int64) (int64, error) { return s.SendTestVia(userID, telegramKind) }

// SendTestVia queues a test message to the account's own place on a channel
func (s *Service) SendTestVia(userID int64, kind string) (int64, error) {
	if !s.ready() {
		return 0, errors.New("the database is not connected")
	}
	rec, err := s.db.GetNotifyRecipient(userID, kind)
	if err != nil {
		return 0, err
	}
	if rec == nil || rec.VerifiedAt == nil || rec.Address == "" || rec.BlockedAt != nil {
		return 0, errors.New("connect first")
	}
	id, _, err := s.db.EnqueueOutbox(database.OutboxMessage{
		Event: EventTest, UserID: userID, Kind: kind, Address: rec.Address, Payload: json.RawMessage(`{}`),
		Key: "test|" + randomHex(8), Priority: PriorityUrgent,
	})
	if err == nil && s.worker != nil {
		s.worker.Wake()
	}
	return id, err
}

// Wake lets a caller that put a message in the queue itself (a retry button) have it sent at once
func (s *Service) Wake() {
	if s != nil && s.worker != nil {
		s.worker.Wake()
	}
}

func randomHex(n int) string {
	raw := make([]byte, n)
	_, _ = rand.Read(raw)
	return hex.EncodeToString(raw)
}

// ─── Linking an account to Telegram ───────────────────────────────────────────

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// NewLinkCode is eight characters, without the ones that look alike
func NewLinkCode() string {
	raw := make([]byte, 8)
	_, _ = rand.Read(raw)
	out := make([]byte, 8)
	for i, b := range raw {
		out[i] = codeAlphabet[int(b)%len(codeAlphabet)]
	}
	return string(out)
}

// Link is what the person needs to link their Telegram: open the address and press Start
type Link struct {
	Code      string    `json:"code"`
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (s *Service) StartTelegramLink(userID int64) (*Link, error) {
	// an account that brought its own bot links through it
	if _, bot, err := s.ownTelegram(userID); err != nil {
		return nil, err
	} else if bot != nil && bot.BotUsername != "" {
		code := NewLinkCode()
		if err := s.db.StartNotifyLink(userID, telegramKind, code, linkLifetime); err != nil {
			return nil, err
		}
		return &Link{Code: code, URL: "https://t.me/" + bot.BotUsername + "?start=" + code, ExpiresAt: s.now().Add(linkLifetime)}, nil
	}
	row, err := s.db.GetNotifyChannel(telegramKind)
	if err != nil {
		return nil, err
	}
	var cfg struct {
		BotUsername string `json:"botUsername"`
	}
	if row == nil || row.SecretEncrypted == "" || json.Unmarshal(row.Config, &cfg) != nil || cfg.BotUsername == "" {
		return nil, errors.New("set up the Telegram bot first")
	}
	code := NewLinkCode()
	if err := s.db.StartNotifyLink(userID, telegramKind, code, linkLifetime); err != nil {
		return nil, err
	}
	return &Link{Code: code, URL: "https://t.me/" + cfg.BotUsername + "?start=" + code, ExpiresAt: s.now().Add(linkLifetime)}, nil
}

// CheckTelegramLink reads what was sent to the bot and completes every link whose code arrived. It says whether this
// account is now linked. Reading is one at a time, and each message is read once.
func (s *Service) CheckTelegramLink(ctx context.Context, userID int64) (bool, error) {
	if tg, _, err := s.ownTelegram(userID); err != nil {
		return false, err
	} else if tg != nil {
		if err := s.readOwnTelegram(ctx, userID); err != nil {
			return false, err
		}
	} else if err := s.readTelegram(ctx); err != nil {
		return false, err
	}
	rec, err := s.db.GetNotifyRecipient(userID, telegramKind)
	if err != nil {
		return false, err
	}
	return rec != nil && rec.VerifiedAt != nil && rec.LinkCode == "", nil
}

// ─── Detectors ────────────────────────────────────────────────────────────────

// LoadDetectors puts the saved thresholds on the detectors
func (s *Service) LoadDetectors() error {
	raw, err := s.db.GetNotifySetting(thresholdsKey)
	if err != nil {
		return err
	}
	stored := map[string]DetectorConfig{}
	if raw != "" {
		if err := json.Unmarshal([]byte(raw), &stored); err != nil {
			return err
		}
	}
	merged, err := MergeDetectors(stored)
	if err != nil {
		merged = DefaultDetectors()
	}
	s.applyDetectors(merged)
	return err
}

func (s *Service) applyDetectors(cfgs map[string]DetectorConfig) {
	s.detMu.Lock()
	defer s.detMu.Unlock()
	for event, cfg := range cfgs {
		if d, ok := s.detectors[event]; ok {
			d.SetConfig(cfg)
		}
	}
}

// Thresholds are the settings in force, in the order they are shown
func (s *Service) Thresholds() []DetectorConfig {
	s.detMu.RLock()
	defer s.detMu.RUnlock()
	cfgs := map[string]DetectorConfig{}
	for event, d := range s.detectors {
		cfgs[event] = d.Config()
	}
	return SortedDetectors(cfgs)
}

// SaveThresholds checks and saves changed settings and applies them at once
func (s *Service) SaveThresholds(changed []DetectorConfig) error {
	cfgs := map[string]DetectorConfig{}
	for _, cfg := range s.Thresholds() {
		cfgs[cfg.Event] = cfg
	}
	for _, cfg := range changed {
		base, ok := cfgs[cfg.Event]
		if !ok {
			return fmt.Errorf("%s is not a detector", cfg.Event)
		}
		base.Levels, base.WindowSec, base.CooldownSec, base.QuietSec, base.MinDistinct = cfg.Levels, cfg.WindowSec, cfg.CooldownSec, cfg.QuietSec, cfg.MinDistinct
		cfgs[cfg.Event] = base
	}
	encoded, err := EncodeDetectors(cfgs)
	if err != nil {
		return err
	}
	if encoded == "" {
		err = s.db.DeleteNotifySetting(thresholdsKey)
	} else {
		err = s.db.SetNotifySetting(thresholdsKey, encoded)
	}
	if err != nil {
		return err
	}
	merged, err := MergeDetectors(decodeStored(encoded))
	if err != nil {
		return err
	}
	s.applyDetectors(merged)
	return nil
}

func decodeStored(encoded string) map[string]DetectorConfig {
	stored := map[string]DetectorConfig{}
	if encoded != "" {
		_ = json.Unmarshal([]byte(encoded), &stored)
	}
	return stored
}

// ResetThresholds goes back to the defaults
func (s *Service) ResetThresholds() error {
	if err := s.db.DeleteNotifySetting(thresholdsKey); err != nil {
		return err
	}
	s.applyDetectors(DefaultDetectors())
	return nil
}

func (s *Service) detector(event string) *Detector {
	s.detMu.RLock()
	defer s.detMu.RUnlock()
	return s.detectors[event]
}

// LoginFailed counts a failed sign-in to an account name from an address. One failure is only counted; a message goes
// out when the failures pile up (to the owner of the account), and when one address tries many names or many
// addresses fail together (to the seller).
func (s *Service) LoginFailed(username, ip string) {
	if s == nil {
		return
	}
	name := strings.ToLower(strings.TrimSpace(username))
	if name != "" {
		s.alert(s.detector(EventLoginFailed).Record(name, ip))
		s.alert(s.detector(EventAccountScan).Record(ip, name))
	}
	s.alert(s.detector(EventLoginFlood).Record("*", ip))
}

// LoginLocked counts a sign-in refused because the account is locked for too many failures
func (s *Service) LoginLocked(username string) {
	if s == nil {
		return
	}
	s.alert(s.detector(EventLoginLocked).Record(strings.ToLower(strings.TrimSpace(username)), ""))
}

// RequestRefused counts a request the rate limit refused
func (s *Service) RequestRefused(ip string) {
	if s != nil {
		s.alert(s.detector(EventRequestFlood).Record("*", ip))
	}
}

// OrderRefused counts an order or address check the rate limit refused
func (s *Service) OrderRefused(ip string) {
	if s != nil {
		s.alert(s.detector(EventOrderAbuse).Record("*", ip))
	}
}

// WebhookRejected counts a webhook call with a wrong key
func (s *Service) WebhookRejected(ip string) {
	if s != nil {
		s.alert(s.detector(EventWebhookProbe).Record("*", ip))
	}
}

func (s *Service) alert(a *Alert) {
	if a != nil {
		go s.dispatchAlert(a)
	}
}

func (s *Service) sweepLoop() {
	defer s.wg.Done()
	tick := time.NewTicker(30 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-tick.C:
			s.detMu.RLock()
			dets := make([]*Detector, 0, len(s.detectors))
			for _, d := range s.detectors {
				dets = append(dets, d)
			}
			s.detMu.RUnlock()
			for _, d := range dets {
				for _, a := range d.Sweep() {
					s.dispatchAlert(a)
				}
			}
		case <-s.stopSwp:
			return
		}
	}
}

// dispatchAlert turns the decision to speak into a queued message for the people it concerns
func (s *Service) dispatchAlert(a *Alert) {
	if !s.ready() {
		return
	}
	cfg := s.detector(a.Event).Config()
	// a message sent just before a restart is not sent again by the first alert after it
	if a.Variant == "first" {
		if level, at, ok, err := s.db.AlertSentRecently(a.Event, a.Scope); err == nil && ok && level >= a.Level && s.now().Sub(at) < time.Duration(cfg.CooldownSec)*time.Second {
			return
		}
	}
	data := map[string]any{
		"variant": a.Variant, "level": a.Level, "count": a.Total, "ips": a.Distinct, "since": a.Since, "total": a.Total,
		"minutes": int(a.Window / time.Minute), "samples": strings.Join(a.Samples, ", "), "duration": roundDuration(a.Duration),
	}
	if len(a.Samples) > 0 {
		data["ip"] = a.Samples[len(a.Samples)-1]
	}
	// a scan is counted per address: the address is the scope, and the samples are the names that were tried
	if a.Event == EventAccountScan {
		data["ip"] = a.Scope
	}
	event := Event{Name: a.Event, Data: data, Key: fmt.Sprintf("%s|%d|%s|%d", a.Scope, a.Level, a.Variant, s.now().Unix()/60)}
	if a.Event == EventLoginFailed || a.Event == EventLoginLocked {
		user, err := s.db.GetUserByUsername(a.Scope)
		if err != nil || user == nil {
			// a name that is not an account has no owner to tell
			return
		}
		event.UserIDs = []int64{user.ID}
		data["username"] = user.Username
	}
	s.Emit(event)
	if err := s.db.SaveAlertSent(a.Event, a.Scope, a.Level); err != nil {
		log.Printf("[notify] could not remember the alert %s: %v", a.Event, err)
	}
}

func roundDuration(d time.Duration) string {
	switch {
	case d < time.Minute:
		return "kurang dari 1 menit"
	case d < time.Hour:
		return fmt.Sprintf("%d menit", int(d/time.Minute))
	}
	return fmt.Sprintf("%d jam %d menit", int(d/time.Hour), int(d%time.Hour/time.Minute))
}

// ─── Signing in from a new device ─────────────────────────────────────────────

// Fingerprint names a device: the network of the address and the kind of browser, not the address itself
func Fingerprint(ip, userAgent string) string {
	sum := sha256.Sum256([]byte(ipPrefix(ip) + "|" + Browser(userAgent)))
	return hex.EncodeToString(sum[:12])
}

func ipPrefix(ip string) string {
	parsed := net.ParseIP(strings.TrimSpace(ip))
	if parsed == nil {
		return "unknown"
	}
	if v4 := parsed.To4(); v4 != nil {
		return v4.Mask(net.CIDRMask(24, 32)).String() + "/24"
	}
	return parsed.Mask(net.CIDRMask(48, 128)).String() + "/48"
}

// Browser is the kind of browser and system in a user agent, for the message and the fingerprint
func Browser(userAgent string) string {
	ua := strings.ToLower(userAgent)
	browser := "browser lain"
	switch {
	case strings.Contains(ua, "curl/"), strings.Contains(ua, "wget/"), strings.Contains(ua, "python"), strings.Contains(ua, "go-http-client"):
		browser = "alat baris perintah"
	case strings.Contains(ua, "edg/"):
		browser = "Edge"
	case strings.Contains(ua, "opr/"), strings.Contains(ua, "opera"):
		browser = "Opera"
	case strings.Contains(ua, "firefox/"):
		browser = "Firefox"
	case strings.Contains(ua, "chrome/"), strings.Contains(ua, "crios/"):
		browser = "Chrome"
	case strings.Contains(ua, "safari/"):
		browser = "Safari"
	}
	system := ""
	switch {
	case strings.Contains(ua, "android"):
		system = "Android"
	case strings.Contains(ua, "iphone"), strings.Contains(ua, "ipad"), strings.Contains(ua, "ios"):
		system = "iOS"
	case strings.Contains(ua, "windows"):
		system = "Windows"
	case strings.Contains(ua, "mac os"), strings.Contains(ua, "macintosh"):
		system = "macOS"
	case strings.Contains(ua, "linux"), strings.Contains(ua, "x11"):
		system = "Linux"
	}
	if system == "" {
		return browser
	}
	return browser + " di " + system
}

// SignedIn remembers the device an account signed in from and, when it is one the account had not used (and the account
// had used others), tells the owner
func (s *Service) SignedIn(userID int64, username, ip, userAgent string) {
	if !s.ready() {
		return
	}
	fp := Fingerprint(ip, userAgent)
	isNew, others, err := s.db.TouchKnownDevice(userID, fp)
	if err != nil {
		log.Printf("[notify] could not check the device of account %d: %v", userID, err)
		return
	}
	if !isNew || !others {
		return
	}
	now := s.now()
	s.Emit(Event{
		Name: EventLoginNew, UserIDs: []int64{userID}, Key: fp + "|" + now.Format("2006-01-02"),
		Data: map[string]any{"username": username, "ip": ip, "browser": Browser(userAgent), "time": now.Format(TimeLayout)},
	})
}

// readTelegram reads what was sent to the bot, once, and acts on it: a code completes a link, "stop" switches the
// notices of that chat off, and a plain "/start" switches them on again. One reader at a time.
func (s *Service) readTelegram(ctx context.Context) error {
	s.tgPoll.Lock()
	defer s.tgPoll.Unlock()

	s.chMu.Lock()
	ch, err := s.buildLocked(telegramKind, false)
	s.chMu.Unlock()
	if err != nil {
		return err
	}
	tg, ok := ch.(*Telegram)
	if !ok || tg == nil {
		return errors.New("set up the Telegram bot first")
	}
	offset := int64(0)
	if raw, _ := s.db.GetNotifySetting(telegramOffsetKey); raw != "" {
		offset, _ = strconv.ParseInt(raw, 10, 64)
	}
	updates, err := tg.GetUpdates(ctx, offset)
	if err != nil {
		return err
	}
	next := offset
	for _, u := range updates {
		if u.ID >= next {
			next = u.ID + 1
		}
		if u.Message == nil {
			continue
		}
		chat := strconv.FormatInt(u.Message.Chat.ID, 10)
		if code := StartCode(u.Message.Text); code != "" {
			linked, err := s.db.CompleteNotifyLink(telegramKind, code, chat)
			if err != nil {
				return err
			}
			if linked > 0 {
				// tell the person in Telegram that it worked; failing to is not a failure of the link
				_, _ = tg.Send(ctx, chat, Render(EventTest, "id", nil))
			}
			continue
		}
		if answer := InboundIntent(u.Message.Text); answer != "" {
			if reply := s.HandleInbound(telegramKind, chat, answer); reply != "" {
				_, _ = tg.Send(ctx, chat, reply)
			}
		}
	}
	if next != offset {
		_ = s.db.SetNotifySetting(telegramOffsetKey, strconv.FormatInt(next, 10))
	}
	return nil
}

// telegramLoop keeps reading the bot while Telegram is on, so a "stop" is heard within seconds and not only while a link is waiting
func (s *Service) telegramLoop() {
	defer s.wg.Done()
	tick := time.NewTicker(4 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-s.stopSwp:
			return
		case <-tick.C:
		}
		row, err := s.db.GetNotifyChannel(telegramKind)
		if err != nil || row == nil || !row.Enabled || row.SecretEncrypted == "" {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := s.readTelegram(ctx); err != nil {
			log.Printf("[notify] reading the Telegram bot failed: %v", err)
		}
		cancel()
	}
}
