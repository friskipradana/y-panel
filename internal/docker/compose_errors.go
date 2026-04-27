package docker

import (
	"fmt"
	"regexp"
	"strings"
)

func formatComposeError(output string) string {
	message := normalizeDockerOutput(output)
	if message == "" {
		return "Docker Compose gagal dijalankan. Periksa konfigurasi compose lalu coba lagi."
	}
	lower := strings.ToLower(message)

	if strings.Contains(lower, "port is already allocated") || strings.Contains(lower, "bind for 0.0.0.0:") {
		port := extractFirstRegexGroup(message, `(?i)bind for [^:]+:(\d+) failed`)
		if port == "" {
			port = extractFirstRegexGroup(message, `(?i)port (\d+) is already allocated`)
		}
		if port != "" {
			return fmt.Sprintf("Port host %s sudah dipakai oleh container atau service lain. Ganti mapping port di docker-compose.yml, misalnya \"%s:...\" menjadi port lain, atau hentikan service yang memakai port tersebut.", port, port)
		}
		return "Ada port host yang sudah dipakai oleh container atau service lain. Ganti mapping port di docker-compose.yml atau hentikan service yang memakai port tersebut."
	}

	if strings.Contains(lower, "container name") && strings.Contains(lower, "is already in use") {
		containerName := extractFirstRegexGroup(message, `(?i)container name\s+"?/?([^"\s]+)"?\s+is already in use`)
		if containerName != "" {
			return fmt.Sprintf("Nama container %q sudah dipakai. Ganti/hapus `container_name` pada template compose, atau hapus container lama yang memakai nama tersebut.", containerName)
		}
		return "Ada nama container yang sudah dipakai. Ganti/hapus `container_name` pada template compose, atau hapus container lama terlebih dahulu."
	}

	if strings.Contains(lower, "pull access denied") || strings.Contains(lower, "repository does not exist") {
		return "Image Docker tidak bisa diunduh. Pastikan nama image benar dan registry credential sudah diisi bila image bersifat private."
	}

	if strings.Contains(lower, "authentication required") || strings.Contains(lower, "unauthorized") || strings.Contains(lower, "denied: requested access") {
		return "Autentikasi registry gagal. Periksa registry, username/email, dan password/token lalu coba deploy lagi."
	}

	if strings.Contains(lower, "no such image") {
		return "Image Docker tidak ditemukan di host atau registry. Periksa nama image dan tag pada compose."
	}

	if strings.Contains(lower, "invalid compose") || strings.Contains(lower, "yaml") {
		return "Format docker-compose.yml tidak valid. Periksa indentasi YAML, nama service, image, ports, volumes, dan env."
	}

	if strings.Contains(lower, "berada di luar root user") {
		return message
	}

	return message
}

func normalizeDockerOutput(output string) string {
	lines := strings.Split(strings.ReplaceAll(output, "\r\n", "\n"), "\n")
	cleaned := make([]string, 0, len(lines))
	warningObsoleteVersion := regexp.MustCompile(`(?i)the attribute .version. is obsolete`)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || warningObsoleteVersion.MatchString(line) {
			continue
		}
		line = regexp.MustCompile(`^time="[^"]+"\s+level=\w+\s+msg="(.*)"$`).ReplaceAllString(line, "$1")
		cleaned = append(cleaned, line)
	}
	return strings.TrimSpace(strings.Join(cleaned, " "))
}

func extractFirstRegexGroup(value, pattern string) string {
	matches := regexp.MustCompile(pattern).FindStringSubmatch(value)
	if len(matches) < 2 {
		return ""
	}
	return strings.TrimSpace(matches[1])
}
