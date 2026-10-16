package mcp

import "testing"

func toolSet(role string) map[string]bool {
	srv := BuildServer(Config{PanelURL: "http://127.0.0.1:1"}, role, "ypat_test")
	set := map[string]bool{}
	for _, tl := range srv.Tools() {
		set[tl.Name] = true
	}
	return set
}

// Accounts other than the superadmin must never get a tool that acts on the machine directly.
func TestNonSuperadminHasNoDirectHostTools(t *testing.T) {
	hostOnly := []string{"system_logs", "firewall_status", "firewall_allow", "disk_cleanup", "disk_usage_breakdown",
		"postgres_listen_set", "service_manage", "network_ports_list", "quick_deploy_static", "pm2_list",
		"system_history", "settings_get", "settings_update", "database_status", "update_apply"}
	for _, role := range []string{"admin", "user"} {
		tools := toolSet(role)
		for _, name := range hostOnly {
			if tools[name] {
				t.Errorf("%s must not have %s", role, name)
			}
		}
		for _, name := range []string{"terminal_exec", "file_read", "file_write", "docker_list_containers", "system_info"} {
			if !tools[name] {
				t.Errorf("%s should have the account-scoped %s", role, name)
			}
		}
	}
	super := toolSet("superadmin")
	for _, name := range []string{"system_logs", "firewall_status", "pm2_list", "settings_get", "terminal_exec"} {
		if !super[name] {
			t.Errorf("superadmin should have %s", name)
		}
	}
}
