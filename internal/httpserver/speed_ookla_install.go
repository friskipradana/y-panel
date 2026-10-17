package httpserver

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// Ookla's command line client is installed from its official archive into the agent's own state
// directory, not through apt: the apt package is called `speedtest` too and collides with the
// Python `speedtest-cli` package on /usr/bin/speedtest. The archive is checked against the hash
// of the 1.2.0 release before anything is unpacked.

const ooklaCLIVersion = "1.2.0"

type ooklaArchive struct {
	Name   string
	SHA256 string
}

// ooklaArchives maps GOARCH to the release archive and its sha256
var ooklaArchives = map[string]ooklaArchive{
	"amd64": {"x86_64", "5690596c54ff9bed63fa3732f818a05dbc2db19ad36ed68f21ca5f64d5cfeeb7"},
	"arm64": {"aarch64", "3953d231da3783e2bf8904b6dd72767c5c6e533e163d3742fd0437affa431bd3"},
	"arm":   {"armhf", "e45fcdebbd8a185553535533dd032d6b10bc8c64eee4139b1147b9c09835d08d"},
	"386":   {"i386", "9ff7e18dbae7ee0e03c66108445a2fb6ceea6c86f66482e1392f55881b772fe8"},
}

const (
	ooklaArchiveBase  = "https://install.speedtest.net/app/cli/ookla-speedtest-" + ooklaCLIVersion + "-linux-"
	ooklaMaxArchive   = 8 << 20
	ooklaMaxBinary    = 24 << 20
	ooklaInstallLimit = 3 * time.Minute
)

var ooklaInstallMu sync.Mutex

// ooklaPrivateBin is where the agent keeps its own copy of the client
func ooklaPrivateBin(stateDir string) string {
	return filepath.Join(stateDir, "bin", "speedtest")
}

// installOoklaCLI downloads, verifies and unpacks Ookla's client to dest
func installOoklaCLI(ctx context.Context, dest string) error {
	if runtime.GOOS != "linux" {
		return errors.New("the Ookla client can only be installed on Linux")
	}
	archive, ok := ooklaArchives[runtime.GOARCH]
	if !ok {
		return fmt.Errorf("no Ookla client for the %s architecture", runtime.GOARCH)
	}
	if !ooklaInstallMu.TryLock() {
		return errors.New("the Ookla client is already being installed")
	}
	defer ooklaInstallMu.Unlock()

	ctx, cancel := context.WithTimeout(ctx, ooklaInstallLimit)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ooklaArchiveBase+archive.Name+".tgz", nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("download the Ookla client: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download the Ookla client: HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, ooklaMaxArchive+1))
	if err != nil {
		return fmt.Errorf("download the Ookla client: %w", err)
	}
	if len(body) > ooklaMaxArchive {
		return errors.New("the Ookla archive is larger than expected")
	}
	sum := sha256.Sum256(body)
	if hex.EncodeToString(sum[:]) != archive.SHA256 {
		return errors.New("the Ookla archive does not match the expected checksum")
	}

	binary, err := extractOoklaBinary(body)
	if err != nil {
		return err
	}
	return placeOoklaBinary(ctx, binary, dest)
}

// extractOoklaBinary returns the `speedtest` file of the archive; every other member is ignored,
// so nothing in the archive can choose where a file is written
func extractOoklaBinary(archive []byte) ([]byte, error) {
	gz, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return nil, fmt.Errorf("read the Ookla archive: %w", err)
	}
	defer gz.Close()
	reader := tar.NewReader(gz)
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil, errors.New("the Ookla archive has no speedtest file")
		}
		if err != nil {
			return nil, fmt.Errorf("read the Ookla archive: %w", err)
		}
		if header.Typeflag != tar.TypeReg || path.Clean(header.Name) != "speedtest" {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(reader, ooklaMaxBinary+1))
		if err != nil {
			return nil, fmt.Errorf("read the Ookla archive: %w", err)
		}
		if len(data) > ooklaMaxBinary {
			return nil, errors.New("the Ookla client is larger than expected")
		}
		return data, nil
	}
}

// placeOoklaBinary writes the client next to its final name, proves it is Ookla's, then renames it into place
func placeOoklaBinary(ctx context.Context, data []byte, dest string) error {
	dir := filepath.Dir(dest)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}
	tmp, err := os.CreateTemp(dir, ".speedtest-*")
	if err != nil {
		return fmt.Errorf("write the Ookla client: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("write the Ookla client: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, 0o755); err != nil {
		return err
	}
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(checkCtx, tmpName, "--version").Output()
	if err != nil || !isOoklaVersion(string(out)) {
		return errors.New("the downloaded file does not run as Ookla's client on this server")
	}
	if err := os.Rename(tmpName, dest); err != nil {
		return fmt.Errorf("install the Ookla client: %w", err)
	}
	return nil
}

// handleSpeedtestInstallCLI installs Ookla's client for the superadmin. Installing it is not
// accepting its licence: that stays a separate step.
func (s *Server) handleSpeedtestInstallCLI(w http.ResponseWriter, r *http.Request) {
	user := s.currentUserRecord(r)
	if s.cfg.StateDir == "" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "the agent has no state directory to keep the client in"})
		return
	}
	if err := installOoklaCLI(r.Context(), ooklaPrivateBin(s.cfg.StateDir)); err != nil {
		s.auditSensitiveAction(r, user, "speedtest.cli.install", "failed", map[string]any{"error": err.Error()})
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	forgetOoklaBinary()
	s.auditSensitiveAction(r, user, "speedtest.cli.install", "success", map[string]any{"version": ooklaCLIVersion})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "version": ooklaCLIVersion})
}
