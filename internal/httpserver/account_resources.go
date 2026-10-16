package httpserver

import (
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/accountusage"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
	panelosuser "github.com/friskipradana/panel-desktop-ui/internal/osuser"
)

// What an account sees instead of the machine: its own CPU, memory and storage against the quota
// the superadmin (or its admin) set for it.

type accountResources struct {
	// CPUPercent and MemPercent are shares of the account's limits (0 when unlimited)
	CPUPercent float64 `json:"cpuPercent"`
	CPUCores   float64 `json:"cpuCores"`
	MemUsed    uint64  `json:"memUsed"`
	MemLimit   uint64  `json:"memLimit"`
	DiskUsed   uint64  `json:"diskUsed"`
	DiskLimit  uint64  `json:"diskLimit"`
	CPULimit   int     `json:"cpuLimitPct"` // percent of one core, 0 = unlimited
}

type diskReading struct {
	bytes uint64
	at    time.Time
}

var (
	diskMu    sync.Mutex
	diskCache = map[int64]diskReading{}
)

const diskTTL = 60 * time.Second

func (s *Server) accountDiskUsed(u *database.User) uint64 {
	diskMu.Lock()
	if r, ok := diskCache[u.ID]; ok && time.Since(r.at) < diskTTL {
		diskMu.Unlock()
		return r.bytes
	}
	diskMu.Unlock()
	var used uint64
	if home := panelosuser.ResolveHomeDir(u.Username); home != "" {
		size, _ := dirSize(home, 1500*time.Millisecond)
		if size > 0 {
			used = uint64(size)
		}
	}
	diskMu.Lock()
	diskCache[u.ID] = diskReading{bytes: used, at: time.Now()}
	diskMu.Unlock()
	return used
}

func (s *Server) accountResources(u *database.User, includeDisk bool) accountResources {
	out := accountResources{}
	var quota *database.UserQuota
	if s.database != nil && s.database.IsConnected() {
		quota, _ = s.database.GetUserQuota(u.ID)
	}

	var ids []string
	if containers, err := docker.ListContainers(); err == nil {
		for _, c := range containers {
			if c.OwnerUserID == u.ID {
				ids = append(ids, c.ID)
			}
		}
	}
	usage := accountusage.Sample(panelosuser.MappedUsername(u.Username), ids)
	out.CPUCores = usage.CPUCores
	out.MemUsed = usage.MemBytes
	if quota != nil {
		out.CPULimit = quota.CPULimitPct
		if quota.CPULimitPct > 0 {
			out.CPUPercent = usage.CPUCores / (float64(quota.CPULimitPct) / 100) * 100
			if out.CPUPercent > 100 {
				out.CPUPercent = 100
			}
		}
		if quota.MemoryLimitMB > 0 {
			out.MemLimit = uint64(quota.MemoryLimitMB) << 20
		}
		if quota.DiskQuotaMB > 0 {
			out.DiskLimit = uint64(quota.DiskQuotaMB) << 20
		}
	}
	if includeDisk {
		out.DiskUsed = s.accountDiskUsed(u)
	}
	return out
}
