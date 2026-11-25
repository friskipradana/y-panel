package hostops

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const cronMarkerPrefix = "# reneo-cron:"

var (
	cronSpecials = map[string]bool{
		"@reboot":   true,
		"@yearly":   true,
		"@annually": true,
		"@monthly":  true,
		"@weekly":   true,
		"@daily":    true,
		"@midnight": true,
		"@hourly":   true,
	}
	cronFieldRe = regexp.MustCompile(`^[0-9*/,-]+$`)
	cronIDRe    = regexp.MustCompile(`^[a-zA-Z0-9_-]{2,48}$`)
)

// CronJob represents a Reneo-managed crontab entry.
type CronJob struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Schedule string `json:"schedule"`
	Command  string `json:"command"`
	Enabled  bool   `json:"enabled"`
	Managed  bool   `json:"managed"`
}

func CronAvailable() bool {
	if runtime.GOOS != "linux" {
		return false
	}
	_, err := exec.LookPath("crontab")
	return err == nil
}

// ValidateCronSchedule checks standard 5-field cron syntax or @daily/@hourly macros.
func ValidateCronSchedule(expr string) error {
	s := strings.TrimSpace(expr)
	if s == "" || strings.ContainsAny(s, "\r\n") {
		return errors.New("jadwal cron tidak boleh kosong")
	}
	if cronSpecials[strings.ToLower(s)] {
		return nil
	}
	fields := strings.Fields(s)
	if len(fields) != 5 {
		return errors.New("jadwal cron harus terdiri dari 5 kolom (menit jam tanggal bulan hari) atau macro (@hourly, @daily)")
	}
	for _, f := range fields {
		if !cronFieldRe.MatchString(f) {
			return fmt.Errorf("kolom cron tidak valid: %q", f)
		}
	}
	return nil
}

// ParseCrontab parses raw crontab text into CronJobs (both Reneo-managed and unmanaged entries).
func ParseCrontab(raw string) []CronJob {
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	out := make([]CronJob, 0)
	for i := 0; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if strings.HasPrefix(trimmed, cronMarkerPrefix) && i+1 < len(lines) {
			meta := strings.TrimPrefix(trimmed, cronMarkerPrefix)
			parts := strings.SplitN(meta, "|", 3)
			id := strings.TrimSpace(parts[0])
			name := id
			if len(parts) >= 2 && strings.TrimSpace(parts[1]) != "" {
				name = strings.TrimSpace(parts[1])
			}
			enabled := true
			if len(parts) >= 3 && strings.TrimSpace(parts[2]) == "disabled" {
				enabled = false
			}
			i++
			entry := strings.TrimSpace(lines[i])
			if strings.HasPrefix(entry, "#") {
				enabled = false
				entry = strings.TrimSpace(strings.TrimPrefix(entry, "#"))
			}
			sched, cmd := splitCronEntry(entry)
			if sched != "" && cmd != "" {
				out = append(out, CronJob{
					ID:       id,
					Name:     name,
					Schedule: sched,
					Command:  cmd,
					Enabled:  enabled,
					Managed:  true,
				})
			}
			continue
		}
		if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.Contains(strings.Fields(trimmed)[0], "=") {
			continue
		}
		sched, cmd := splitCronEntry(trimmed)
		if sched != "" && cmd != "" {
			out = append(out, CronJob{
				ID:       fmt.Sprintf("sys-%d", i+1),
				Name:     "System crontab",
				Schedule: sched,
				Command:  cmd,
				Enabled:  true,
				Managed:  false,
			})
		}
	}
	return out
}

func splitCronEntry(line string) (string, string) {
	line = strings.TrimSpace(line)
	if line == "" {
		return "", ""
	}
	if strings.HasPrefix(line, "@") {
		idx := strings.IndexAny(line, " \t")
		if idx <= 0 {
			return "", ""
		}
		return strings.TrimSpace(line[:idx]), strings.TrimSpace(line[idx+1:])
	}
	fields := strings.Fields(line)
	if len(fields) < 6 {
		return "", ""
	}
	sched := strings.Join(fields[:5], " ")
	cmd := strings.Join(fields[5:], " ")
	return sched, cmd
}

// RenderCrontabWithUpsert updates or appends one Reneo-managed cron job without touching unmanaged lines.
func RenderCrontabWithUpsert(raw string, job CronJob) string {
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	kept := make([]string, 0, len(lines)+2)
	replaced := false
	stateTag := "enabled"
	entryLine := fmt.Sprintf("%s %s", strings.TrimSpace(job.Schedule), strings.TrimSpace(job.Command))
	if !job.Enabled {
		stateTag = "disabled"
		entryLine = "# " + entryLine
	}
	markerLine := fmt.Sprintf("%s%s|%s|%s", cronMarkerPrefix, job.ID, strings.ReplaceAll(job.Name, "|", " "), stateTag)

	for i := 0; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if strings.HasPrefix(trimmed, cronMarkerPrefix+job.ID+"|") || trimmed == cronMarkerPrefix+job.ID {
			kept = append(kept, markerLine, entryLine)
			replaced = true
			if i+1 < len(lines) {
				i++
			}
			continue
		}
		kept = append(kept, lines[i])
	}
	if !replaced {
		if len(kept) > 0 && strings.TrimSpace(kept[len(kept)-1]) != "" {
			kept = append(kept, "")
		}
		kept = append(kept, markerLine, entryLine)
	}
	return strings.TrimRight(strings.Join(kept, "\n"), "\n") + "\n"
}

// RenderCrontabWithDelete removes one Reneo-managed cron job by ID while preserving all other lines.
func RenderCrontabWithDelete(raw, id string) string {
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	kept := make([]string, 0, len(lines))
	for i := 0; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if strings.HasPrefix(trimmed, cronMarkerPrefix+id+"|") || trimmed == cronMarkerPrefix+id {
			if i+1 < len(lines) {
				i++
			}
			continue
		}
		kept = append(kept, lines[i])
	}
	out := strings.TrimRight(strings.Join(kept, "\n"), "\n")
	if out == "" {
		return ""
	}
	return out + "\n"
}

func readHostCrontab(ctx context.Context) (string, error) {
	if !CronAvailable() {
		return "", nil
	}
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(c, "crontab", "-l").CombinedOutput()
	if err != nil {
		lower := strings.ToLower(string(out))
		if strings.Contains(lower, "no crontab") {
			return "", nil
		}
		return "", fmt.Errorf("gagal membaca crontab: %s", strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func writeHostCrontab(ctx context.Context, content string) error {
	if !CronAvailable() {
		return errors.New("crontab hanya tersedia di host Linux")
	}
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(c, "crontab", "-")
	cmd.Stdin = strings.NewReader(content)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("gagal menyimpan crontab: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func ListCronJobs(ctx context.Context) ([]CronJob, bool, error) {
	if !CronAvailable() {
		return []CronJob{}, false, nil
	}
	raw, err := readHostCrontab(ctx)
	if err != nil {
		return nil, true, err
	}
	return ParseCrontab(raw), true, nil
}

func UpsertCronJob(ctx context.Context, job CronJob) (*CronJob, error) {
	if !CronAvailable() {
		return nil, errors.New("crontab hanya tersedia di host Linux")
	}
	if err := ValidateCronSchedule(job.Schedule); err != nil {
		return nil, err
	}
	job.Command = strings.TrimSpace(job.Command)
	if job.Command == "" || strings.ContainsAny(job.Command, "\r\n") {
		return nil, errors.New("perintah cron tidak valid")
	}
	if strings.TrimSpace(job.ID) == "" {
		job.ID = fmt.Sprintf("job-%d", time.Now().UnixNano()%1_000_000_000)
	}
	if !cronIDRe.MatchString(job.ID) {
		return nil, errors.New("ID cron job tidak valid")
	}
	if strings.TrimSpace(job.Name) == "" {
		job.Name = job.ID
	}
	raw, err := readHostCrontab(ctx)
	if err != nil {
		return nil, err
	}
	updated := RenderCrontabWithUpsert(raw, job)
	if err := writeHostCrontab(ctx, updated); err != nil {
		return nil, err
	}
	job.Managed = true
	return &job, nil
}

func DeleteCronJob(ctx context.Context, id string) error {
	if !CronAvailable() {
		return errors.New("crontab hanya tersedia di host Linux")
	}
	if !cronIDRe.MatchString(id) {
		return errors.New("ID cron job tidak valid")
	}
	raw, err := readHostCrontab(ctx)
	if err != nil {
		return err
	}
	return writeHostCrontab(ctx, RenderCrontabWithDelete(raw, id))
}

func RunCronCommandNow(ctx context.Context, command string) (string, error) {
	if runtime.GOOS != "linux" {
		return "", errors.New("eksekusi cron hanya tersedia di host Linux")
	}
	command = strings.TrimSpace(command)
	if command == "" || strings.ContainsAny(command, "\r\n") {
		return "", errors.New("perintah cron tidak valid")
	}
	c, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(c, "/bin/sh", "-c", command)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	text := out.String()
	if len(text) > 16000 {
		text = text[len(text)-16000:]
	}
	return text, err
}
