// Package accountusage measures what one panel account consumes: the processes of its OS
// account plus the containers it owns. It replaces host-wide figures for accounts that must not
// see the machine they share.
package accountusage

import (
	"bytes"
	"context"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Usage is a point-in-time reading.
type Usage struct {
	// CPUCores is the CPU in use expressed in cores (1.0 = one full core).
	CPUCores float64
	// MemBytes is resident memory of the account's processes and containers.
	MemBytes uint64
}

type dockerReading struct {
	cores float64
	mem   uint64
	at    time.Time
}

var (
	dockerMu    sync.Mutex
	dockerCache = map[string]dockerReading{}
)

const dockerTTL = 5 * time.Second

// Sample reads the account's usage. osUsername may be empty (no OS account yet); containerIDs
// are the containers owned by the account.
func Sample(osUsername string, containerIDs []string) Usage {
	u := processUsage(osUsername)
	cores, mem := containerUsage(osUsername, containerIDs)
	u.CPUCores += cores
	u.MemBytes += mem
	return u
}

// containerUsage asks docker for one snapshot, cached for a few seconds per account because a
// call takes a second or more and the live view asks every second.
func containerUsage(key string, ids []string) (float64, uint64) {
	if len(ids) == 0 {
		return 0, 0
	}
	dockerMu.Lock()
	if r, ok := dockerCache[key]; ok && time.Since(r.at) < dockerTTL {
		dockerMu.Unlock()
		return r.cores, r.mem
	}
	dockerMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	args := append([]string{"stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}"}, ids...)
	out, err := exec.CommandContext(ctx, "docker", args...).Output()
	var cores float64
	var mem uint64
	if err == nil {
		for _, line := range strings.Split(string(bytes.TrimSpace(out)), "\n") {
			parts := strings.Split(line, "|")
			if len(parts) != 2 {
				continue
			}
			if pct, perr := strconv.ParseFloat(strings.TrimSuffix(strings.TrimSpace(parts[0]), "%"), 64); perr == nil {
				cores += pct / 100
			}
			used := strings.TrimSpace(strings.SplitN(parts[1], "/", 2)[0])
			mem += parseSize(used)
		}
	}
	dockerMu.Lock()
	dockerCache[key] = dockerReading{cores: cores, mem: mem, at: time.Now()}
	dockerMu.Unlock()
	return cores, mem
}

// parseSize reads docker sizes such as "12.5MiB" or "1.2GiB".
func parseSize(s string) uint64 {
	s = strings.TrimSpace(s)
	units := []struct {
		suffix string
		mult   float64
	}{{"KiB", 1 << 10}, {"MiB", 1 << 20}, {"GiB", 1 << 30}, {"TiB", 1 << 40}, {"kB", 1e3}, {"MB", 1e6}, {"GB", 1e9}, {"B", 1}}
	for _, u := range units {
		if strings.HasSuffix(s, u.suffix) {
			if v, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(s, u.suffix)), 64); err == nil {
				return uint64(v * u.mult)
			}
			return 0
		}
	}
	return 0
}
