package httpserver

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"

	socketlist "github.com/friskipradana/panel-desktop-ui/internal/listening"
	"github.com/friskipradana/panel-desktop-ui/internal/ufw"
)

// The firewall window (superadmin): the state of ufw and its rules, the ports this machine listens on, and the databases opened to
// addresses. Every change is one ufw command, and a change that could lock the owner out needs a confirmation.

const firewallComment = "Reneo"

// protectedPorts are the ports the owner needs to get back in: SSH, the panel itself, and the web ports while the public proxy is on.
func (s *Server) protectedPorts() []ufw.Protected {
	list := []ufw.Protected{}
	seen := map[int]bool{}
	add := func(port int, reason string) {
		if port > 0 && !seen[port] {
			seen[port] = true
			list = append(list, ufw.Protected{Port: port, Reason: reason})
		}
	}
	ssh := 22
	if listeners, err := socketlist.List(); err == nil {
		for _, l := range listeners {
			if l.Proto == "tcp" && l.Process == "sshd" {
				ssh = l.Port
				break
			}
		}
	}
	add(ssh, "ssh")
	if _, port, err := net.SplitHostPort(s.cfg.BindAddr); err == nil {
		if n, err := strconv.Atoi(port); err == nil {
			add(n, "panel")
		}
	}
	if settings := s.loadSiteSettings(); settings.PublicProxyEnabled && settings.PublicProxyConfirmedAt != nil {
		for _, p := range s.webPorts() {
			add(p, "web")
		}
	}
	return list
}

type listenerView struct {
	socketlist.Listener
	// Exposure: local (loopback only), docker (published by Docker, which ufw does not filter), unfiltered (no active firewall),
	// open (a rule lets it in), blocked (the firewall keeps it out)
	Exposure string `json:"exposure"`
}

func exposureOf(l socketlist.Listener, d ufw.Detail) string {
	switch {
	case l.Loopback:
		return "local"
	case l.Process == "docker-proxy":
		return "docker"
	case !d.Installed || !d.Active:
		return "unfiltered"
	case ufw.Allows(d, l.Proto, l.Port):
		return "open"
	default:
		return "blocked"
	}
}

func (s *Server) firewallState() jsonResponse {
	d := ufw.Inspect()
	listeners := []listenerView{}
	if list, err := socketlist.List(); err == nil {
		for _, l := range list {
			listeners = append(listeners, listenerView{Listener: l, Exposure: exposureOf(l, d)})
		}
	}
	databases := []jsonResponse{}
	if s.database != nil && s.database.IsConnected() {
		if list, err := s.database.ListManagedDatabases(0, true); err == nil {
			for _, item := range list {
				if item.AccessMode == "ips" {
					databases = append(databases, jsonResponse{"id": item.ID, "name": item.Name, "owner": item.OwnerName, "port": item.HostPort, "ips": item.AccessIPs})
				}
			}
		}
	}
	return jsonResponse{"ufw": d, "protected": s.protectedPorts(), "listeners": listeners, "databases": databases}
}

func (s *Server) handleFirewall(w http.ResponseWriter, _ *http.Request) {
	s.writeJSON(w, http.StatusOK, s.firewallState())
}

// riskReply says that a change would cut off the ports in the list, and that it needs "confirm" to go through
func (s *Server) riskReply(w http.ResponseWriter, ports []ufw.Protected) {
	names := make([]string, 0, len(ports))
	for _, p := range ports {
		names = append(names, fmt.Sprintf("%d (%s)", p.Port, p.Reason))
	}
	s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "this change would cut off " + strings.Join(names, ", "), "risk": true, "ports": ports})
}

func (s *Server) firewallAudit(r *http.Request, action string, meta map[string]any) {
	if u := userFromCtx(r); u != nil {
		s.auditSensitiveAction(r, u, "firewall."+action, "ok", meta)
	}
}

func (s *Server) firewallDone(w http.ResponseWriter, err error) bool {
	if err != nil {
		s.writeJSON(w, http.StatusBadGateway, jsonResponse{"error": err.Error()})
		return false
	}
	return true
}

func (s *Server) handleFirewallEnable(w http.ResponseWriter, r *http.Request) {
	protected := s.protectedPorts()
	if !s.firewallDone(w, ufw.Enable(protected, firewallComment)) {
		return
	}
	s.firewallAudit(r, "enable", map[string]any{"allowed": protected})
	s.writeJSON(w, http.StatusOK, s.firewallState())
}

func (s *Server) handleFirewallDisable(w http.ResponseWriter, r *http.Request) {
	if !s.firewallDone(w, ufw.Disable()) {
		return
	}
	s.firewallAudit(r, "disable", nil)
	s.writeJSON(w, http.StatusOK, s.firewallState())
}

func (s *Server) handleFirewallReload(w http.ResponseWriter, r *http.Request) {
	if !s.firewallDone(w, ufw.Reload()) {
		return
	}
	s.firewallAudit(r, "reload", nil)
	s.writeJSON(w, http.StatusOK, s.firewallState())
}

func (s *Server) handleFirewallDefault(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		Direction string `json:"direction"`
		Policy    string `json:"policy"`
		Confirm   bool   `json:"confirm"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid request"})
		return
	}
	if req.Direction == "incoming" && req.Policy != "allow" {
		if d := ufw.Inspect(); d.Active && d.Incoming != req.Policy {
			if cuts := ufw.DefaultCuts(d, s.protectedPorts()); len(cuts) > 0 && !req.Confirm {
				s.riskReply(w, cuts)
				return
			}
		}
	}
	if err := ufw.SetDefault(req.Direction, req.Policy); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.firewallAudit(r, "default", map[string]any{"direction": req.Direction, "policy": req.Policy})
	s.writeJSON(w, http.StatusOK, s.firewallState())
}

func (s *Server) handleFirewallLogging(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		Level string `json:"level"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid request"})
		return
	}
	if err := ufw.SetLogging(req.Level); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	s.firewallAudit(r, "logging", map[string]any{"level": req.Level})
	s.writeJSON(w, http.StatusOK, s.firewallState())
}

func (s *Server) handleFirewallAddRule(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		ufw.RuleSpec
		Confirm bool `json:"confirm"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid request"})
		return
	}
	if _, err := req.RuleSpec.Args(); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}
	if cuts := req.RuleSpec.Blocks(s.protectedPorts()); len(cuts) > 0 && !req.Confirm {
		s.riskReply(w, cuts)
		return
	}
	if !s.firewallDone(w, ufw.AddRule(req.RuleSpec)) {
		return
	}
	s.firewallAudit(r, "rule.add", map[string]any{"action": req.Action, "direction": req.Direction, "proto": req.Proto, "port": req.Port, "from": req.From})
	s.writeJSON(w, http.StatusOK, s.firewallState())
}

func (s *Server) handleFirewallDeleteRule(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req struct {
		Number  int    `json:"number"`
		To      string `json:"to"`
		Action  string `json:"action"`
		From    string `json:"from"`
		Confirm bool   `json:"confirm"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil || req.Number < 1 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid request"})
		return
	}
	rule := ufw.Rule{Number: req.Number, To: req.To, Action: req.Action, From: req.From}
	d := ufw.Inspect()
	for _, current := range d.Rules {
		if current.Number == req.Number && current.To == rule.To && current.Action == rule.Action && current.From == rule.From {
			if cuts := ufw.RemovalCuts(current, d, s.protectedPorts()); len(cuts) > 0 && !req.Confirm {
				s.riskReply(w, cuts)
				return
			}
		}
	}
	if err := ufw.DeleteRule(req.Number, rule); err != nil {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": err.Error()})
		return
	}
	s.firewallAudit(r, "rule.delete", map[string]any{"to": req.To, "action": req.Action, "from": req.From})
	s.writeJSON(w, http.StatusOK, s.firewallState())
}
