package httpserver

import (
	"encoding/json"
	"net/http"
	"runtime"

	"github.com/friskipradana/panel-desktop-ui/internal/hostops"
)

func (s *Server) handleSecurityHardeningOverview(w http.ResponseWriter, r *http.Request) {
	keys, keysPath, _ := hostops.ListSSHKeys()
	f2b := hostops.InspectFail2Ban(r.Context())
	failedLogins := hostops.RecentFailedSSHLogins(r.Context(), 30)
	pkgMgr, upgradable := hostops.ListOSUpdates(r.Context())
	s.writeJSON(w, http.StatusOK, hostops.SecurityHardeningOverview{
		OS:             runtime.GOOS,
		SSHKeysPath:    keysPath,
		SSHKeys:        keys,
		Fail2Ban:       f2b,
		FailedLogins:   failedLogins,
		PackageManager: pkgMgr,
		Upgradable:     upgradable,
	})
}

func (s *Server) handleAddSSHKey(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	defer r.Body.Close()
	var req struct {
		PublicKey string `json:"publicKey"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
		return
	}
	key, err := hostops.AddSSHKey(req.PublicKey)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "security.sshkey.add", "ok", map[string]any{"fingerprint": key.Fingerprint, "comment": key.Comment})
	s.writeJSON(w, http.StatusCreated, key)
}

func (s *Server) handleDeleteSSHKey(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	id := r.PathValue("id")
	if err := hostops.DeleteSSHKey(id); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.auditSensitiveAction(r, u, "security.sshkey.delete", "ok", map[string]any{"id": id})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func (s *Server) handleFail2BanAction(action string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := userFromCtx(r)
		defer r.Body.Close()
		var req struct {
			Jail string `json:"jail"`
			IP   string `json:"ip"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "format JSON tidak valid"})
			return
		}
		if err := hostops.Fail2BanIPAction(r.Context(), req.Jail, action, req.IP); err != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
			return
		}
		s.auditSensitiveAction(r, u, "security.fail2ban."+action, "ok", map[string]any{"jail": req.Jail, "ip": req.IP})
		s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
	}
}

func (s *Server) handleApplyOSUpdates(w http.ResponseWriter, r *http.Request) {
	u := userFromCtx(r)
	out, err := hostops.ApplyOSUpdates(r.Context())
	if err != nil {
		s.auditSensitiveAction(r, u, "security.os.upgrade", "error", map[string]any{"error": err.Error()})
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error(), "output": out})
		return
	}
	s.auditSensitiveAction(r, u, "security.os.upgrade", "ok", nil)
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "output": out})
}
