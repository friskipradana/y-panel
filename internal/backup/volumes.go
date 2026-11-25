package backup

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var validVolumeRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`)

// ValidVolumeName validates a Docker volume name before passing it to CLI commands.
func ValidVolumeName(name string) bool {
	return validVolumeRe.MatchString(strings.TrimSpace(name))
}

// ListDockerVolumeNames returns available Docker volume names on the host.
func ListDockerVolumeNames(ctx context.Context) ([]string, error) {
	if _, err := exec.LookPath("docker"); err != nil {
		return []string{}, nil
	}
	out, err := exec.CommandContext(ctx, "docker", "volume", "ls", "--format", "{{.Name}}").Output()
	if err != nil {
		return []string{}, nil
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	res := make([]string, 0, len(lines))
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l != "" && ValidVolumeName(l) {
			res = append(res, l)
		}
	}
	return res, nil
}

// ArchiveDockerVolume streams a tar.gz snapshot of a Docker volume into w using a lightweight alpine helper container.
func ArchiveDockerVolume(ctx context.Context, volumeName string, w io.Writer) error {
	volumeName = strings.TrimSpace(volumeName)
	if !ValidVolumeName(volumeName) {
		return errors.New("nama volume Docker tidak valid")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		return errors.New("Docker tidak ditemukan di host")
	}
	cmd := exec.CommandContext(ctx, "docker", "run", "--rm", "-v", volumeName+":/source:ro", "alpine:3.20", "tar", "czf", "-", "-C", "/source", ".")
	cmd.Stdout = w
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("backup volume Docker gagal: %s", msg)
	}
	return nil
}

// RestoreDockerVolume unpacks a tar.gz stream into the target Docker volume.
func RestoreDockerVolume(ctx context.Context, volumeName string, src io.Reader) error {
	volumeName = strings.TrimSpace(volumeName)
	if !ValidVolumeName(volumeName) {
		return errors.New("nama volume Docker tidak valid")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		return errors.New("Docker tidak ditemukan di host")
	}
	cmd := exec.CommandContext(ctx, "docker", "run", "--rm", "-i", "-v", volumeName+":/target", "alpine:3.20", "tar", "xzf", "-", "-C", "/target")
	cmd.Stdin = src
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("restore volume Docker gagal: %s", msg)
	}
	return nil
}

// ArchivePanelConfig archives the Reneo panel state directory safely, skipping backups, logs, sockets, and temp dirs.
func ArchivePanelConfig(stateDir string, w io.Writer) error {
	cleanRoot, err := filepath.Abs(strings.TrimSpace(stateDir))
	if err != nil {
		return err
	}
	info, err := os.Stat(cleanRoot)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("folder konfigurasi panel tidak ditemukan: %s", cleanRoot)
	}
	skipPanelDirs := map[string]bool{
		"backups": true,
		"logs":    true,
		"tmp":     true,
		"cache":   true,
	}
	gz := gzip.NewWriter(w)
	tw := tar.NewWriter(gz)
	walkErr := filepath.Walk(cleanRoot, func(path string, fi os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		rel, err := filepath.Rel(cleanRoot, path)
		if err != nil || rel == "." {
			return nil
		}
		if fi.IsDir() && skipPanelDirs[fi.Name()] {
			return filepath.SkipDir
		}
		if !fi.Mode().IsRegular() && !fi.IsDir() {
			return nil
		}
		if strings.HasSuffix(fi.Name(), ".sock") || strings.HasSuffix(fi.Name(), ".pid") || strings.HasSuffix(fi.Name(), ".part") {
			return nil
		}
		hdr, err := tar.FileInfoHeader(fi, "")
		if err != nil {
			return nil
		}
		hdr.Name = filepath.ToSlash(rel)
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if !fi.Mode().IsRegular() {
			return nil
		}
		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		_, copyErr := io.Copy(tw, f)
		_ = f.Close()
		return copyErr
	})
	closeTarErr := tw.Close()
	closeGzErr := gz.Close()
	if walkErr != nil {
		return walkErr
	}
	if closeTarErr != nil {
		return closeTarErr
	}
	return closeGzErr
}
