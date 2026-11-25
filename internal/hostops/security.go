package hostops

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

var (
	validJailRe   = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
	validSSHAlgos = map[string]bool{
		"ssh-ed25519":                        true,
		"ssh-rsa":                            true,
		"ecdsa-sha2-nistp256":                true,
		"ecdsa-sha2-nistp384":                true,
		"ecdsa-sha2-nistp521":                true,
		"sk-ssh-ed25519@openssh.com":         true,
		"sk-ecdsa-sha2-nistp256@openssh.com": true,
	}
)

type SSHKey struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Fingerprint string `json:"fingerprint"`
	Comment     string `json:"comment"`
}

type Fail2BanJail struct {
	Name            string   `json:"name"`
	CurrentlyFailed int      `json:"currentlyFailed"`
	CurrentlyBanned int      `json:"currentlyBanned"`
	TotalBanned     int      `json:"totalBanned"`
	BannedIPs       []string `json:"bannedIps"`
}

type Fail2BanStatus struct {
	Installed bool           `json:"installed"`
	Running   bool           `json:"running"`
	Jails     []Fail2BanJail `json:"jails"`
}

type OSUpdatePackage struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Source  string `json:"source"`
}

type SecurityHardeningOverview struct {
	OS             string            `json:"os"`
	SSHKeysPath    string            `json:"sshKeysPath"`
	SSHKeys        []SSHKey          `json:"sshKeys"`
	Fail2Ban       Fail2BanStatus    `json:"fail2ban"`
	FailedLogins   []string          `json:"failedLogins"`
	PackageManager string            `json:"packageManager"`
	Upgradable     []OSUpdatePackage `json:"upgradable"`
}

func AuthorizedKeysPath() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		home = "/root"
	}
	return filepath.Join(home, ".ssh", "authorized_keys")
}

// ValidateSSHPublicKey validates an OpenSSH public key line and returns its normalized form & fingerprint.
func ValidateSSHPublicKey(raw string) (normalized, keyType, fingerprint, comment, id string, err error) {
	line := strings.TrimSpace(raw)
	if line == "" || strings.ContainsAny(line, "\r\n") {
		return "", "", "", "", "", errors.New("format public key SSH tidak valid")
	}
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return "", "", "", "", "", errors.New("public key SSH harus berisi tipe dan data base64 (mis. ssh-ed25519 AAAA...)")
	}
	keyType = fields[0]
	if !validSSHAlgos[keyType] {
		return "", "", "", "", "", fmt.Errorf("algoritma SSH tidak didukung: %s", keyType)
	}
	blob, decErr := base64.StdEncoding.DecodeString(fields[1])
	if decErr != nil || len(blob) < 16 {
		return "", "", "", "", "", errors.New("data base64 public key SSH tidak valid")
	}
	if len(fields) > 2 {
		comment = strings.Join(fields[2:], " ")
	}
	sum := sha256.Sum256(blob)
	fingerprint = "SHA256:" + strings.TrimRight(base64.StdEncoding.EncodeToString(sum[:]), "=")
	id = hex.EncodeToString(sum[:8])
	if comment != "" {
		normalized = fmt.Sprintf("%s %s %s", keyType, fields[1], comment)
	} else {
		normalized = fmt.Sprintf("%s %s", keyType, fields[1])
	}
	return normalized, keyType, fingerprint, comment, id, nil
}

func ParseAuthorizedKeys(raw string) []SSHKey {
	out := make([]SSHKey, 0)
	for _, line := range strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		_, keyType, fp, comment, id, err := ValidateSSHPublicKey(trimmed)
		if err != nil {
			continue
		}
		out = append(out, SSHKey{
			ID:          id,
			Type:        keyType,
			Fingerprint: fp,
			Comment:     comment,
		})
	}
	return out
}

func ListSSHKeys() ([]SSHKey, string, error) {
	path := AuthorizedKeysPath()
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []SSHKey{}, path, nil
		}
		return nil, path, err
	}
	return ParseAuthorizedKeys(string(raw)), path, nil
}

func AddSSHKey(rawKey string) (*SSHKey, error) {
	normalized, keyType, fp, comment, id, err := ValidateSSHPublicKey(rawKey)
	if err != nil {
		return nil, err
	}
	path := AuthorizedKeysPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	existingBytes, _ := os.ReadFile(path)
	existing := string(existingBytes)
	for _, k := range ParseAuthorizedKeys(existing) {
		if k.ID == id {
			return &k, nil
		}
	}
	updated := strings.TrimRight(existing, "\r\n")
	if updated != "" {
		updated += "\n"
	}
	updated += normalized + "\n"
	if err := os.WriteFile(path, []byte(updated), 0o600); err != nil {
		return nil, err
	}
	return &SSHKey{ID: id, Type: keyType, Fingerprint: fp, Comment: comment}, nil
}

func DeleteSSHKey(id string) error {
	id = strings.TrimSpace(id)
	if len(id) < 8 {
		return errors.New("ID SSH key tidak valid")
	}
	path := AuthorizedKeysPath()
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	kept := make([]string, 0)
	for _, line := range strings.Split(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if !strings.HasPrefix(trimmed, "#") {
			if _, _, _, _, lineID, vErr := ValidateSSHPublicKey(trimmed); vErr == nil && lineID == id {
				continue
			}
		}
		kept = append(kept, line)
	}
	content := ""
	if len(kept) > 0 {
		content = strings.Join(kept, "\n") + "\n"
	}
	return os.WriteFile(path, []byte(content), 0o600)
}

// InspectFail2Ban returns Fail2Ban daemon status, active jails, and banned IPs.
func InspectFail2Ban(ctx context.Context) Fail2BanStatus {
	st := Fail2BanStatus{Jails: []Fail2BanJail{}}
	if runtime.GOOS != "linux" {
		return st
	}
	if _, err := exec.LookPath("fail2ban-client"); err != nil {
		return st
	}
	st.Installed = true
	c, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	out, err := exec.CommandContext(c, "fail2ban-client", "status").Output()
	if err != nil {
		return st
	}
	st.Running = true
	jails := parseFail2BanJailList(string(out))
	for _, name := range jails {
		if !validJailRe.MatchString(name) {
			continue
		}
		jOut, jErr := exec.CommandContext(c, "fail2ban-client", "status", name).Output()
		if jErr != nil {
			continue
		}
		st.Jails = append(st.Jails, parseFail2BanJailDetail(name, string(jOut)))
	}
	return st
}

func parseFail2BanJailList(raw string) []string {
	for _, line := range strings.Split(raw, "\n") {
		if strings.Contains(line, "Jail list:") {
			parts := strings.SplitN(line, "Jail list:", 2)
			if len(parts) == 2 {
				rawList := strings.TrimSpace(parts[1])
				if rawList == "" {
					return nil
				}
				items := strings.Split(rawList, ",")
				out := make([]string, 0, len(items))
				for _, it := range items {
					if s := strings.TrimSpace(it); s != "" {
						out = append(out, s)
					}
				}
				return out
			}
		}
	}
	return nil
}

func parseFail2BanJailDetail(name, raw string) Fail2BanJail {
	j := Fail2BanJail{Name: name, BannedIPs: []string{}}
	for _, line := range strings.Split(raw, "\n") {
		l := strings.TrimSpace(line)
		switch {
		case strings.Contains(l, "Currently failed:"):
			j.CurrentlyFailed, _ = strconv.Atoi(strings.TrimSpace(strings.SplitN(l, "Currently failed:", 2)[1]))
		case strings.Contains(l, "Currently banned:"):
			j.CurrentlyBanned, _ = strconv.Atoi(strings.TrimSpace(strings.SplitN(l, "Currently banned:", 2)[1]))
		case strings.Contains(l, "Total banned:"):
			j.TotalBanned, _ = strconv.Atoi(strings.TrimSpace(strings.SplitN(l, "Total banned:", 2)[1]))
		case strings.Contains(l, "Banned IP list:"):
			ips := strings.Fields(strings.TrimSpace(strings.SplitN(l, "Banned IP list:", 2)[1]))
			j.BannedIPs = ips
		}
	}
	return j
}

func Fail2BanIPAction(ctx context.Context, jail, action, ip string) error {
	if runtime.GOOS != "linux" {
		return errors.New("Fail2Ban hanya tersedia di host Linux")
	}
	jail = strings.TrimSpace(jail)
	action = strings.ToLower(strings.TrimSpace(action))
	ip = strings.TrimSpace(ip)
	if !validJailRe.MatchString(jail) {
		return errors.New("nama jail Fail2Ban tidak valid")
	}
	if action != "banip" && action != "unbanip" {
		return errors.New("aksi Fail2Ban tidak valid")
	}
	if net.ParseIP(ip) == nil {
		return errors.New("alamat IP tidak valid")
	}
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(c, "fail2ban-client", "set", jail, action, ip).CombinedOutput()
	if err != nil {
		return fmt.Errorf("fail2ban %s gagal: %s", action, strings.TrimSpace(string(out)))
	}
	return nil
}

func RecentFailedSSHLogins(ctx context.Context, limit int) []string {
	if runtime.GOOS != "linux" {
		return []string{}
	}
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	c, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	out, err := exec.CommandContext(c, "journalctl", "-u", "ssh", "-u", "sshd", "-n", "250", "--no-pager").Output()
	if err != nil || len(out) == 0 {
		if raw, fErr := os.ReadFile("/var/log/auth.log"); fErr == nil {
			out = raw
			if len(out) > 64*1024 {
				out = out[len(out)-64*1024:]
			}
		}
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	matches := make([]string, 0, limit)
	for i := len(lines) - 1; i >= 0 && len(matches) < limit; i-- {
		l := strings.TrimSpace(lines[i])
		if strings.Contains(l, "Failed password") || strings.Contains(l, "Invalid user") || strings.Contains(l, "Failed publickey") {
			matches = append(matches, l)
		}
	}
	return matches
}

func ListOSUpdates(ctx context.Context) (string, []OSUpdatePackage) {
	if runtime.GOOS != "linux" {
		return "", []OSUpdatePackage{}
	}
	c, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	if _, err := exec.LookPath("apt"); err == nil {
		out, _ := exec.CommandContext(c, "apt", "list", "--upgradable").Output()
		pkgs := make([]OSUpdatePackage, 0)
		for _, line := range strings.Split(string(out), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "Listing...") {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				nameSrc := strings.SplitN(fields[0], "/", 2)
				src := ""
				if len(nameSrc) == 2 {
					src = nameSrc[1]
				}
				pkgs = append(pkgs, OSUpdatePackage{
					Name:    nameSrc[0],
					Version: fields[1],
					Source:  src,
				})
			}
		}
		return "apt", pkgs
	}
	return "", []OSUpdatePackage{}
}

func ApplyOSUpdates(ctx context.Context) (string, error) {
	if runtime.GOOS != "linux" {
		return "", errors.New("pembaruan paket OS hanya tersedia di host Linux")
	}
	if _, err := exec.LookPath("apt-get"); err != nil {
		return "", errors.New("manajer paket apt-get tidak ditemukan di host")
	}
	c, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(c, "/bin/sh", "-c", "DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y")
	out, err := cmd.CombinedOutput()
	text := string(out)
	if len(text) > 16000 {
		text = text[len(text)-16000:]
	}
	if err != nil {
		return text, fmt.Errorf("apt-get upgrade gagal: %w", err)
	}
	return text, nil
}
