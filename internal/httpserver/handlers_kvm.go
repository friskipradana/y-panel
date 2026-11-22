package httpserver

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	x11SocketDir         = "/tmp/.X11-unix"
	defaultKvmResolution = "1280x800"
	kvmMinWidth          = 640
	kvmMinHeight         = 480
	kvmMaxWidth          = 3840
	kvmMaxHeight         = 2160
	kvmTokenTTL          = 30 * time.Minute
)

// parseKvmResolution validates and normalizes a "<width>x<height>" display resolution string.
func parseKvmResolution(raw string) (width, height int, normalized string, ok bool) {
	cleaned := strings.ToLower(strings.TrimSpace(raw))
	parts := strings.Split(cleaned, "x")
	if len(parts) != 2 {
		return 0, 0, "", false
	}
	w, errW := strconv.Atoi(strings.TrimSpace(parts[0]))
	h, errH := strconv.Atoi(strings.TrimSpace(parts[1]))
	if errW != nil || errH != nil {
		return 0, 0, "", false
	}
	if w < kvmMinWidth || w > kvmMaxWidth || h < kvmMinHeight || h > kvmMaxHeight {
		return 0, 0, "", false
	}
	return w, h, fmt.Sprintf("%dx%d", w, h), true
}

func (s *Server) kvmSigningKey() []byte {
	if s == nil {
		sum := sha256.Sum256([]byte("nil-server"))
		return sum[:]
	}
	if key := strings.TrimSpace(s.cfg.EncryptionKey); key != "" {
		sum := sha256.Sum256([]byte("reneo-kvm-token|" + key))
		return sum[:]
	}
	s.kvmFallbackSecretOnce.Do(func() {
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			sum := sha256.Sum256([]byte(fmt.Sprintf("%d|%d", time.Now().UnixNano(), os.Getpid())))
			s.kvmFallbackSecret = sum[:]
			return
		}
		s.kvmFallbackSecret = buf
	})
	return s.kvmFallbackSecret
}

func (s *Server) mintKvmToken(userID int64, now time.Time) (string, time.Time) {
	expiresAt := now.Add(kvmTokenTTL)
	epoch := uint64(0)
	if s != nil {
		epoch = s.kvmTokenEpoch.Load()
	}
	payload := fmt.Sprintf("kvm|%d|%d|%d|%s", userID, epoch, expiresAt.Unix(), randomToken(12))
	encoded := base64.RawURLEncoding.EncodeToString([]byte(payload))
	mac := hmac.New(sha256.New, s.kvmSigningKey())
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + hex.EncodeToString(mac.Sum(nil)), expiresAt
}

func (s *Server) validateKvmToken(token string, expectedUserID int64) bool {
	if s == nil || expectedUserID <= 0 {
		return false
	}
	tok := strings.TrimSpace(token)
	dot := strings.IndexByte(tok, '.')
	if dot <= 0 || dot >= len(tok)-1 {
		return false
	}
	encoded := tok[:dot]
	sigHex := tok[dot+1:]
	gotMAC, err := hex.DecodeString(sigHex)
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, s.kvmSigningKey())
	_, _ = mac.Write([]byte(encoded))
	if !hmac.Equal(gotMAC, mac.Sum(nil)) {
		return false
	}
	rawPayload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return false
	}
	parts := strings.Split(string(rawPayload), "|")
	if len(parts) != 5 || parts[0] != "kvm" || parts[4] == "" {
		return false
	}
	uid, errUID := strconv.ParseInt(parts[1], 10, 64)
	epoch, errEpoch := strconv.ParseUint(parts[2], 10, 64)
	exp, errExp := strconv.ParseInt(parts[3], 10, 64)
	if errUID != nil || errEpoch != nil || errExp != nil {
		return false
	}
	if uid != expectedUserID || epoch != s.kvmTokenEpoch.Load() || time.Now().Unix() > exp {
		return false
	}
	return s.loadSiteSettings().KvmEnabled
}

func kvmRequestToken(r *http.Request) string {
	if r == nil {
		return ""
	}
	if tok := strings.TrimSpace(r.URL.Query().Get("token")); tok != "" {
		return tok
	}
	return strings.TrimSpace(r.Header.Get("X-KVM-Token"))
}

func waitTCPPortClosed(addr string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !isTCPPortOpen(addr, 120*time.Millisecond) {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return !isTCPPortOpen(addr, 120*time.Millisecond)
}

func trySetX11Resolution(display, resolution string) error {
	if runtime.GOOS != "linux" || strings.TrimSpace(display) == "" {
		return fmt.Errorf("xrandr hanya didukung pada display X11 Linux")
	}
	if _, err := exec.LookPath("xrandr"); err != nil {
		return err
	}
	authFiles := discoverXAuthFiles()
	attempts := make([]string, 0, len(authFiles)+1)
	attempts = append(attempts, "")
	attempts = append(attempts, authFiles...)
	var lastErr error
	for _, authPath := range attempts {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		cmd := exec.CommandContext(ctx, "xrandr", "--display", display, "-s", resolution)
		env := append(os.Environ(), "DISPLAY="+display)
		if authPath != "" {
			env = append(env, "XAUTHORITY="+authPath)
		}
		cmd.Env = env
		out, err := cmd.CombinedOutput()
		cancel()
		if err == nil {
			return nil
		}
		lastErr = fmt.Errorf("%v (%s)", err, tailText(string(out), 160))
	}
	if lastErr == nil {
		return fmt.Errorf("xrandr gagal mengubah resolusi")
	}
	return lastErr
}

type kvmPkgManagerSpec struct {
	bin        string
	updateArgs []string
	installCmd []string
	x11vncPkg  string
	xvfbPkg    string
	extraEnv   []string
}

var supportedKvmPkgManagers = []kvmPkgManagerSpec{
	{
		bin:        "apt-get",
		updateArgs: []string{"update", "-qq"},
		installCmd: []string{"install", "-y"},
		x11vncPkg:  "x11vnc",
		xvfbPkg:    "xvfb",
		extraEnv:   []string{"DEBIAN_FRONTEND=noninteractive"},
	},
	{
		bin:        "dnf",
		installCmd: []string{"install", "-y"},
		x11vncPkg:  "x11vnc",
		xvfbPkg:    "xorg-x11-server-Xvfb",
	},
	{
		bin:        "yum",
		installCmd: []string{"install", "-y"},
		x11vncPkg:  "x11vnc",
		xvfbPkg:    "xorg-x11-server-Xvfb",
	},
	{
		bin:        "pacman",
		installCmd: []string{"-S", "--noconfirm"},
		x11vncPkg:  "x11vnc",
		xvfbPkg:    "xorg-server-xvfb",
	},
}

func kvmPortAndDisplay(settings siteSettings) (int, string) {
	port := settings.KvmPort
	if port <= 0 {
		port = 5900
	}
	display := strings.TrimSpace(settings.KvmDisplay)
	if display == "" {
		display = strings.TrimSpace(os.Getenv("DISPLAY"))
		if display == "" {
			display = ":0"
		}
	}
	return port, display
}

func isTCPPortOpen(addr string, timeout time.Duration) bool {
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func parseXDisplayNumber(display string) (int, bool) {
	trimmed := strings.TrimSpace(display)
	if !strings.HasPrefix(trimmed, ":") {
		return 0, false
	}
	raw := strings.TrimPrefix(trimmed, ":")
	if dot := strings.IndexByte(raw, '.'); dot >= 0 {
		raw = raw[:dot]
	}
	if raw == "" {
		return 0, false
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 0, false
	}
	return n, true
}

func discoverX11Displays(socketDir string) []string {
	entries, err := os.ReadDir(socketDir)
	if err != nil {
		return []string{}
	}
	seen := make(map[int]struct{})
	var nums []int
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, "X") {
			continue
		}
		n, err := strconv.Atoi(strings.TrimPrefix(name, "X"))
		if err != nil || n < 0 {
			continue
		}
		if _, exists := seen[n]; exists {
			continue
		}
		seen[n] = struct{}{}
		nums = append(nums, n)
	}
	sort.Ints(nums)
	out := make([]string, 0, len(nums))
	for _, n := range nums {
		out = append(out, fmt.Sprintf(":%d", n))
	}
	return out
}

func xDisplaySocketExists(socketDir, display string) bool {
	n, ok := parseXDisplayNumber(display)
	if !ok {
		return false
	}
	_, err := os.Stat(filepath.Join(socketDir, fmt.Sprintf("X%d", n)))
	return err == nil
}

func pickFreeVirtualDisplay(socketDir string) string {
	parentDir := filepath.Dir(socketDir)
	for n := 99; n < 200; n++ {
		sockPath := filepath.Join(socketDir, fmt.Sprintf("X%d", n))
		lockPath := filepath.Join(parentDir, fmt.Sprintf(".X%d-lock", n))
		if _, err := os.Stat(sockPath); err == nil {
			continue
		}
		if _, err := os.Stat(lockPath); err == nil {
			continue
		}
		return fmt.Sprintf(":%d", n)
	}
	return ":99"
}

func discoverXAuthFiles(extraPatterns ...string) []string {
	patterns := []string{
		"/run/user/*/gdm/Xauthority",
		"/run/user/*/.mutter-Xwaylandauth*",
		"/var/run/lightdm/root/*",
		"/run/sddm/*",
		"/home/*/.Xauthority",
		"/root/.Xauthority",
	}
	patterns = append(patterns, extraPatterns...)

	var candidates []string
	if envAuth := strings.TrimSpace(os.Getenv("XAUTHORITY")); envAuth != "" {
		candidates = append(candidates, envAuth)
	}
	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		candidates = append(candidates, matches...)
	}

	seen := make(map[string]struct{}, len(candidates))
	var valid []string
	for _, path := range candidates {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		if _, exists := seen[path]; exists {
			continue
		}
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			continue
		}
		seen[path] = struct{}{}
		valid = append(valid, path)
	}
	return valid
}

func tailText(raw string, maxBytes int) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || maxBytes <= 0 || len(trimmed) <= maxBytes {
		return trimmed
	}
	return "..." + trimmed[len(trimmed)-maxBytes:]
}

func readLogTail(path string, maxBytes int) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return tailText(strings.ReplaceAll(string(data), "\n", " "), maxBytes)
}

func installKvmPackages(ctx context.Context, needX11vnc, needXvfb bool) ([]string, string, error) {
	for _, mgr := range supportedKvmPkgManagers {
		if _, err := exec.LookPath(mgr.bin); err != nil {
			continue
		}
		var pkgs []string
		if needX11vnc && mgr.x11vncPkg != "" {
			pkgs = append(pkgs, mgr.x11vncPkg)
		}
		if needXvfb && mgr.xvfbPkg != "" {
			pkgs = append(pkgs, mgr.xvfbPkg)
		}
		if len(pkgs) == 0 {
			return nil, "", fmt.Errorf("tidak ada paket target KVM untuk %s", mgr.bin)
		}
		if len(mgr.updateArgs) > 0 {
			upd := exec.CommandContext(ctx, mgr.bin, mgr.updateArgs...)
			upd.Env = append(os.Environ(), mgr.extraEnv...)
			_ = upd.Run()
		}
		args := append(append([]string{}, mgr.installCmd...), pkgs...)
		cmd := exec.CommandContext(ctx, mgr.bin, args...)
		cmd.Env = append(os.Environ(), mgr.extraEnv...)
		output, err := cmd.CombinedOutput()
		return pkgs, strings.TrimSpace(string(output)), err
	}
	return nil, "", fmt.Errorf("tidak ditemukan package manager (apt-get, dnf, yum, pacman) yang didukung pada server host")
}

// startDetachedAndWait avoids -bg pipe hangs under CombinedOutput by redirecting output to a log
// file, closing the parent FD right after Start, and racing cmd.Wait against readyFn.
func startDetachedAndWait(name string, args, extraEnv []string, logName string, timeout time.Duration, readyFn func() bool) (int, error) {
	logPath := filepath.Join(os.TempDir(), logName)
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return 0, fmt.Errorf("gagal membuka log %s: %w", name, err)
	}

	cmd := exec.Command(name, args...)
	cmd.Env = append(os.Environ(), extraEnv...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	detachKvmCmd(cmd)

	if startErr := cmd.Start(); startErr != nil {
		_ = logFile.Close()
		return 0, fmt.Errorf("gagal memulai %s: %w", name, startErr)
	}
	// Child owns its duplicated FDs; close parent handle so nothing blocks on EOF.
	_ = logFile.Close()

	pid := cmd.Process.Pid
	waitCh := make(chan error, 1)
	go func() {
		waitCh <- cmd.Wait()
	}()

	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case waitErr := <-waitCh:
			tail := readLogTail(logPath, 280)
			if tail != "" {
				return 0, fmt.Errorf("%s berhenti (%v): %s", name, waitErr, tail)
			}
			return 0, fmt.Errorf("%s berhenti sebelum siap (%v)", name, waitErr)
		case <-ticker.C:
			if readyFn != nil && readyFn() {
				return pid, nil
			}
		case <-deadline.C:
			terminateKvmPID(pid)
			tail := readLogTail(logPath, 280)
			if tail != "" {
				return 0, fmt.Errorf("timeout menunggu %s siap: %s", name, tail)
			}
			return 0, fmt.Errorf("timeout menunggu %s siap", name)
		}
	}
}

func startDetachedAuxClient(name string, display string, args ...string) int {
	if _, err := exec.LookPath(name); err != nil {
		return 0
	}
	cmd := exec.Command(name, args...)
	cmd.Env = append(os.Environ(), "DISPLAY="+display)
	detachKvmCmd(cmd)
	devNull, err := os.OpenFile(os.DevNull, os.O_RDWR, 0)
	if err == nil {
		cmd.Stdout = devNull
		cmd.Stderr = devNull
	}
	if startErr := cmd.Start(); startErr != nil {
		if devNull != nil {
			_ = devNull.Close()
		}
		return 0
	}
	if devNull != nil {
		_ = devNull.Close()
	}
	pid := cmd.Process.Pid
	go func() { _ = cmd.Wait() }()
	return pid
}

func (s *Server) stopManagedKvm() {
	if s == nil {
		return
	}
	s.kvmMu.Lock()
	defer s.kvmMu.Unlock()
	s.stopManagedKvmLocked()
}

func (s *Server) stopManagedKvmLocked() {
	if s == nil {
		return
	}
	for i := len(s.kvmManagedPIDs) - 1; i >= 0; i-- {
		terminateKvmPID(s.kvmManagedPIDs[i])
	}
	s.kvmManagedPIDs = nil
	s.kvmActiveMode = ""
	s.kvmActiveDisplay = ""
}

// handleGetKvmStatus probes local VNC display service on the host and returns its reachability and installation state.
func (s *Server) handleGetKvmStatus(w http.ResponseWriter, r *http.Request) {
	if tok := kvmRequestToken(r); tok != "" {
		currentUser := s.currentUserRecord(r)
		if currentUser == nil || !s.validateKvmToken(tok, currentUser.ID) {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "Token akses KVM tidak valid atau kedaluwarsa"})
			return
		}
	}

	settings := s.loadSiteSettings()
	port, display := kvmPortAndDisplay(settings)
	available := isTCPPortOpen(fmt.Sprintf("127.0.0.1:%d", port), 800*time.Millisecond)
	_, _, resolution, resOK := parseKvmResolution(settings.KvmResolution)
	if !resOK {
		resolution = defaultKvmResolution
	}

	s.kvmMu.Lock()
	activeMode := s.kvmActiveMode
	activeDisplay := s.kvmActiveDisplay
	s.kvmMu.Unlock()

	_, lookErr := exec.LookPath("x11vnc")
	installed := lookErr == nil
	_, xvfbErr := exec.LookPath("Xvfb")
	xvfbInstalled := xvfbErr == nil

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"enabled":        settings.KvmEnabled,
		"available":      available,
		"installed":      installed,
		"xvfbInstalled":  xvfbInstalled,
		"activeDisplays": discoverX11Displays(x11SocketDir),
		"host":           "127.0.0.1",
		"port":           port,
		"display":        display,
		"activeDisplay":  activeDisplay,
		"resolution":     resolution,
		"mode":           activeMode,
		"os":             runtime.GOOS,
	})
}

// handleInstallKvm installs x11vnc and Xvfb on the host Linux system using the available package manager.
func (s *Server) handleInstallKvm(w http.ResponseWriter, r *http.Request) {
	currentUser := s.currentUserRecord(r)
	if runtime.GOOS != "linux" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Instalasi x11vnc otomatis hanya didukung pada sistem host Linux"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	pkgs, output, err := installKvmPackages(ctx, true, true)
	if err != nil {
		log.Printf("[kvm] install packages %v failed: %v, out: %s", pkgs, err, output)
		s.auditSensitiveAction(r, currentUser, "kvm.install", "failed", map[string]any{"packages": pkgs, "error": err.Error(), "output": tailText(output, 400)})
		if len(pkgs) == 0 {
			s.writeJSON(w, http.StatusUnprocessableEntity, jsonResponse{"error": err.Error()})
			return
		}
		msg := fmt.Sprintf("Gagal memasang %s: %v", strings.Join(pkgs, ", "), err)
		if tail := tailText(output, 300); tail != "" {
			msg = fmt.Sprintf("%s (%s)", msg, tail)
		}
		s.writeJSON(w, http.StatusUnprocessableEntity, jsonResponse{"error": msg})
		return
	}

	s.auditSensitiveAction(r, currentUser, "kvm.install", "success", map[string]any{"packages": pkgs})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "message": fmt.Sprintf("%s berhasil dipasang", strings.Join(pkgs, " & "))})
}

func buildRealDisplayCandidates(socketDir, configuredDisplay string, activeDisplays []string) []string {
	var all []string
	if configuredDisplay != "" {
		all = append(all, configuredDisplay)
	}
	if envDisp := strings.TrimSpace(os.Getenv("DISPLAY")); envDisp != "" {
		all = append(all, envDisp)
	}
	all = append(all, activeDisplays...)

	seen := make(map[string]struct{}, len(all))
	var deduped []string
	for _, d := range all {
		d = strings.TrimSpace(d)
		if d == "" {
			continue
		}
		if _, ok := seen[d]; ok {
			continue
		}
		seen[d] = struct{}{}
		// Skip displays without an X socket when other live sockets exist to avoid redundant failed probes.
		if len(activeDisplays) > 0 && !xDisplaySocketExists(socketDir, d) {
			continue
		}
		deduped = append(deduped, d)
	}
	return deduped
}

func tryAttachExistingDisplays(displays []string, port int) (pid int, usedDisplay, usedAuth string, errs []string) {
	if len(displays) == 0 {
		return 0, "", "", nil
	}
	authFiles := discoverXAuthFiles()
	authOpts := make([][]string, 0, len(authFiles)+2)
	for _, f := range authFiles {
		authOpts = append(authOpts, []string{"-auth", f})
	}
	authOpts = append(authOpts, []string{"-auth", "guess"}, nil)

	portStr := strconv.Itoa(port)
	targetAddr := fmt.Sprintf("127.0.0.1:%d", port)
	hasSocket := len(discoverX11Displays(x11SocketDir)) > 0

	for _, display := range displays {
		opts := authOpts
		// Without any visible X11 socket on disk, avoid cycling through every auth file; run one fast probe.
		if !hasSocket && !xDisplaySocketExists(x11SocketDir, display) {
			opts = [][]string{{"-auth", "guess"}}
		}
		for _, auth := range opts {
			args := []string{"-display", display, "-rfbport", portStr, "-shared", "-forever", "-nopw", "-noxdamage"}
			args = append(args, auth...)
			logName := fmt.Sprintf("reneo-x11vnc-%d.log", port)
			startedPID, err := startDetachedAndWait("x11vnc", args, []string{"DISPLAY=" + display}, logName, 4*time.Second, func() bool {
				return isTCPPortOpen(targetAddr, 200*time.Millisecond)
			})
			if err == nil {
				authLabel := "no-auth"
				if len(auth) > 0 {
					authLabel = strings.Join(auth, " ")
				}
				return startedPID, display, authLabel, nil
			}
			authLabel := "no-auth"
			if len(auth) > 0 {
				authLabel = strings.Join(auth, " ")
			}
			errs = append(errs, fmt.Sprintf("%s [%s]: %v", display, authLabel, err))
		}
	}
	return 0, "", "", errs
}

func launchHeadlessSessionApps(display string) []int {
	var pids []int
	if _, err := exec.LookPath("xsetroot"); err == nil {
		_ = exec.Command("xsetroot", "-display", display, "-solid", "#1e293b").Run()
	}
	for _, wm := range []string{"openbox", "fluxbox", "xfwm4", "twm"} {
		if pid := startDetachedAuxClient(wm, display); pid > 0 {
			pids = append(pids, pid)
			break
		}
	}
	for _, term := range []string{"xterm", "x-terminal-emulator", "lxterminal", "xfce4-terminal"} {
		if pid := startDetachedAuxClient(term, display); pid > 0 {
			pids = append(pids, pid)
			break
		}
	}
	return pids
}

func tryStartWithXvfb(ctx context.Context, port, width, height int) (pids []int, vDisplay string, err error) {
	if width < kvmMinWidth || height < kvmMinHeight {
		width, height = 1280, 800
	}
	if _, lookErr := exec.LookPath("Xvfb"); lookErr != nil {
		installCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
		pkgs, out, instErr := installKvmPackages(installCtx, false, true)
		cancel()
		if instErr != nil {
			return nil, "", fmt.Errorf("display X11 aktif tidak ditemukan dan pemasangan Xvfb (%s) gagal: %v (%s)", strings.Join(pkgs, ","), instErr, tailText(out, 220))
		}
	}

	vDisplay = pickFreeVirtualDisplay(x11SocketDir)
	screenGeom := fmt.Sprintf("%dx%dx24", width, height)
	xvfbArgs := []string{vDisplay, "-screen", "0", screenGeom, "-nolisten", "tcp", "-ac"}
	xvfbPID, err := startDetachedAndWait("Xvfb", xvfbArgs, nil, fmt.Sprintf("reneo-xvfb-%d.log", port), 4*time.Second, func() bool {
		return xDisplaySocketExists(x11SocketDir, vDisplay)
	})
	if err != nil {
		return nil, vDisplay, fmt.Errorf("gagal menjalankan virtual display Xvfb %s: %w", vDisplay, err)
	}
	pids = append(pids, xvfbPID)

	cleanup := func() {
		for i := len(pids) - 1; i >= 0; i-- {
			terminateKvmPID(pids[i])
		}
	}

	pids = append(pids, launchHeadlessSessionApps(vDisplay)...)

	portStr := strconv.Itoa(port)
	targetAddr := fmt.Sprintf("127.0.0.1:%d", port)
	vncArgs := []string{"-display", vDisplay, "-rfbport", portStr, "-shared", "-forever", "-nopw", "-noxdamage"}
	vncPID, err := startDetachedAndWait("x11vnc", vncArgs, []string{"DISPLAY=" + vDisplay}, fmt.Sprintf("reneo-x11vnc-xvfb-%d.log", port), 5*time.Second, func() bool {
		return isTCPPortOpen(targetAddr, 200*time.Millisecond)
	})
	if err != nil {
		cleanup()
		return nil, vDisplay, fmt.Errorf("Xvfb %s aktif tetapi x11vnc gagal menempel: %w", vDisplay, err)
	}
	pids = append(pids, vncPID)
	return pids, vDisplay, nil
}

// handleStartKvm attaches x11vnc to an active X11 display or falls back to a managed Xvfb session.
func (s *Server) handleStartKvm(w http.ResponseWriter, r *http.Request) {
	currentUser := s.currentUserRecord(r)
	settings := s.loadSiteSettings()
	port, configuredDisplay := kvmPortAndDisplay(settings)
	width, height, resolution, resOK := parseKvmResolution(settings.KvmResolution)
	if !resOK {
		width, height, resolution = 1280, 800, defaultKvmResolution
	}
	targetAddr := fmt.Sprintf("127.0.0.1:%d", port)

	if isTCPPortOpen(targetAddr, 500*time.Millisecond) {
		s.kvmMu.Lock()
		mode := s.kvmActiveMode
		disp := s.kvmActiveDisplay
		s.kvmMu.Unlock()
		if disp == "" {
			disp = configuredDisplay
		}
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":         true,
			"running":    true,
			"mode":       mode,
			"display":    disp,
			"resolution": resolution,
			"message":    "Layanan VNC sudah aktif di port " + strconv.Itoa(port),
		})
		return
	}

	s.kvmMu.Lock()
	defer s.kvmMu.Unlock()

	if isTCPPortOpen(targetAddr, 300*time.Millisecond) {
		disp := s.kvmActiveDisplay
		if disp == "" {
			disp = configuredDisplay
		}
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":         true,
			"running":    true,
			"mode":       s.kvmActiveMode,
			"display":    disp,
			"resolution": resolution,
			"message":    "Layanan VNC sudah aktif di port " + strconv.Itoa(port),
		})
		return
	}

	if runtime.GOOS != "linux" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Layanan host KVM x11vnc hanya didukung pada sistem host Linux"})
		return
	}

	if _, err := exec.LookPath("x11vnc"); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Paket x11vnc belum terpasang di host server. Silakan pasang terlebih dahulu."})
		return
	}

	s.stopManagedKvmLocked()

	activeDisplays := discoverX11Displays(x11SocketDir)
	candidates := buildRealDisplayCandidates(x11SocketDir, configuredDisplay, activeDisplays)
	vncPID, usedDisplay, usedAuth, attachErrs := tryAttachExistingDisplays(candidates, port)
	if vncPID > 0 {
		s.kvmManagedPIDs = []int{vncPID}
		s.kvmActiveMode = "x11"
		s.kvmActiveDisplay = usedDisplay
		s.auditSensitiveAction(r, currentUser, "kvm.start", "success", map[string]any{
			"port": port, "display": usedDisplay, "auth": usedAuth, "mode": "x11",
		})
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":         true,
			"running":    true,
			"mode":       "x11",
			"display":    usedDisplay,
			"resolution": resolution,
			"message":    fmt.Sprintf("Layanan x11vnc berhasil dijalankan pada display %s", usedDisplay),
		})
		return
	}

	pids, vDisplay, xvfbErr := tryStartWithXvfb(r.Context(), port, width, height)
	if xvfbErr == nil {
		s.kvmManagedPIDs = pids
		s.kvmActiveMode = "xvfb"
		s.kvmActiveDisplay = vDisplay
		s.auditSensitiveAction(r, currentUser, "kvm.start", "success", map[string]any{
			"port": port, "display": vDisplay, "mode": "xvfb", "resolution": resolution,
		})
		s.writeJSON(w, http.StatusOK, jsonResponse{
			"ok":         true,
			"running":    true,
			"mode":       "xvfb",
			"display":    vDisplay,
			"resolution": resolution,
			"message":    fmt.Sprintf("Layanan x11vnc berhasil dijalankan pada display virtual %s", vDisplay),
		})
		return
	}

	errMsg := xvfbErr.Error()
	if len(attachErrs) > 0 {
		errMsg = fmt.Sprintf("%s (X11: %s)", errMsg, tailText(strings.Join(attachErrs, "; "), 240))
	}
	log.Printf("[kvm] start x11vnc failed port=%d err=%s", port, errMsg)
	s.auditSensitiveAction(r, currentUser, "kvm.start", "failed", map[string]any{
		"error": errMsg, "display": configuredDisplay, "port": port,
	})
	s.writeJSON(w, http.StatusUnprocessableEntity, jsonResponse{
		"error": errMsg,
	})
}

// handleStopKvm terminates managed x11vnc/Xvfb processes and any leftover x11vnc instance.
func (s *Server) handleStopKvm(w http.ResponseWriter, r *http.Request) {
	currentUser := s.currentUserRecord(r)
	s.kvmMu.Lock()
	s.stopManagedKvmLocked()
	s.kvmMu.Unlock()
	_ = exec.Command("pkill", "-x", "x11vnc").Run()
	s.auditSensitiveAction(r, currentUser, "kvm.stop", "success", map[string]any{"stopped": true})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "running": false})
}

// handleCreateKvmToken mints a short-lived signed KVM URL token bound to the current superadmin user and server token epoch.
func (s *Server) handleCreateKvmToken(w http.ResponseWriter, r *http.Request) {
	settings := s.loadSiteSettings()
	if !settings.KvmEnabled {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "Fitur KVM / Host Display dinonaktifkan di Pengaturan"})
		return
	}
	currentUser := s.currentUserRecord(r)
	if currentUser == nil || currentUser.ID <= 0 {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "Sesi pengguna tidak valid"})
		return
	}
	token, expiresAt := s.mintKvmToken(currentUser.ID, time.Now())
	s.auditSensitiveAction(r, currentUser, "kvm.token.create", "success", map[string]any{
		"expiresAt": expiresAt.UTC().Format(time.RFC3339),
	})
	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":        true,
		"token":     token,
		"url":       "/kvm?token=" + url.QueryEscape(token),
		"expiresAt": expiresAt.UTC().Format(time.RFC3339),
	})
}

// handleRevokeKvmTokens invalidates all previously issued KVM access tokens by bumping the token epoch.
func (s *Server) handleRevokeKvmTokens(w http.ResponseWriter, r *http.Request) {
	newEpoch := s.kvmTokenEpoch.Add(1)
	currentUser := s.currentUserRecord(r)
	s.auditSensitiveAction(r, currentUser, "kvm.token.revoke", "success", map[string]any{
		"epoch": newEpoch,
	})
	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":    true,
		"epoch": newEpoch,
	})
}

// handleSetKvmResolution validates, persists, and (when live) applies the target KVM framebuffer resolution.
func (s *Server) handleSetKvmResolution(w http.ResponseWriter, r *http.Request) {
	if tok := kvmRequestToken(r); tok != "" {
		currentUser := s.currentUserRecord(r)
		if currentUser == nil || !s.validateKvmToken(tok, currentUser.ID) {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "Token akses KVM tidak valid atau kedaluwarsa"})
			return
		}
	}

	var req struct {
		Resolution string `json:"resolution"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Payload resolusi tidak valid"})
		return
	}
	width, height, normalized, ok := parseKvmResolution(req.Resolution)
	if !ok {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "Format resolusi tidak valid (gunakan contoh 1280x800 atau 1920x1080 dalam rentang 640x480 - 3840x2160)"})
		return
	}

	settings := s.loadSiteSettings()
	if !settings.KvmEnabled {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "Fitur KVM / Host Display dinonaktifkan di Pengaturan"})
		return
	}

	settings.KvmResolution = normalized
	if err := s.saveSiteSettings(settings); err != nil {
		s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "Gagal menyimpan pengaturan resolusi KVM"})
		return
	}

	port, configuredDisplay := kvmPortAndDisplay(settings)
	targetAddr := fmt.Sprintf("127.0.0.1:%d", port)
	running := isTCPPortOpen(targetAddr, 500*time.Millisecond)

	applied := false
	restarted := false
	if running {
		s.kvmMu.Lock()
		mode := s.kvmActiveMode
		activeDisplay := s.kvmActiveDisplay
		hasManaged := len(s.kvmManagedPIDs) > 0
		s.kvmMu.Unlock()

		if mode == "xvfb" && hasManaged && runtime.GOOS == "linux" {
			s.kvmMu.Lock()
			s.stopManagedKvmLocked()
			_ = waitTCPPortClosed(targetAddr, 2*time.Second)
			pids, vDisplay, err := tryStartWithXvfb(r.Context(), port, width, height)
			if err == nil {
				s.kvmManagedPIDs = pids
				s.kvmActiveMode = "xvfb"
				s.kvmActiveDisplay = vDisplay
				applied = true
				restarted = true
			}
			s.kvmMu.Unlock()
			if err != nil {
				s.writeJSON(w, http.StatusUnprocessableEntity, jsonResponse{"error": err.Error()})
				return
			}
		} else {
			disp := activeDisplay
			if disp == "" {
				disp = configuredDisplay
			}
			if trySetX11Resolution(disp, normalized) == nil {
				applied = true
			}
		}
	}

	currentUser := s.currentUserRecord(r)
	s.auditSensitiveAction(r, currentUser, "kvm.resolution", "success", map[string]any{
		"resolution": normalized,
		"applied":    applied,
		"restarted":  restarted,
	})
	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":         true,
		"resolution": normalized,
		"applied":    applied,
		"restarted":  restarted,
	})
}

// handleKvmWebSocket bridges browser WebSocket (RFB/noVNC binary stream) to local VNC display server.
func (s *Server) handleKvmWebSocket(w http.ResponseWriter, r *http.Request) {
	settings := s.loadSiteSettings()
	if !settings.KvmEnabled {
		http.Error(w, "Fitur KVM / Host Display dinonaktifkan di Pengaturan", http.StatusForbidden)
		return
	}

	currentUser := s.currentUserRecord(r)
	tok := kvmRequestToken(r)
	if currentUser == nil || !s.validateKvmToken(tok, currentUser.ID) {
		http.Error(w, "Token akses KVM tidak valid atau kedaluwarsa", http.StatusForbidden)
		return
	}

	port := settings.KvmPort
	if port <= 0 {
		port = 5900
	}
	targetAddr := fmt.Sprintf("127.0.0.1:%d", port)
	tcpConn, err := net.DialTimeout("tcp", targetAddr, 4*time.Second)
	if err != nil {
		log.Printf("[kvm] local vnc connection failed target=%s: %v", targetAddr, err)
		http.Error(w, fmt.Sprintf("Gagal terhubung ke display VNC lokal di port %d: %v", port, err), http.StatusBadGateway)
		return
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  32768,
		WriteBufferSize: 32768,
		CheckOrigin:     s.isWebSocketOriginAllowed,
		Subprotocols:    []string{"binary", "base64"},
	}

	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		_ = tcpConn.Close()
		log.Printf("[kvm] websocket upgrade failed: %v", err)
		return
	}

	var once sync.Once
	closeBoth := func() {
		once.Do(func() {
			_ = wsConn.Close()
			_ = tcpConn.Close()
		})
	}
	defer closeBoth()

	// Forward client WS binary packets to local TCP VNC server
	go func() {
		defer closeBoth()
		for {
			msgType, data, readErr := wsConn.ReadMessage()
			if readErr != nil {
				return
			}
			if msgType == websocket.BinaryMessage || msgType == websocket.TextMessage {
				if _, writeErr := tcpConn.Write(data); writeErr != nil {
					return
				}
			}
		}
	}()

	// Forward raw VNC stream from local TCP to client WS
	buf := make([]byte, 32768)
	for {
		n, readErr := tcpConn.Read(buf)
		if readErr != nil {
			return
		}
		if n > 0 {
			if writeErr := wsConn.WriteMessage(websocket.BinaryMessage, buf[:n]); writeErr != nil {
				return
			}
		}
	}
}
