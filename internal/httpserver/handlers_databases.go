package httpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/userdb"
)

// User databases: containers owned by the signed-in account, bound to 127.0.0.1.
// The panel's own PostgreSQL is a different thing and is only visible to the
// superadmin (see handleDatabaseStatus).

const userDatabaseHost = "127.0.0.1"

type managedDatabaseView struct {
	database.ManagedDatabase
	EngineLabel string `json:"engineLabel"`
	Host        string `json:"host"`
	State       string `json:"state"`
	// AccessKey is the opaque key used in public addresses (full-page manager, Adminer)
	AccessKey string `json:"accessKey"`
}

func (s *Server) viewManagedDatabases(list []database.ManagedDatabase) []managedDatabaseView {
	states := userdb.States()
	out := make([]managedDatabaseView, 0, len(list))
	for _, item := range list {
		view := managedDatabaseView{ManagedDatabase: item, Host: userDatabaseHost, AccessKey: s.databaseAccessKey(item.ID)}
		if engine, ok := userdb.Lookup(item.Engine); ok {
			view.EngineLabel = engine.Label
		}
		switch {
		case item.Status == "creating" || item.Status == "error":
			view.State = item.Status
		default:
			if state, ok := states[item.ContainerName]; ok {
				view.State = state
			} else {
				view.State = "missing"
			}
		}
		out = append(out, view)
	}
	return out
}

func (s *Server) handleListDatabaseEngines(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, jsonResponse{"engines": userdb.Engines()})
}

func (s *Server) handleListUserDatabases(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	includeAll := auth.IsAdmin(u.Role) && r.URL.Query().Get("all") == "1"
	var (
		list []database.ManagedDatabase
		err  error
	)
	if scope := s.ownerScopeFor(u); includeAll && !scope.all {
		// an admin sees its own databases and those of the accounts below it
		for id := range scope.ids {
			part, partErr := s.database.ListManagedDatabases(id, false)
			if partErr != nil {
				err = partErr
				break
			}
			list = append(list, part...)
		}
	} else {
		list, err = s.database.ListManagedDatabases(u.ID, includeAll)
	}
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, tableResponse(s.viewManagedDatabases(list), databaseSpec(), r.URL.Query()))
}

func (s *Server) handleCreateUserDatabase(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	u := userFromCtx(r)
	var req struct {
		Name    string `json:"name"`
		Engine  string `json:"engine"`
		Version string `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	req.Name = strings.ToLower(strings.TrimSpace(req.Name))
	req.Engine = strings.ToLower(strings.TrimSpace(req.Engine))
	req.Version = strings.TrimSpace(req.Version)

	if err := userdb.ValidateName(req.Name); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	engine, ok := userdb.Lookup(req.Engine)
	if !ok {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "unsupported database engine"})
		return
	}
	if err := userdb.ValidateVersion(req.Version); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	quota, _ := s.database.GetUserQuota(u.ID)
	existing, err := s.database.ListManagedDatabases(u.ID, false)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	if quota != nil && len(existing) >= quota.MaxDatabases {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "database quota exceeded"})
		return
	}
	for _, item := range existing {
		if item.Name == req.Name {
			s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "a database with this name already exists"})
			return
		}
	}

	// the port is chosen and then written: two creations at once must not choose the same one
	s.databaseCreateMu.Lock()
	defer s.databaseCreateMu.Unlock()
	port, err := s.allocateDatabasePort()
	if err != nil {
		s.writeJSON(w, http.StatusServiceUnavailable, jsonResponse{"error": err.Error()})
		return
	}
	password, err := userdb.RandomPassword(24)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	encrypted, err := crypto.Encrypt(s.cfg.EncryptionKey, password)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	dbName, dbUser := "", ""
	if engine.HasDatabaseName {
		dbName = userdb.SQLIdent(req.Name)
	}
	if engine.HasUser {
		dbUser = userdb.SQLIdent(req.Name)
	}
	row, err := s.database.CreateManagedDatabase(u.ID, req.Name, engine.ID, req.Version, dbName, dbUser, encrypted, port)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	spec := userdb.Spec{
		ID: row.ID, OwnerID: u.ID, OwnerName: u.Username, Engine: engine, Version: req.Version, HostPort: port,
		Database: dbName, User: dbUser, Password: password,
	}
	if quota != nil {
		spec.MemoryMB = quota.MemoryLimitMB
		if quota.CPULimitPct > 0 {
			spec.CPULimit = float64(quota.CPULimitPct) / 100
		}
	}
	// pulling an image can take minutes: answer now, the list shows "creating" until it is up
	go s.provisionUserDatabase(row.ID, u.ID, spec)

	s.auditSensitiveAction(r, u, "database.create", "ok", map[string]any{"engine": engine.ID, "name": req.Name})
	s.writeJSON(w, http.StatusAccepted, s.viewManagedDatabases([]database.ManagedDatabase{*row})[0])
}

func (s *Server) provisionUserDatabase(id, ownerID int64, spec userdb.Spec) {
	if err := userdb.Create(spec); err != nil {
		log.Printf("[databases] create id=%d engine=%s owner=%d: %v", id, spec.Engine.ID, ownerID, err)
		_ = s.database.SetManagedDatabaseStatus(id, "error", err.Error())
		s.notifyUserAction(ownerID, "Database gagal dibuat ⚠️", fmt.Sprintf("Database %s gagal dibuat: %s", spec.Engine.Label, err.Error()), "warning")
		return
	}
	_ = s.database.SetManagedDatabaseStatus(id, "ready", "")
	s.notifyUserAction(ownerID, "Database siap 🗄️", fmt.Sprintf("Database %s berhasil dibuat.", spec.Engine.Label), "success")
}

// allocateDatabasePort gives the first port of the database range that no project, database or container holds and nothing listens on
func (s *Server) allocateDatabasePort() (int, error) {
	port, err := s.freePort(userdb.PortStart, userdb.PortEnd, nil)
	if err != nil {
		return 0, errors.New("no free database port left")
	}
	return port, nil
}

func (s *Server) ownedDatabase(w http.ResponseWriter, r *http.Request) (*database.ManagedDatabase, *database.User, bool) {
	u := userFromCtx(r)
	item, err := s.database.GetManagedDatabase(parsePathID(r, "id"), u.ID)
	if err != nil || item == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "database not found"})
		return nil, nil, false
	}
	return item, u, true
}

func (s *Server) handleUserDatabaseCredentials(w http.ResponseWriter, r *http.Request) {
	item, u, ok := s.ownedDatabase(w, r)
	if !ok {
		return
	}
	password, err := crypto.Decrypt(s.cfg.EncryptionKey, item.PasswordEncrypted)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("stored credentials could not be decrypted"))
		return
	}
	engine, _ := userdb.Lookup(item.Engine)
	s.auditSensitiveAction(r, u, "database.credentials", "ok", map[string]any{"id": item.ID})
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"host":     userDatabaseHost,
		"port":     item.HostPort,
		"database": item.DatabaseName,
		"username": item.Username,
		"password": password,
		"url":      userdb.ConnectionURL(engine, userDatabaseHost, item.HostPort, item.DatabaseName, item.Username, password),
	})
}

func (s *Server) handleStartUserDatabase(w http.ResponseWriter, r *http.Request) {
	item, _, ok := s.ownedDatabase(w, r)
	if !ok {
		return
	}
	if item.Status != "ready" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "database is not ready yet"})
		return
	}
	if err := userdb.Start(item.ID); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleStopUserDatabase(w http.ResponseWriter, r *http.Request) {
	item, _, ok := s.ownedDatabase(w, r)
	if !ok {
		return
	}
	if err := userdb.Stop(item.ID); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleDeleteUserDatabase(w http.ResponseWriter, r *http.Request) {
	item, u, ok := s.ownedDatabase(w, r)
	if !ok {
		return
	}
	if err := userdb.Remove(item.ID); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	if err := s.database.DeleteManagedDatabase(item.ID, u.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "database.delete", "ok", map[string]any{"engine": item.Engine, "name": item.Name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// stopUserDatabases halts (stop) or removes (remove) every database of an account.
func (s *Server) stopUserDatabases(userID int64, remove bool) {
	list, err := s.database.ListManagedDatabases(userID, false)
	if err != nil {
		return
	}
	for _, item := range list {
		if remove {
			if err := userdb.Remove(item.ID); err != nil {
				log.Printf("[databases] remove id=%d: %v", item.ID, err)
			}
			continue
		}
		_ = userdb.Stop(item.ID)
	}
}

// RecoverDatabases marks the databases that were still being created when the agent stopped: the image
// pull and the first start run in the agent, so no one is finishing them any more.
func (s *Server) RecoverDatabases() {
	if s.database == nil || !s.database.IsConnected() {
		return
	}
	list, err := s.database.ListManagedDatabases(0, true)
	if err != nil {
		log.Printf("[databases] recover: %v", err)
		return
	}
	for _, item := range list {
		if item.Status != "creating" {
			continue
		}
		_ = userdb.Remove(item.ID)
		_ = s.database.SetManagedDatabaseStatus(item.ID, "error", "creation was interrupted when the agent stopped; delete it and create it again")
	}
}
