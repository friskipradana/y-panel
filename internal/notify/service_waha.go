package notify

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// WhatsApp through WAHA: the panel runs one WAHA container, and every account that wants WhatsApp notices connects
// its own phone to a session of that container.

const (
	wahaContainer = "reneo-waha"
	wahaVolume    = "reneo-waha-sessions"
	wahaImage     = "devlikeapro/waha:latest"
	wahaEngine    = "GOWS"
	wahaPort      = 3000
	// the password of the WAHA dashboard, encrypted, kept beside the other settings
	wahaDashboardKey = "waha_dashboard_password"
	// the key WAHA signs what it sends to the panel with, encrypted
	wahaHookKey = "waha_hook_hmac_key"
	wahaStartTimeout = 3 * time.Minute
)

// DockerRun runs the docker command; tests replace it so no container is needed
var DockerRun = func(ctx context.Context, env []string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", args...)
	if env != nil {
		cmd.Env = append(os.Environ(), env...)
	}
	out, err := cmd.CombinedOutput()
	text := strings.TrimSpace(string(out))
	if err != nil {
		if text == "" {
			text = err.Error()
		}
		if i := strings.IndexByte(text, '\n'); i > 0 {
			text = text[:i]
		}
		return text, fmt.Errorf("docker %s: %s", args[0], text)
	}
	return text, nil
}

type wahaConfig struct {
	BaseURL       string `json:"baseUrl"`
	Port          int    `json:"port"`
	Image         string `json:"image"`
	Engine        string `json:"engine"`
	DashboardUser string `json:"dashboardUser"`
}

// WahaView is the runtime as the owner sees it. The API key is never in it.
type WahaView struct {
	// State is off, starting, running, stopped or error
	State             string `json:"state"`
	Enabled           bool   `json:"enabled"`
	Image             string `json:"image"`
	Engine            string `json:"engine"`
	Version           string `json:"version"`
	Sessions          int    `json:"sessions"`
	LastError         string `json:"lastError"`
	DashboardURL      string `json:"dashboardUrl"`
	DashboardUser     string `json:"dashboardUser"`
	DashboardPassword string `json:"dashboardPassword"`
}

type wahaRuntime struct {
	mu       sync.Mutex
	starting bool
}

func (s *Service) wahaRow() (*database.NotifyChannel, wahaConfig, error) {
	row, err := s.db.GetNotifyChannel(wahaKind)
	var cfg wahaConfig
	if err != nil || row == nil {
		return nil, cfg, err
	}
	_ = json.Unmarshal(row.Config, &cfg)
	return row, cfg, nil
}

func (s *Service) wahaKey(row *database.NotifyChannel) (string, error) {
	if row == nil || row.SecretEncrypted == "" {
		return "", errors.New("WhatsApp is not set up")
	}
	key, err := crypto.Decrypt(s.key, row.SecretEncrypted)
	if err != nil {
		return "", errors.New("the stored WAHA key cannot be decrypted")
	}
	return key, nil
}

// WahaStatus reads the container and WAHA itself
func (s *Service) WahaStatus(ctx context.Context) (WahaView, error) {
	view := WahaView{State: "off", Image: wahaImage, Engine: wahaEngine}
	if !s.ready() {
		return view, errors.New("the database is not connected")
	}
	row, cfg, err := s.wahaRow()
	if err != nil || row == nil {
		return view, err
	}
	view.Enabled = row.Enabled
	view.LastError = row.LastError
	if cfg.Image != "" {
		view.Image = cfg.Image
	}
	if cfg.Engine != "" {
		view.Engine = cfg.Engine
	}
	view.DashboardUser = cfg.DashboardUser
	if cfg.Port > 0 {
		view.DashboardURL = fmt.Sprintf("http://127.0.0.1:%d/dashboard", cfg.Port)
	}
	if raw, _ := s.db.GetNotifySetting(wahaDashboardKey); raw != "" {
		view.DashboardPassword, _ = crypto.Decrypt(s.key, raw)
	}
	switch {
	case s.waha.isStarting():
		view.State = "starting"
	case row.Status == "error" && !row.Enabled:
		view.State = "error"
	case !row.Enabled:
		view.State = "stopped"
	default:
		view.State = "error"
		key, err := s.wahaKey(row)
		if err != nil {
			view.LastError = err.Error()
			return view, nil
		}
		client := NewWaha(cfg.BaseURL, key)
		if version, engine, err := client.Version(ctx); err == nil {
			view.State, view.Version = "running", version
			if engine != "" {
				view.Engine = engine
			}
			view.LastError = ""
			if n, err := client.Sessions(ctx); err == nil {
				view.Sessions = n
			}
		} else if view.LastError == "" {
			view.LastError = err.Error()
		}
	}
	return view, nil
}

func (r *wahaRuntime) isStarting() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.starting
}

func (r *wahaRuntime) begin() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.starting {
		return false
	}
	r.starting = true
	return true
}

func (r *wahaRuntime) end() {
	r.mu.Lock()
	r.starting = false
	r.mu.Unlock()
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

// EnableWaha creates the container and starts it. The image can take minutes to pull, so this returns at once and the
// state ("starting", then "running" or "error") is read from WahaStatus. Pressing it twice starts it once.
func (s *Service) EnableWaha() error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	if !s.waha.begin() {
		return nil
	}
	row, cfg, err := s.wahaRow()
	if err != nil {
		s.waha.end()
		return err
	}
	var key string
	encrypted := (*string)(nil)
	if row == nil || row.SecretEncrypted == "" {
		key = randomHex(24)
		enc, err := crypto.Encrypt(s.key, key)
		if err != nil {
			s.waha.end()
			return err
		}
		encrypted = &enc
	} else if key, err = s.wahaKey(row); err != nil {
		s.waha.end()
		return err
	}
	if cfg.Port == 0 {
		if cfg.Port, err = freePort(); err != nil {
			s.waha.end()
			return err
		}
	}
	cfg.BaseURL = fmt.Sprintf("http://127.0.0.1:%d", cfg.Port)
	if s.wahaBase != "" {
		cfg.BaseURL = s.wahaBase
	}
	cfg.Image, cfg.Engine, cfg.DashboardUser = wahaImage, wahaEngine, "reneo"
	password := ""
	if raw, _ := s.db.GetNotifySetting(wahaDashboardKey); raw != "" {
		password, _ = crypto.Decrypt(s.key, raw)
	}
	if password == "" {
		password = randomHex(12)
		enc, err := crypto.Encrypt(s.key, password)
		if err != nil {
			s.waha.end()
			return err
		}
		if err := s.db.SetNotifySetting(wahaDashboardKey, enc); err != nil {
			s.waha.end()
			return err
		}
	}
	config, _ := json.Marshal(cfg)
	if err := s.db.SaveNotifyChannel(wahaKind, true, config, encrypted, "starting", ""); err != nil {
		s.waha.end()
		return err
	}
	s.invalidate()
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer s.waha.end()
		ctx, cancel := context.WithTimeout(context.Background(), wahaStartTimeout)
		defer cancel()
		if err := s.runWahaContainer(ctx, cfg, key, password); err != nil {
			log.Printf("[notify] WAHA did not start: %v", err)
			_ = s.db.SaveNotifyChannel(wahaKind, false, config, nil, "error", err.Error())
			s.invalidate()
			return
		}
		_ = s.db.SaveNotifyChannel(wahaKind, true, config, nil, "active", "")
		s.invalidate()
	}()
	return nil
}

func (s *Service) runWahaContainer(ctx context.Context, cfg wahaConfig, key, dashboardPassword string) error {
	if out, err := DockerRun(ctx, nil, "pull", cfg.Image); err != nil {
		return fmt.Errorf("the WAHA image could not be pulled: %s", out)
	}
	_, _ = DockerRun(ctx, nil, "rm", "-f", wahaContainer)
	args := []string{
		"run", "-d", "--name", wahaContainer, "--restart", "unless-stopped",
		// only the agent can reach it: the port is on the loopback address
		"-p", fmt.Sprintf("127.0.0.1:%d:%d", cfg.Port, wahaPort),
		"-v", wahaVolume + ":/app/.sessions",
		"--label", "panel.source=waha",
		"-e", "WAHA_API_KEY",
		"-e", "WHATSAPP_DEFAULT_ENGINE",
		"-e", "WAHA_DASHBOARD_ENABLED",
		"-e", "WAHA_DASHBOARD_USERNAME",
		"-e", "WAHA_DASHBOARD_PASSWORD",
		"-e", "WHATSAPP_SWAGGER_ENABLED",
	}
	env := []string{
		"WAHA_API_KEY=" + key, "WHATSAPP_DEFAULT_ENGINE=" + cfg.Engine, "WAHA_DASHBOARD_ENABLED=true",
		"WAHA_DASHBOARD_USERNAME=" + cfg.DashboardUser, "WAHA_DASHBOARD_PASSWORD=" + dashboardPassword,
		"WHATSAPP_SWAGGER_ENABLED=false",
	}
	// answers people send ("stop") reach the panel through a webhook signed with a key only the two know
	if hook := s.hookURL(); hook != "" {
		hmacKey := s.settingDecrypted(wahaHookKey)
		if hmacKey == "" {
			hmacKey = randomHex(24)
			if enc, err := crypto.Encrypt(s.key, hmacKey); err == nil {
				_ = s.db.SetNotifySetting(wahaHookKey, enc)
			}
		}
		args = append(args, "--add-host", "host.docker.internal:host-gateway",
			"-e", "WHATSAPP_HOOK_URL", "-e", "WHATSAPP_HOOK_EVENTS", "-e", "WHATSAPP_HOOK_HMAC_KEY")
		env = append(env, "WHATSAPP_HOOK_URL="+hook, "WHATSAPP_HOOK_EVENTS=message", "WHATSAPP_HOOK_HMAC_KEY="+hmacKey)
	}
	args = append(args, cfg.Image)
	if out, err := DockerRun(ctx, env, args...); err != nil {
		return fmt.Errorf("the WAHA container could not be created: %s", out)
	}
	client := NewWaha(cfg.BaseURL, key)
	for {
		if _, _, err := client.Version(ctx); err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return errors.New("WAHA did not answer in time")
		case <-time.After(2 * time.Second):
		}
	}
}

// DisableWaha stops the container and keeps the sessions on disk, so switching it on again needs no new scan
func (s *Service) DisableWaha(ctx context.Context) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	row, _, err := s.wahaRow()
	if err != nil || row == nil {
		return err
	}
	if out, err := DockerRun(ctx, nil, "stop", wahaContainer); err != nil && !strings.Contains(out, "No such container") {
		return err
	}
	if err := s.db.SaveNotifyChannel(wahaKind, false, row.Config, nil, "stopped", ""); err != nil {
		return err
	}
	s.invalidate()
	return nil
}

// RestartWaha restarts the container of a WAHA that is on
func (s *Service) RestartWaha(ctx context.Context) error {
	row, _, err := s.wahaRow()
	if err != nil {
		return err
	}
	if row == nil || !row.Enabled {
		return errors.New("switch WhatsApp on first")
	}
	_, err = DockerRun(ctx, nil, "restart", wahaContainer)
	return err
}

// ─── The session of an account ───────────────────────────────────────────────

// WhatsAppState is the session of an account as it sees it
type WhatsAppState struct {
	// Available: the owner switched WhatsApp on and it answers
	Available   bool   `json:"available"`
	Status      string `json:"status"`
	Connected   bool   `json:"connected"`
	Phone       string `json:"phone"`
	SessionName string `json:"sessionName"`
}

func (s *Service) sessionLock(userID int64) *sync.Mutex {
	s.sessMu.Lock()
	defer s.sessMu.Unlock()
	if s.sessLocks == nil {
		s.sessLocks = map[int64]*sync.Mutex{}
	}
	m := s.sessLocks[userID]
	if m == nil {
		m = &sync.Mutex{}
		s.sessLocks[userID] = m
	}
	return m
}

func (s *Service) wahaClient() (*Waha, error) {
	s.chMu.Lock()
	ch, err := s.buildLocked(wahaKind, true)
	s.chMu.Unlock()
	if err != nil {
		return nil, err
	}
	w, ok := ch.(*WahaChannel)
	if !ok || w == nil {
		return nil, errors.New("WhatsApp is not switched on")
	}
	return w.Waha, nil
}

// ConnectWhatsApp gives the account its session and starts it, ready to scan. Pressing it twice, or from two devices,
// is one session: the account is the key of the row and of the lock.
func (s *Service) ConnectWhatsApp(ctx context.Context, userID int64, role, username string) (WhatsAppState, error) {
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
	row, err := s.db.EnsureWhatsAppSession(userID, SessionName(role, username))
	if err != nil {
		return WhatsAppState{}, err
	}
	if err := w.CreateSession(ctx, row.SessionName); err != nil {
		return WhatsAppState{}, err
	}
	session, err := w.Session(ctx, row.SessionName)
	if err != nil {
		return WhatsAppState{}, err
	}
	if session.Status == SessionStopped || session.Status == SessionFailed {
		if err := w.StartSession(ctx, row.SessionName); err != nil {
			return WhatsAppState{}, err
		}
		if session, err = w.Session(ctx, row.SessionName); err != nil {
			return WhatsAppState{}, err
		}
	}
	return s.recordSession(userID, row.SessionName, session)
}

// recordSession keeps what WAHA said, and when the phone is connected makes its number the place of the notices
func (s *Service) recordSession(userID int64, name string, session *WahaSession) (WhatsAppState, error) {
	phone := session.Phone()
	if err := s.db.UpdateWhatsAppSession(userID, session.Status, phone); err != nil {
		return WhatsAppState{}, err
	}
	state := WhatsAppState{Available: true, Status: session.Status, SessionName: name, Phone: phone}
	if session.Status == SessionWorking && phone != "" {
		if err := s.db.ConnectNotifyRecipient(userID, wahaKind, phone); err != nil {
			return state, err
		}
		state.Connected = true
	}
	return state, nil
}

// WhatsAppStatus asks WAHA where the account's session is; the page asks every few seconds while it waits for the scan
func (s *Service) WhatsAppStatus(ctx context.Context, userID int64) (WhatsAppState, error) {
	if !s.ready() {
		return WhatsAppState{}, errors.New("the database is not connected")
	}
	w, err := s.wahaClient()
	if err != nil {
		return WhatsAppState{Status: SessionStopped}, nil
	}
	row, err := s.db.GetWhatsAppSession(userID)
	if err != nil || row == nil {
		return WhatsAppState{Available: true, Status: SessionStopped}, err
	}
	session, err := w.Session(ctx, row.SessionName)
	if errors.Is(err, ErrNoSession) {
		// WAHA lost it (the container was recreated without its volume): the account connects again
		_ = s.db.UpdateWhatsAppSession(userID, SessionStopped, "")
		_ = s.db.DeleteNotifyRecipient(userID, wahaKind)
		return WhatsAppState{Available: true, Status: SessionStopped, SessionName: row.SessionName}, nil
	}
	if err != nil {
		return WhatsAppState{}, err
	}
	return s.recordSession(userID, row.SessionName, session)
}

// WhatsAppQR is the code to scan; only while the session waits for it
func (s *Service) WhatsAppQR(ctx context.Context, userID int64) ([]byte, string, error) {
	if !s.ready() {
		return nil, "", errors.New("the database is not connected")
	}
	w, err := s.wahaClient()
	if err != nil {
		return nil, "", err
	}
	row, err := s.db.GetWhatsAppSession(userID)
	if err != nil {
		return nil, "", err
	}
	if row == nil {
		return nil, "", errors.New("press connect first")
	}
	return w.QR(ctx, row.SessionName)
}

// DisconnectWhatsApp logs the phone out, removes the session, and stops the notices to it
func (s *Service) DisconnectWhatsApp(ctx context.Context, userID int64) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	lock := s.sessionLock(userID)
	lock.Lock()
	defer lock.Unlock()
	row, err := s.db.GetWhatsAppSession(userID)
	if err != nil {
		return err
	}
	if row != nil {
		if w, err := s.wahaClient(); err == nil {
			if err := w.DeleteSession(ctx, row.SessionName); err != nil {
				return err
			}
		}
	}
	if err := s.db.DeleteNotifyRecipient(userID, wahaKind); err != nil {
		return err
	}
	return s.db.DeleteWhatsAppSession(userID)
}

// SessionOf is the name of the session of an account, for the channel
func (s *Service) sessionOf(userID int64) (string, error) {
	row, err := s.db.GetWhatsAppSession(userID)
	if err != nil || row == nil {
		return "", err
	}
	return row.SessionName, nil
}

// BuyerWhatsAppReady says whether a notice to a buyer can go out through WAHA: it is on and a superadmin's session is connected
func (s *Service) BuyerWhatsAppReady() bool {
	if !s.ready() {
		return false
	}
	row, err := s.db.GetNotifyChannel(wahaKind)
	if err != nil || row == nil || !row.Enabled {
		return false
	}
	id, err := s.db.WhatsAppSenderID()
	return err == nil && id > 0
}

// SetInboundBase tells the service the address WAHA can reach the panel at, from inside its container, for the
// webhook of answers. Empty means the panel is not reachable that way and the container gets no webhook.
func (s *Service) SetInboundBase(url string) {
	s.chMu.Lock()
	s.inboundURL = strings.TrimRight(url, "/")
	s.chMu.Unlock()
}

func (s *Service) hookURL() string {
	s.chMu.Lock()
	defer s.chMu.Unlock()
	if s.inboundURL == "" {
		return ""
	}
	return s.inboundURL + "/api/v1/public/notify/waha/webhook"
}

// HandleWahaWebhook takes what WAHA sent: the signature (HMAC-SHA512 of the body, with the key only the panel and the
// container know) is checked first and in constant time; then an answer ("stop", "start") from a number is acted on,
// and the reply goes back through the session that received it, if that session is one of ours.
func (s *Service) HandleWahaWebhook(ctx context.Context, body []byte, signature string) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	key := s.settingDecrypted(wahaHookKey)
	if key == "" || signature == "" {
		return ErrBadSignature
	}
	mac := hmac.New(sha512.New, []byte(key))
	mac.Write(body)
	if !hmac.Equal([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(strings.ToLower(strings.TrimSpace(signature)))) {
		return ErrBadSignature
	}
	var event struct {
		Event   string `json:"event"`
		Session string `json:"session"`
		Payload struct {
			From   string `json:"from"`
			FromMe bool   `json:"fromMe"`
			Body   string `json:"body"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		return errors.New("the webhook body cannot be read")
	}
	if event.Event != "message" || event.Payload.FromMe || !strings.HasSuffix(event.Payload.From, "@c.us") {
		return nil
	}
	intent := InboundIntent(event.Payload.Body)
	if intent == "" {
		return nil
	}
	phone := onlyDigits(event.Payload.From)
	reply := s.HandleInbound(wahaKind, phone, intent)
	if reply == "" || !s.sessionExists(event.Session) {
		return nil
	}
	w, err := s.wahaClient()
	if err != nil {
		return nil
	}
	_, _ = w.SendText(ctx, event.Session, phone, reply)
	return nil
}

func (s *Service) sessionExists(name string) bool {
	ok, err := s.db.WhatsAppSessionNamed(name)
	return err == nil && ok
}
