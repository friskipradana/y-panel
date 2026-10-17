package httpserver

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"

	cloudflareapi "github.com/friskipradana/panel-desktop-ui/internal/cloudflare"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
)

// Everything that touches Cloudflare for the sold subdomains goes through syncHostingRoutes: it
// makes DNS and the carrier tunnel match the table, so any change (create, delete,
// suspend, renew, an ended plan) is one call and a failed call is repaired by the next one.
// The tunnel is a dedicated one owned by the superadmin's Cloudflare account; the superadmin's
// own tunnels are never touched.

const (
	hostingTunnelStateKey = "tunnel_id"
	hostingTunnelName     = "reneo-hosting"
)

var (
	hostingSyncMu   sync.Mutex
	hostingLastKeys sync.Map // tunnel id -> rules key last applied
	// what was already checked, so a sync does not ask Cloudflare again for every row each time:
	// hostname -> tunnel content for records known to be ours, hostname -> true for records known to be gone
	hostingDNSOK      sync.Map
	hostingDNSCleaned sync.Map
)

// hostingCloudflare returns a client for the superadmin's verified Cloudflare account
func (s *Server) hostingCloudflare() (*cloudflareapi.Client, int64, error) {
	superID, err := s.database.GetSuperadminID()
	if err != nil {
		return nil, 0, errors.New("no superadmin account")
	}
	cfg, _ := s.database.GetCFConfig(superID)
	if cfg == nil || cfg.Status != "active" {
		return nil, superID, errors.New("the superadmin's Cloudflare account is not connected or verified")
	}
	token, err := crypto.Decrypt(s.cfg.EncryptionKey, cfg.APITokenEncrypted)
	if err != nil {
		return nil, superID, errors.New("the stored Cloudflare token cannot be decrypted")
	}
	return cloudflareapi.NewClient(token, cfg.AccountID, ""), superID, nil
}

func (s *Server) syncHostingRoutes() {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	hostingSyncMu.Lock()
	defer hostingSyncMu.Unlock()

	rows, err := s.database.ListHostingSubdomains(0)
	if err != nil {
		log.Printf("[hosting] sync: %v", err)
		return
	}
	tunnelID, _ := s.database.GetHostingState(hostingTunnelStateKey)
	if len(rows) == 0 && tunnelID == "" {
		return
	}

	ownerActive := map[int64]bool{}
	for _, row := range rows {
		if _, seen := ownerActive[row.UserID]; !seen {
			user, _ := s.database.GetUserByID(row.UserID)
			ownerActive[row.UserID] = user != nil && user.Status == "active"
		}
	}
	served, skipped := planHostingRoutes(rows, s.hostingEnabled(), ownerActive, panelService(s.cfg.BindAddr))

	client, superID, err := s.hostingCloudflare()
	if err != nil {
		// nothing can be served; say why on the rows that wait for it
		for _, row := range rows {
			if row.Status == subdomainSuspended {
				continue
			}
			if row.Status != subdomainError || row.Note != err.Error() {
				_ = s.database.SetHostingSubdomainStatus(row.ID, subdomainError, err.Error())
			}
		}
		return
	}

	var credJSON []byte
	if tunnelID == "" && len(served) > 0 {
		info, creds, createErr := client.CreateTunnel(hostingTunnelName)
		if createErr != nil {
			log.Printf("[hosting] cannot create the tunnel: %v", createErr)
			for _, route := range served {
				_ = s.database.SetHostingSubdomainStatus(route.subdomain.ID, subdomainError, "could not create the tunnel: "+createErr.Error())
			}
			return
		}
		tunnelID, credJSON = info.ID, creds
		if err := s.database.SetHostingState(hostingTunnelStateKey, tunnelID); err != nil {
			log.Printf("[hosting] cannot remember the tunnel id: %v", err)
		}
	}
	if tunnelID == "" {
		return
	}
	content := tunnelID + ".cfargotunnel.com"

	// DNS: ours for the served rows, gone for the rest (only records that point at our tunnel)
	ready := make([]hostingRoute, 0, len(served))
	for _, route := range served {
		row := route.subdomain
		hostingDNSCleaned.Delete(row.Hostname)
		if known, ok := hostingDNSOK.Load(row.Hostname); ok && known == content && row.Status == subdomainActive {
			ready = append(ready, route)
			continue
		}
		records, listErr := client.DNSRecordsByName(row.ZoneID, row.Hostname)
		if listErr != nil {
			_ = s.database.SetHostingSubdomainStatus(row.ID, subdomainError, "DNS lookup failed: "+listErr.Error())
			continue
		}
		switch judgeDNS(records, content) {
		case dnsTaken:
			hostingDNSOK.Delete(row.Hostname)
			_ = s.database.SetHostingSubdomainStatus(row.ID, subdomainError, "this name is already used by another DNS record")
			continue
		case dnsFree:
			if _, createErr := client.CreateDNSRecord(row.ZoneID, cloudflareapi.DNSRecordPayload{Type: "CNAME", Name: row.Hostname, Content: content, TTL: 1, Proxied: true, Comment: "Reneo hosting subdomain"}); createErr != nil {
				_ = s.database.SetHostingSubdomainStatus(row.ID, subdomainError, "could not create the DNS record: "+createErr.Error())
				continue
			}
		}
		hostingDNSOK.Store(row.Hostname, content)
		ready = append(ready, route)
	}
	for _, row := range rows {
		if _, notServed := skipped[row.ID]; !notServed {
			continue
		}
		hostingDNSOK.Delete(row.Hostname)
		if _, done := hostingDNSCleaned.Load(row.Hostname); done {
			continue
		}
		records, listErr := client.DNSRecordsByName(row.ZoneID, row.Hostname)
		if listErr != nil {
			continue
		}
		removed := true
		for _, record := range records {
			if strings.EqualFold(record.Type, "CNAME") && strings.EqualFold(strings.TrimSuffix(record.Content, "."), content) {
				if delErr := client.DeleteDNSRecord(row.ZoneID, record.ID); delErr != nil {
					removed = false
				}
			}
		}
		if removed {
			hostingDNSCleaned.Store(row.Hostname, true)
		}
	}

	// the tunnel: ingress at Cloudflare and the local cloudflared that carries it
	rules := ingressFor(ready)
	key := rulesKey(rules)
	last, _ := hostingLastKeys.Load(tunnelID)
	if last != key || !s.cfDaemon.IsRunning(tunnelID) {
		if err := client.UpdateTunnelConfig(tunnelID, rules); err != nil {
			log.Printf("[hosting] cannot update the tunnel configuration: %v", err)
			for _, route := range ready {
				_ = s.database.SetHostingSubdomainStatus(route.subdomain.ID, subdomainError, "could not update the tunnel: "+err.Error())
			}
			return
		}
		credFile := s.cfDaemon.CredFilePathFor(superID, tunnelID)
		if credJSON == nil {
			credJSON, _ = os.ReadFile(credFile)
		}
		_ = s.cfDaemon.StopTunnel(tunnelID)
		if len(rules) > 0 {
			yaml := cloudflareapi.GenerateConfigYAML(cloudflareapi.TunnelConfigOptions{TunnelID: tunnelID, CredFile: credFile, Ingress: rules})
			if startErr := s.cfDaemon.StartTunnel(tunnelID, superID, credJSON, yaml); startErr != nil {
				log.Printf("[hosting] cloudflared did not start: %v", startErr)
				for _, route := range ready {
					_ = s.database.SetHostingSubdomainStatus(route.subdomain.ID, subdomainError, "the tunnel did not start: "+startErr.Error())
				}
				return
			}
		}
		hostingLastKeys.Store(tunnelID, key)
	}

	for _, route := range ready {
		if route.subdomain.Status != subdomainActive || route.subdomain.Note != "" {
			_ = s.database.SetHostingSubdomainStatus(route.subdomain.ID, subdomainActive, "")
		}
	}
	for id, reason := range skipped {
		for _, row := range rows {
			if row.ID == id && reason != "" && row.Status != subdomainSuspended && row.Note != reason {
				_ = s.database.SetHostingSubdomainStatus(id, subdomainPending, reason)
			}
		}
	}
}

// removeHostingDNS deletes the record of a subdomain that is being released
func (s *Server) removeHostingDNS(row database.HostingSubdomain) error {
	client, _, err := s.hostingCloudflare()
	if err != nil {
		return err
	}
	tunnelID, _ := s.database.GetHostingState(hostingTunnelStateKey)
	if tunnelID == "" {
		return nil
	}
	records, err := client.DNSRecordsByName(row.ZoneID, row.Hostname)
	if err != nil {
		return err
	}
	content := tunnelID + ".cfargotunnel.com"
	for _, record := range records {
		if strings.EqualFold(record.Type, "CNAME") && strings.EqualFold(strings.TrimSuffix(record.Content, "."), content) {
			if err := client.DeleteDNSRecord(row.ZoneID, record.ID); err != nil {
				return fmt.Errorf("delete DNS record: %w", err)
			}
		}
	}
	hostingDNSOK.Delete(row.Hostname)
	hostingDNSCleaned.Delete(row.Hostname)
	return nil
}
