package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/userdb"
)

// Administration of a user database from the panel: tables, SQL, users and
// permissions, password. The owner only; the work happens through the client inside
// the database container (see internal/userdb/admin.go).

func (s *Server) databaseConn(w http.ResponseWriter, r *http.Request) (userdb.Conn, *database.ManagedDatabase, *database.User, bool) {
	item, u, ok := s.ownedDatabase(w, r)
	if !ok {
		return userdb.Conn{}, nil, nil, false
	}
	if item.Status != "ready" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "database is not ready yet"})
		return userdb.Conn{}, nil, nil, false
	}
	if userdb.State(item.ID) != "running" {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "start the database first"})
		return userdb.Conn{}, nil, nil, false
	}
	password, err := crypto.Decrypt(s.cfg.EncryptionKey, item.PasswordEncrypted)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, errors.New("stored credentials could not be decrypted"))
		return userdb.Conn{}, nil, nil, false
	}
	engine, _ := userdb.Lookup(item.Engine)
	conn := userdb.Conn{ID: item.ID, Engine: engine, Database: item.DatabaseName, User: item.Username, Password: password}
	return conn, item, u, true
}

func requireSQL(s *Server, w http.ResponseWriter, conn userdb.Conn) bool {
	if userdb.IsSQL(conn.Engine) {
		return true
	}
	s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "this action is available for PostgreSQL, MySQL and MariaDB only"})
	return false
}

func (s *Server) handleDatabaseTables(w http.ResponseWriter, r *http.Request) {
	conn, _, _, ok := s.databaseConn(w, r)
	if !ok {
		return
	}
	names, err := userdb.Tables(r.Context(), conn)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"tables": names, "columnTypes": userdb.ColumnTypes, "sql": userdb.IsSQL(conn.Engine), "engine": conn.Engine.ID})
}

func (s *Server) handleDatabaseBrowse(w http.ResponseWriter, r *http.Request) {
	conn, _, _, ok := s.databaseConn(w, r)
	if !ok || !requireSQL(s, w, conn) {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	res, err := userdb.Browse(r.Context(), conn, r.PathValue("table"), limit, offset)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleDatabaseCreateTable(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok || !requireSQL(s, w, conn) {
		return
	}
	var req struct {
		Name    string          `json:"name"`
		Columns []userdb.Column `json:"columns"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	stmt, err := userdb.BuildCreateTable(conn.Engine, req.Name, req.Columns)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if _, err := userdb.RunSQL(r.Context(), conn, stmt, 1, false); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "database.table.create", "ok", map[string]any{"database": item.Name, "table": req.Name})
	s.writeJSON(w, http.StatusCreated, jsonResponse{"ok": true, "statement": stmt})
}

func (s *Server) handleDatabaseDropTable(w http.ResponseWriter, r *http.Request) {
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok || !requireSQL(s, w, conn) {
		return
	}
	table := r.PathValue("table")
	if err := userdb.DropTable(r.Context(), conn, table); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "database.table.drop", "ok", map[string]any{"database": item.Name, "table": table})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleDatabaseQuery(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok {
		return
	}
	var req struct {
		Statement string `json:"statement"`
		MaxRows   int    `json:"maxRows"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	var (
		res userdb.Result
		err error
	)
	switch {
	case userdb.IsSQL(conn.Engine):
		res, err = userdb.RunSQL(r.Context(), conn, req.Statement, req.MaxRows, false)
	case conn.Engine.ID == "redis":
		res, err = userdb.RunRedis(r.Context(), conn, req.Statement)
	default:
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "the console is not available for this engine"})
		return
	}
	s.auditSensitiveAction(r, u, "database.query", map[bool]string{true: "ok", false: "error"}[err == nil], map[string]any{"database": item.Name})
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleDatabaseUsers(w http.ResponseWriter, r *http.Request) {
	conn, _, _, ok := s.databaseConn(w, r)
	if !ok || !requireSQL(s, w, conn) {
		return
	}
	users, err := userdb.ListUsers(r.Context(), conn)
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"users": users, "owner": conn.User})
}

func (s *Server) handleDatabaseCreateUser(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok || !requireSQL(s, w, conn) {
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Access   string `json:"access"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON"})
		return
	}
	generated := false
	if req.Password == "" {
		pw, err := userdb.RandomPassword(24)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		req.Password, generated = pw, true
	}
	if strings.EqualFold(req.Username, conn.User) || strings.EqualFold(req.Username, "root") || strings.EqualFold(req.Username, "postgres") {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "this user name is reserved"})
		return
	}
	stmts, err := userdb.BuildCreateUser(conn.Engine, conn.Database, req.Username, req.Password, req.Access)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := userdb.RunScript(ctx, conn, stmts); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "database.user.create", "ok", map[string]any{"database": item.Name, "user": req.Username, "access": req.Access})
	resp := jsonResponse{"ok": true, "username": req.Username}
	if generated {
		resp["password"] = req.Password
	}
	s.writeJSON(w, http.StatusCreated, resp)
}

func (s *Server) handleDatabaseDeleteUser(w http.ResponseWriter, r *http.Request) {
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok || !requireSQL(s, w, conn) {
		return
	}
	name := r.PathValue("name")
	if strings.EqualFold(name, conn.User) || strings.EqualFold(name, "root") || strings.EqualFold(name, "postgres") {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "the owner account cannot be removed"})
		return
	}
	stmts, err := userdb.BuildDropUser(conn.Engine, conn.Database, name)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if err := userdb.RunScript(r.Context(), conn, stmts); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "database.user.delete", "ok", map[string]any{"database": item.Name, "user": name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

// handleDatabaseSetPassword changes the main account's password (generated when none is given).
func (s *Server) handleDatabaseSetPassword(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	conn, item, u, ok := s.databaseConn(w, r)
	if !ok {
		return
	}
	var req struct {
		NewPassword string `json:"newPassword"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	password := req.NewPassword
	if password == "" {
		pw, err := userdb.RandomPassword(24)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, err)
			return
		}
		password = pw
	}
	if err := userdb.ValidatePassword(password); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	var err error
	switch conn.Engine.ID {
	case "postgres":
		var stmts []string
		stmts, err = userdb.BuildSetPassword(conn.Engine, conn.User, password)
		if err == nil {
			err = userdb.RunScript(r.Context(), conn, stmts)
		}
	case "mysql", "mariadb":
		// keep root and the app user on the same secret so the panel can always administer the database
		stmts := []string{
			"ALTER USER '" + conn.User + "'@'%' IDENTIFIED BY '" + password + "'",
			"ALTER USER 'root'@'%' IDENTIFIED BY '" + password + "'",
			"ALTER USER 'root'@'localhost' IDENTIFIED BY '" + password + "'",
			"FLUSH PRIVILEGES",
		}
		err = userdb.RunScript(r.Context(), conn, stmts)
	case "mongodb":
		err = userdb.SetMongoPassword(r.Context(), conn, password)
	case "redis":
		spec := userdb.Spec{ID: item.ID, OwnerID: u.ID, OwnerName: u.Username, Engine: conn.Engine, Version: item.Version, HostPort: item.HostPort, Password: password}
		if quota, _ := s.database.GetUserQuota(u.ID); quota != nil {
			spec.MemoryMB = quota.MemoryLimitMB
			if quota.CPULimitPct > 0 {
				spec.CPULimit = float64(quota.CPULimitPct) / 100
			}
		}
		err = userdb.Recreate(spec)
	default:
		err = errors.New("unsupported engine")
	}
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return
	}

	encrypted, encErr := crypto.Encrypt(s.cfg.EncryptionKey, password)
	if encErr != nil {
		s.writeError(w, http.StatusInternalServerError, encErr)
		return
	}
	if err := s.database.SetManagedDatabasePassword(item.ID, u.ID, encrypted); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, u, "database.password", "ok", map[string]any{"database": item.Name})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "password": password})
}
