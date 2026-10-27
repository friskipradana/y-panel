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
	"regexp"
	"runtime"
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
	// the image of the engine only, with no browser: about a gigabyte less than :latest, which also carries Chromium
	wahaImageGOWS = "devlikeapro/waha:gows"
	// there is no GOWS-only image for ARM; the ARM one carries every engine
	wahaImageARM = "devlikeapro/waha:arm"
	wahaEngine    = "GOWS"
	wahaPort      = 3000
	// the password of the WAHA dashboard, encrypted, kept beside the other settings
	wahaDashboardKey = "waha_dashboard_password"
	// the key WAHA signs what it sends to the panel with, encrypted
	wahaHookKey = "waha_hook_hmac_key"
	// the image is over 3 GB: pulling it can take a long time on a slow line, so it has its own, long, limit
	wahaPullTimeout = 40 * time.Minute
	// once the container runs, WAHA answers within a minute or two
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
		return text, fmt.Errorf("docker %s: %s", args[0], lastLines(text, 3))
	}
	return text, nil
}

// lastLines is the end of the output of a command, where docker says what went wrong; the beginning is progress
func lastLines(text string, n int) string {
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			lines = append(lines, line)
		}
	}
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, " | ")
}

var ansiPattern = regexp.MustCompile("\x1b\\[[0-9;]*m")

// tailText is the last n non-empty lines of a log, one to a line, without the colour codes docker passes through
func tailText(text string, n int) string {
	var lines []string
	for _, line := range strings.Split(ansiPattern.ReplaceAllString(text, ""), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			lines = append(lines, line)
		}
	}
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}

// wahaImage is the image to run: the one of the engine alone where it exists (x86), else the ARM one
func wahaImage() string {
	if runtime.GOARCH == "arm64" || runtime.GOARCH == "arm" {
		return wahaImageARM
	}
	return wahaImageGOWS
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
	// What docker says about the container when WAHA does not answer: its state, how it ended, and the last log lines
	ContainerState string `json:"containerState,omitempty"`
	LogTail        string `json:"logTail,omitempty"`
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
	view := WahaView{State: "off", Image: wahaImage(), Engine: wahaEngine}
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
		} else {
			// WAHA does not answer: ask docker why, so a container that is only booting is not shown as a failure
			d := s.diagnoseWaha(ctx)
			view.ContainerState, view.LogTail = d.describe(), d.logs
			switch {
			case d.booting(time.Now()):
				view.State, view.LastError = "starting", ""
			case d.known && view.LastError == "":
				view.LastError = fmt.Sprintf("%s (%v)", d.describe(), err)
			case view.LastError == "":
				view.LastError = err.Error()
			}
		}
	}
	return view, nil
}

// wahaDiagnosis is what docker says about the container of WAHA
type wahaDiagnosis struct {
	known    bool
	status   string // running, restarting, exited, created, ...
	exitCode int
	started  time.Time
	logs     string
}

func (d wahaDiagnosis) describe() string {
	switch {
	case !d.known:
		return ""
	case d.status == "exited" || d.status == "dead":
		return fmt.Sprintf("the container stopped (exit code %d)", d.exitCode)
	case d.status == "restarting":
		return fmt.Sprintf("the container keeps restarting (last exit code %d)", d.exitCode)
	}
	return "the container is " + d.status
}

// booting: the container runs and was started a moment ago, so WAHA is still coming up (it takes up to a minute)
func (d wahaDiagnosis) booting(now time.Time) bool {
	return d.known && d.status == "running" && !d.started.IsZero() && now.Sub(d.started) < 90*time.Second
}

// diagnoseWaha asks docker about the container and reads the end of its log. Without docker, or without the
// container, nothing is known and the answer says so.
func (s *Service) diagnoseWaha(ctx context.Context) wahaDiagnosis {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	out, err := DockerRun(ctx, nil, "inspect", "-f", "{{.State.Status}}|{{.State.ExitCode}}|{{.State.StartedAt}}", wahaContainer)
	if err != nil {
		return wahaDiagnosis{}
	}
	parts := strings.Split(strings.TrimSpace(out), "|")
	if len(parts) != 3 {
		return wahaDiagnosis{}
	}
	d := wahaDiagnosis{known: true, status: parts[0]}
	fmt.Sscanf(parts[1], "%d", &d.exitCode)
	d.started, _ = time.Parse(time.RFC3339Nano, parts[2])
	if logs, err := DockerRun(ctx, nil, "logs", "--tail", "12", wahaContainer); err == nil || logs != "" {
		d.logs = tailText(logs, 12)
	}
	return d
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
	cfg.Image, cfg.Engine, cfg.DashboardUser = wahaImage(), wahaEngine, "reneo"
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
		ctx, cancel := context.WithTimeout(context.Background(), wahaPullTimeout+wahaStartTimeout)
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
	pullCtx, stopPull := context.WithTimeout(ctx, wahaPullTimeout)
	defer stopPull()
	if out, err := DockerRun(pullCtx, nil, "pull", "-q", cfg.Image); err != nil {
		if pullCtx.Err() != nil {
			return fmt.Errorf("the WAHA image (%s, over 3 GB) was not downloaded in %d minutes; try again on a faster line", cfg.Image, int(wahaPullTimeout.Minutes()))
		}
		return fmt.Errorf("the WAHA image %s could not be pulled: %s", cfg.Image, lastLines(out, 3))
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
		return fmt.Errorf("the WAHA container could not be created: %s", lastLines(out, 3))
	}
	client := NewWaha(cfg.BaseURL, key)
	// from here WAHA has to answer soon; the long limit above was for the download
	ctx, stopWait := context.WithTimeout(ctx, wahaStartTimeout)
	defer stopWait()
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

// RecreateWaha makes the container again from the image the host has now, with the same key, login and port: the sessions are in a
// volume, so nobody scans a code again. It is what the update of WAHA does after the new image was downloaded.
func (s *Service) RecreateWaha(ctx context.Context) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	if !s.waha.begin() {
		return errors.New("WAHA is busy starting; try again in a moment")
	}
	defer s.waha.end()
	row, cfg, err := s.wahaRow()
	if err != nil {
		return err
	}
	if row == nil || !row.Enabled {
		return errors.New("switch WhatsApp on first")
	}
	key, err := s.wahaKey(row)
	if err != nil {
		return err
	}
	password := ""
	if raw, _ := s.db.GetNotifySetting(wahaDashboardKey); raw != "" {
		password, _ = crypto.Decrypt(s.key, raw)
	}
	if err := s.runWahaContainer(ctx, cfg, key, password); err != nil {
		_ = s.db.SaveNotifyChannel(wahaKind, false, row.Config, nil, "error", err.Error())
		s.invalidate()
		return err
	}
	_ = s.db.SaveNotifyChannel(wahaKind, true, row.Config, nil, "active", "")
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
		// WAHA starts a session as it makes it, and a container that cannot reach WhatsApp fails here
		return WhatsAppState{}, fmt.Errorf("%w (does the WAHA container reach web.whatsapp.com? check its internet and DNS)", err)
	}
	// from here on the session is worked with its own key
	if _, err := s.sessionClient(ctx, w, row, false); err != nil {
		log.Printf("[notify] the key of the session %s was not made, the panel key is used: %v", row.SessionName, err)
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
	return s.recordSession(ctx, w, row, session)
}

// recordSession keeps what WAHA said, and when the phone is connected makes its number the place of the notices
func (s *Service) recordSession(ctx context.Context, admin *Waha, row *database.WhatsAppSession, session *WahaSession) (WhatsAppState, error) {
	userID, name := row.UserID, row.SessionName
	// a wait for a scan has limits: it ends when it is too long, or when WAHA has shown too many different codes
	switch {
	case session.Status == SessionScanQR && row.ScanStartedAt == nil:
		_ = s.db.StartWhatsAppScan(userID, s.now())
	case session.Status == SessionScanQR && (s.now().Sub(*row.ScanStartedAt) > ScanWindow || row.QRChanges >= ScanMaxQRChanges):
		return s.expireScan(ctx, admin, row)
	case session.Status != SessionScanQR && row.ScanStartedAt != nil:
		_ = s.db.EndWhatsAppScan(userID)
	}
	// the end of a wait stays an end until the account asks to start again
	if row.Status == SessionExpired && session.Status == SessionStopped {
		return WhatsAppState{Available: true, Status: SessionExpired, SessionName: name}, nil
	}
	phone := session.Phone()
	if err := s.db.UpdateWhatsAppSession(userID, session.Status, phone); err != nil {
		return WhatsAppState{}, err
	}
	state := WhatsAppState{Available: true, Status: session.Status, SessionName: name, Phone: phone}
	if session.Status == SessionWorking && phone != "" {
		// the notices go to the number of the session until the account picks another number, which stays picked
		rec, _ := s.db.GetNotifyRecipient(userID, wahaKind)
		if rec == nil || rec.Address == "" || rec.Address == row.Phone {
			if err := s.db.ConnectNotifyRecipient(userID, wahaKind, phone); err != nil {
				return state, err
			}
		}
		state.Connected = true
	}
	return state, nil
}

// SetWhatsAppDestination chooses the number the notices of an account are sent to. The session is only what sends them:
// a message to the number of the session itself lands in the chat with oneself, which makes no sound on the phone, so the
// number is best another one, such as the one of the admin. An empty number goes back to the number of the session.
func (s *Service) SetWhatsAppDestination(userID int64, input string) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	row, err := s.db.GetWhatsAppSession(userID)
	if err != nil {
		return err
	}
	if row == nil || row.Status != SessionWorking || row.Phone == "" {
		return errors.New("connect WhatsApp first: the notices are sent from that session")
	}
	phone := row.Phone
	if strings.TrimSpace(input) != "" {
		if phone, err = NormalizePhone(input); err != nil {
			return err
		}
	}
	return s.db.ConnectNotifyRecipient(userID, wahaKind, phone)
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
	return s.recordSession(ctx, w, row, session)
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
	if row.Status == SessionExpired {
		return nil, "", ErrScanExpired
	}
	var img []byte
	var ctype string
	err = s.callAs(ctx, w, row, func(sw *Waha) error {
		var e error
		img, ctype, e = sw.QR(ctx, row.SessionName)
		return e
	})
	if err != nil {
		return nil, "", err
	}
	// too many different codes without a scan end the wait, the same as too long a wait
	if s.noteQR(userID, img) {
		if _, err := s.expireScan(ctx, w, row); err != nil {
			return nil, "", err
		}
		return nil, "", ErrScanExpired
	}
	return img, ctype, nil
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
			// its key goes first, then the session; the key is of no use without the session
			if row.APIKeyID != "" {
				if err := w.DeleteKey(ctx, row.APIKeyID); err != nil {
					log.Printf("[notify] the key of the session %s was not removed: %v", row.SessionName, err)
				}
			}
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
	if w, err := s.wahaClient(); err == nil {
		if row, _ := s.db.GetWhatsAppSessionByName(event.Session); row != nil {
			_ = s.callAs(ctx, w, row, func(sw *Waha) error {
				_, e := sw.SendText(ctx, event.Session, phone, reply)
				return e
			})
		}
	}
	return nil
}

func (s *Service) sessionExists(name string) bool {
	ok, err := s.db.WhatsAppSessionNamed(name)
	return err == nil && ok
}

// ─── The key of a session ─────────────────────────────────────────────────────

// sessionClient is the client that acts on a session with the key of that session, made on first use. fresh makes a
// new key even when one is saved, for a key WAHA no longer accepts (the container was made again). When no key can be
// made the panel key is used and the reason is returned with it, so the session still works.
func (s *Service) sessionClient(ctx context.Context, admin *Waha, row *database.WhatsAppSession, fresh bool) (*Waha, error) {
	if !fresh && row.APIKeyEncrypted != "" {
		if key, err := crypto.Decrypt(s.key, row.APIKeyEncrypted); err == nil && key != "" {
			return admin.WithKey(key), nil
		}
	}
	id, key, err := admin.CreateSessionKey(ctx, row.SessionName)
	if err != nil {
		return admin, err
	}
	enc, err := crypto.Encrypt(s.key, key)
	if err != nil {
		return admin, err
	}
	if row.APIKeyID != "" {
		_ = admin.DeleteKey(ctx, row.APIKeyID)
	}
	if err := s.db.SetWhatsAppSessionKey(row.UserID, id, enc); err != nil {
		return admin, err
	}
	row.APIKeyID, row.APIKeyEncrypted = id, enc
	return admin.WithKey(key), nil
}

// callAs does a call on a session with the key of the session. A key WAHA refuses is made again once, and the call
// tried again; any other failure is the call's own.
func (s *Service) callAs(ctx context.Context, admin *Waha, row *database.WhatsAppSession, fn func(*Waha) error) error {
	client, err := s.sessionClient(ctx, admin, row, false)
	if err != nil {
		log.Printf("[notify] the panel key is used for the session %s: %v", row.SessionName, err)
	}
	err = fn(client)
	var se *SendError
	if errors.As(err, &se) && se.Config && client.key != admin.key {
		if fresh, kerr := s.sessionClient(ctx, admin, row, true); kerr == nil {
			return fn(fresh)
		}
	}
	return err
}

// sendFromSession sends a text from the session of an account, with the key of that session. An account with no
// session cannot be sent to, and that does not get better by trying again.
func (s *Service) sendFromSession(ctx context.Context, userID int64, phone, text string) (string, error) {
	row, err := s.db.GetWhatsAppSession(userID)
	if err != nil {
		return "", &SendError{Message: err.Error(), Temporary: true}
	}
	if row == nil {
		return "", &SendError{Message: "this account has no WhatsApp connected", Blocked: true}
	}
	w, err := s.wahaClient()
	if err != nil {
		return "", &SendError{Message: err.Error(), Temporary: true}
	}
	var id string
	err = s.callAs(ctx, w, row, func(sw *Waha) error {
		var e error
		id, e = sw.SendText(ctx, row.SessionName, phone, text)
		return e
	})
	return id, err
}

// ─── The address of the dashboard ────────────────────────────────────────────

const wahaDashboardHostKey = "waha_dashboard_host"

var dashboardHostPattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$`)

// WahaDashboardHost is the address the dashboard of WAHA answers on, "" while it is not set. The panel reads it for
// every request, so it is kept for a few seconds.
func (s *Service) WahaDashboardHost() string {
	if s == nil || s.db == nil {
		return ""
	}
	s.chMu.Lock()
	defer s.chMu.Unlock()
	if !s.dashHostAt.IsZero() && s.now().Sub(s.dashHostAt) < 10*time.Second {
		return s.dashHost
	}
	host, _ := s.db.GetNotifySetting(wahaDashboardHostKey)
	s.dashHost, s.dashHostAt = host, s.now()
	return host
}

// SetWahaDashboardHost saves the address of the dashboard: a host name, with a port if it has one, and nothing else.
// An empty one switches the dashboard address off.
func (s *Service) SetWahaDashboardHost(host string) error {
	if !s.ready() {
		return errors.New("the database is not connected")
	}
	host = strings.ToLower(strings.TrimSpace(host))
	if host != "" && (!dashboardHostPattern.MatchString(host) || len(host) > 253) {
		return errors.New("write only the address, such as waha.example.com, with no https:// and no path")
	}
	var err error
	if host == "" {
		err = s.db.DeleteNotifySetting(wahaDashboardHostKey)
	} else {
		err = s.db.SetNotifySetting(wahaDashboardHostKey, host)
	}
	s.chMu.Lock()
	s.dashHost, s.dashHostAt = host, s.now()
	s.chMu.Unlock()
	return err
}

// WahaProxyTarget is what the panel needs to speak for the superadmin to the dashboard: where WAHA is, its key, and the
// login of the dashboard. It fails while WAHA is not set up.
func (s *Service) WahaProxyTarget() (base, key, user, password string, err error) {
	if !s.ready() {
		return "", "", "", "", errors.New("the database is not connected")
	}
	row, cfg, err := s.wahaRow()
	if err != nil || row == nil || !row.Enabled || cfg.BaseURL == "" {
		return "", "", "", "", errors.New("WAHA is not switched on")
	}
	key, err = s.wahaKey(row)
	if err != nil {
		return "", "", "", "", err
	}
	return cfg.BaseURL, key, cfg.DashboardUser, s.settingDecrypted(wahaDashboardKey), nil
}
