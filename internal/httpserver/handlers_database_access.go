package httpserver

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sync"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/userdb"
)

// Who may reach a user database from outside the server: only the machine itself (the container is published on 127.0.0.1), or a list
// of addresses (published on every interface behind a firewall chain that lets only them in).

// one change at a time: the firewall chain and the container of a database must not be rewritten by two requests together
var databaseAccessMu sync.Mutex

func (s *Server) handleDatabaseAccess(w http.ResponseWriter, r *http.Request) {
	item, _, ok := s.ownedDatabase(w, r)
	if !ok {
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"mode": item.AccessMode, "ips": item.AccessIPs, "port": item.HostPort})
}

func (s *Server) handleDatabaseSetAccess(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	item, u, ok := s.ownedDatabase(w, r)
	if !ok {
		return
	}
	if u.Role == "demo" {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "the demo account cannot open a database to other addresses"})
		return
	}
	if item.Status != "ready" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "database is not ready yet"})
		return
	}
	var req struct {
		Mode string   `json:"mode"`
		IPs  []string `json:"ips"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid request"})
		return
	}
	var ips []string
	switch req.Mode {
	case userdb.AccessLocal:
		ips = []string{}
	case userdb.AccessIPs:
		parsed, err := userdb.ParseAllowList(req.IPs)
		if err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
		if len(parsed) == 0 {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "add at least one IP address, or choose localhost only"})
			return
		}
		ips = parsed
	default:
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "mode must be local or ips"})
		return
	}

	databaseAccessMu.Lock()
	defer databaseAccessMu.Unlock()

	password, err := crypto.Decrypt(s.cfg.EncryptionKey, item.PasswordEncrypted)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("stored credentials could not be decrypted"))
		return
	}
	engine, _ := userdb.Lookup(item.Engine)
	spec := userdb.Spec{
		ID: item.ID, OwnerID: u.ID, OwnerName: u.Username, Engine: engine, Version: item.Version, HostPort: item.HostPort,
		Database: item.DatabaseName, User: item.Username, Password: password, AllowRemote: req.Mode == userdb.AccessIPs,
	}
	if quota, _ := s.database.GetUserQuota(u.ID); quota != nil {
		spec.MemoryMB = quota.MemoryLimitMB
		if quota.CPULimitPct > 0 {
			spec.CPULimit = float64(quota.CPULimitPct) / 100
		}
	}

	if req.Mode == userdb.AccessIPs {
		// the firewall comes first: without it the database would be open to everyone for a moment
		if err := userdb.ApplyAccess(item.ID, item.HostPort, ips); err != nil {
			s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
			return
		}
	}
	// the container is made again (the data volume stays) because the published address can only be set when it starts
	if err := userdb.Recreate(spec); err != nil {
		// the old container is gone: bring it back the way it was so the database is not left missing
		spec.AllowRemote = item.AccessMode == userdb.AccessIPs
		if item.AccessMode != userdb.AccessIPs {
			userdb.ClearAccess(item.ID, item.HostPort)
		}
		if backErr := userdb.Recreate(spec); backErr != nil {
			log.Printf("[databases] access id=%d: could not bring the database back: %v", item.ID, backErr)
		}
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	if req.Mode == userdb.AccessLocal {
		userdb.ClearAccess(item.ID, item.HostPort)
	}
	_ = s.database.SetManagedDatabaseAutostart(item.ID, true)
	if err := s.database.SetManagedDatabaseAccess(item.ID, u.ID, req.Mode, ips); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "database.access", "ok", map[string]any{"database": item.Name, "mode": req.Mode, "ips": ips})
	s.writeJSON(w, http.StatusOK, jsonResponse{"mode": req.Mode, "ips": ips, "port": item.HostPort})
}

// RestoreDatabaseAccess puts the firewall chains back after the agent or the machine restarted (they live in the kernel only). A
// database that cannot be protected is stopped: it is published on every interface and must not be left open.
func (s *Server) RestoreDatabaseAccess() {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	list, err := s.database.ListManagedDatabases(0, true)
	if err != nil {
		log.Printf("[databases] restore access: %v", err)
		return
	}
	for _, item := range list {
		s.restoreDatabaseAccess(item)
	}
}

func (s *Server) restoreDatabaseAccess(item database.ManagedDatabase) {
	if item.AccessMode != userdb.AccessIPs || len(item.AccessIPs) == 0 {
		return
	}
	// Docker must not start it by itself: after a reboot it would be published before these rules exist
	if err := userdb.SetRestartPolicy(item.ID, "no"); err != nil {
		log.Printf("[databases] restart policy id=%d: %v", item.ID, err)
	}
	if err := userdb.ApplyAccess(item.ID, item.HostPort, item.AccessIPs); err != nil {
		log.Printf("[databases] access id=%d: %v; stopping it", item.ID, err)
		_ = userdb.Stop(item.ID)
		_ = s.database.SetManagedDatabaseStatus(item.ID, "error", "the firewall rules for its allowed addresses could not be restored: "+err.Error())
		return
	}
	if item.Autostart && item.Status == "ready" && userdb.State(item.ID) != "running" {
		if err := userdb.Start(item.ID); err != nil {
			log.Printf("[databases] start id=%d after restoring its rules: %v", item.ID, err)
		}
	}
}
