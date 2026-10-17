package httpserver

import (
	"strings"
	"sync"
	"time"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
	"github.com/friskipradana/panel-desktop-ui/internal/userdb"
)

// What the System window counts besides the machine itself: containers and the rest of Docker, databases,
// domains and tunnels, accounts. The figures come from where the things really live (Docker, the panel's
// database, Cloudflare) and are cached for a few seconds, because the window asks every five.

const (
	dockerCountTTL     = 10 * time.Second
	cloudflareCountTTL = 60 * time.Second
)

type countCache[T any] struct {
	mu      sync.Mutex
	value   T
	valid   bool
	fetched time.Time
}

// get returns the cached value, or builds a new one once it is older than ttl
func (c *countCache[T]) get(ttl time.Duration, build func() T) T {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.valid && time.Since(c.fetched) < ttl {
		return c.value
	}
	c.value, c.valid, c.fetched = build(), true, time.Now()
	return c.value
}

type dockerWhole struct {
	Reachable  bool
	Containers []docker.Container
	Images     int
	Networks   int
	Volumes    int
}

type cloudflareCounts struct {
	Configured   bool `json:"configured"`
	Reachable    bool `json:"reachable"`
	Zones        int  `json:"zones"`
	ZonesActive  int  `json:"zonesActive"`
	Profiles     int  `json:"profiles"`
	ProfilesLive int  `json:"profilesLive"`
}

var (
	dockerCountCache     countCache[dockerWhole]
	cloudflareCountCache countCache[cloudflareCounts]
)

func countRunning(containers []docker.Container) int {
	running := 0
	for _, c := range containers {
		if c.State == "running" {
			running++
		}
	}
	return running
}

// systemCounts gathers the counts a viewer may see: the whole machine for the superadmin, what the account
// owns (and what it manages) for everyone else.
func (s *Server) systemCounts(viewer *database.User) map[string]any {
	out := map[string]any{}
	if viewer == nil {
		return out
	}
	scope := s.ownerScopeFor(viewer)
	var ids []int64
	if !scope.all {
		ids = scope.list()
	}

	whole := dockerCountCache.get(dockerCountTTL, func() dockerWhole {
		w := dockerWhole{}
		containers, err := docker.ListContainers()
		if err != nil {
			return w
		}
		w.Reachable, w.Containers = true, containers
		if images, err := docker.ListImages(); err == nil {
			w.Images = len(images)
		}
		if networks, err := docker.ListNetworks(); err == nil {
			w.Networks = len(networks)
		}
		w.Volumes = docker.CountVolumes()
		return w
	})
	mine := s.filterContainersForUser(viewer, whole.Containers)
	dockerOut := map[string]any{
		"reachable":  whole.Reachable,
		"containers": len(mine),
		"running":    countRunning(mine),
	}
	// images, networks and volumes are the machine's: only its owner counts them
	if scope.all {
		dockerOut["images"] = whole.Images
		dockerOut["networks"] = whole.Networks
		dockerOut["volumes"] = whole.Volumes
	}
	out["docker"] = dockerOut

	if s.database != nil && s.database.IsConnected() {
		if list, err := s.database.ListManagedDatabases(0, true); err == nil {
			states := userdb.States()
			total, running := 0, 0
			for _, item := range list {
				if !scope.has(item.UserID) {
					continue
				}
				total++
				if states[item.ContainerName] == "running" {
					running++
				}
			}
			out["databases"] = map[string]int{"total": total, "running": running}
		}

		if total, active, err := s.database.CountTunnels(ids); err == nil {
			out["routes"] = map[string]int{"total": total, "active": active}
		}

		if summary, err := s.database.UserSummaryFor(ids, s.loadSiteSettings().GraceDays, time.Now()); err == nil {
			users := map[string]any{"total": summary.Total, "active": summary.Active, "suspended": summary.Suspended}
			if scope.all && s.hostingEnabled() {
				users["planActive"], users["expiring"], users["grace"], users["expired"], users["noPlan"] = summary.PlanActive, summary.Expiring, summary.Grace, summary.Expired, summary.NoPlan
			}
			if roles, err := s.database.UserRoleCounts(ids); err == nil {
				users["roles"] = roles
			}
			out["users"] = users
		}
	}

	// Cloudflare belongs to the superadmin's own token
	if scope.all {
		out["cloudflare"] = cloudflareCountCache.get(cloudflareCountTTL, func() cloudflareCounts { return s.cloudflareCounts(viewer) })
		if domains, err := s.database.ListHostingDomains(); err == nil && s.hostingEnabled() {
			out["hostingDomains"] = len(domains)
		}
	}
	return out
}

// cloudflareCounts asks Cloudflare how many domains and tunnels the viewer's token reaches
func (s *Server) cloudflareCounts(viewer *database.User) cloudflareCounts {
	cfg, _ := s.database.GetCFConfig(viewer.ID)
	if cfg == nil || cfg.Status != "active" {
		return cloudflareCounts{}
	}
	out := cloudflareCounts{Configured: true}
	token, err := crypto.Decrypt(s.cfg.EncryptionKey, cfg.APITokenEncrypted)
	if err != nil {
		return out
	}
	client := cloudflareapi.NewClient(token, cfg.AccountID, "")
	zones, err := client.ListZones()
	if err != nil {
		return out
	}
	out.Reachable = true
	out.Zones = len(zones)
	for _, zone := range zones {
		if zone.Status == "active" {
			out.ZonesActive++
		}
	}
	if tunnels, err := client.ListTunnels(); err == nil {
		out.Profiles = len(tunnels)
		for _, tunnel := range tunnels {
			if strings.EqualFold(tunnel.Status, "healthy") || strings.EqualFold(tunnel.Status, "active") {
				out.ProfilesLive++
			}
		}
	}
	return out
}
