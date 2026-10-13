package mcp

import (
	"fmt"
	"strconv"
	"strings"
)

func octalMode(v any) (any, error) {
	s := strings.TrimSpace(fmt.Sprint(v))
	s = strings.TrimPrefix(s, "0o")
	n, err := strconv.ParseUint(s, 8, 32)
	if err != nil || n > 0o7777 {
		return nil, fmt.Errorf("mode must be an octal string such as \"755\" or \"644\"")
	}
	return n, nil
}

var (
	portItems = &Property{
		Type:        "object",
		Description: `Port mapping: {"hostPort":"8080","containerPort":"80","protocol":"tcp","hostIp":"optional"}`,
	}
	envItems = &Property{
		Type:        "object",
		Description: `Environment variable: {"key":"NAME","value":"value"}`,
	}
	volumeItems = &Property{
		Type:        "object",
		Description: `Volume binding: {"hostPath":"/srv/data","containerPath":"/data","readOnly":false}`,
	}
	stringItems = &Property{Type: "string"}
)

func arrayParam(name, desc string, items *Property) apiParam {
	return apiParam{Name: name, In: inBody, Type: "array", Desc: desc, Items: items}
}

func objectParam(name, desc string, required bool) apiParam {
	return apiParam{Name: name, In: inBody, Type: "object", Desc: desc, Required: required}
}

// flattenParam sends the object's entries as the request body itself.
func flattenParam(name, desc string) apiParam {
	p := objectParam(name, desc, true)
	p.Flatten = true
	return p
}

// registerCatalogTools registers the REST-backed tool catalog.
func registerCatalogTools(s *Server, client *apiClient, isAdmin bool) {
	registerSpecs(s, client, isAdmin, catalogSpecs())
}

func catalogSpecs() []apiSpec {
	zone := apiParam{Name: "zone_id", Key: "zoneId", In: inPath, Type: "string", Required: true, Desc: "Cloudflare zone ID (from cloudflare_list_domains)."}
	record := apiParam{Name: "record_id", Key: "recordId", In: inPath, Type: "string", Required: true, Desc: "DNS record ID (from cloudflare_list_dns)."}
	profile := apiParam{Name: "profile_id", Key: "profileId", In: inPath, Type: "string", Required: true, Desc: "Tunnel profile ID (from cloudflare_list_tunnel_profiles)."}

	specs := []apiSpec{
		// ── Account & notifications ───────────────────────────────────────
		{Name: "whoami", Title: "Current account", Method: "GET", Path: "/api/v1/me",
			Desc: "Return the account this MCP token acts as (username, role, status). Call this first to learn which tools are allowed."},
		{Name: "notification_list", Title: "List notifications", Method: "GET", Path: "/api/v1/notifications",
			Desc:   "List panel notifications for the current account (deploys, user changes, warnings).",
			Params: []apiParam{queryParam("limit", "integer", "Maximum notifications to return.")}},
		{Name: "notification_mark_read", Title: "Mark notification read", Method: "POST", Path: "/api/v1/notifications/{id}/read",
			Desc: "Mark one notification as read.", Params: []apiParam{pathParam("id", "Notification ID.")}},
		{Name: "notification_mark_all_read", Title: "Mark all notifications read", Method: "POST", Path: "/api/v1/notifications/read-all",
			Desc: "Mark every notification of the current account as read."},
		{Name: "api_token_list", Title: "List API tokens", Method: "GET", Path: "/api/v1/me/api-tokens",
			Desc: "List the account's API tokens (prefix, name, expiry, last use). Secrets are never returned."},
		{Name: "api_token_revoke", Title: "Revoke API token", Method: "DELETE", Path: "/api/v1/me/api-tokens/{id}",
			Desc:   "Revoke an API token by ID. Revoking the token this MCP session uses ends the session.",
			Params: []apiParam{pathParam("id", "API token ID (from api_token_list).")}},

		// ── System ────────────────────────────────────────────────────────
		{Name: "system_history", Title: "Metrics history", Method: "GET", Path: "/api/v1/system/history",
			Desc:   "Recorded host metric series for the last hour at 5s resolution: cpu, ram, disk (percent), temp (C), net-rx and net-tx (bytes/s). Each point is {t: epoch ms, v: value}. Use `since` for incremental reads.",
			Params: []apiParam{queryParam("since", "integer", "Only return points newer than this epoch-ms timestamp.")}},
		{Name: "system_changelog", Title: "Panel changelog", Method: "GET", Path: "/api/v1/system/changelog",
			Desc: "Release notes of the installed YPanel versions."},
		{Name: "ping_host", Title: "Ping a host", Method: "POST", Path: "/api/v1/tools/ping", AdminOnly: true, Hint: "read",
			Desc: "Measure reachability and latency from the server. Without `port` it sends an ICMP echo; with `port` it times a TCP connect. Returns {ok, latencyMs, resolved, error}.",
			Params: []apiParam{
				strParam("host", "IP address or hostname (no URL, no flags).", true),
				intParam("port", "TCP port (1-65535). Omit for ICMP.", false),
			}},
		{Name: "database_status", Title: "Database status", Method: "GET", Path: "/api/v1/database/status", AdminOnly: true,
			Desc: "Connection state and basic statistics of the panel PostgreSQL database."},
		{Name: "settings_get", Title: "System settings", Method: "GET", Path: "/api/v1/settings/system", AdminOnly: true,
			Desc: "Read host settings the panel manages: hostname, timezone, nameservers."},
		{Name: "settings_update", Title: "Update system settings", Method: "POST", Path: "/api/v1/settings/system", AdminOnly: true, Hint: "write",
			Desc: "Change hostname, timezone or nameservers. Send all three fields (read them first with settings_get).",
			Params: []apiParam{
				strParam("hostname", "New hostname.", true),
				strParam("timezone", "IANA timezone, e.g. Asia/Jakarta.", true),
				arrayParam("nameservers", "DNS nameserver IPs.", stringItems),
			}},

		// ── Projects ──────────────────────────────────────────────────────
		{Name: "project_attention_summary", Title: "Projects needing attention", Method: "GET", Path: "/api/v1/projects/attention-summary",
			Desc: "Counts of projects that are degraded, drifted or otherwise need attention."},
		{Name: "project_create", Title: "Create project", Method: "POST", Path: "/api/v1/projects", Hint: "write",
			Desc: "Create a project record. Types: static, nodejs, python, php, docker, proxy, custom. Use project_start afterwards to run it.",
			Params: []apiParam{
				strParam("name", "Project name.", true),
				strParam("description", "Short description.", false),
				{Name: "project_type", Key: "projectType", In: inBody, Type: "string", Desc: "Project type.", Enum: []string{"static", "nodejs", "python", "php", "docker", "proxy", "custom"}},
				{Name: "repo_url", Key: "repoUrl", In: inBody, Type: "string", Desc: "Git repository URL."},
				{Name: "working_dir", Key: "workingDir", In: inBody, Type: "string", Desc: "Working directory on the server."},
				{Name: "spa_fallback", Key: "spaFallback", In: inBody, Type: "boolean", Desc: "Serve index.html for unknown paths (static SPA)."},
			}},
		{Name: "project_update", Title: "Update project", Method: "PUT", Path: "/api/v1/projects/{id}", Hint: "write",
			Desc: "Replace a project's settings. `name` is required; omitted optional fields keep their server defaults.",
			Params: []apiParam{
				pathParam("id", "Project ID."),
				strParam("name", "Project name.", true),
				strParam("description", "Short description.", false),
				{Name: "project_type", Key: "projectType", In: inBody, Type: "string", Desc: "Project type.", Enum: []string{"static", "nodejs", "python", "php", "docker", "proxy", "custom"}},
				{Name: "repo_url", Key: "repoUrl", In: inBody, Type: "string", Desc: "Git repository URL."},
				{Name: "working_dir", Key: "workingDir", In: inBody, Type: "string", Desc: "Working directory on the server."},
				{Name: "spa_fallback", Key: "spaFallback", In: inBody, Type: "boolean", Desc: "Serve index.html for unknown paths."},
			}},
		{Name: "project_delete", Title: "Delete project", Method: "DELETE", Path: "/api/v1/projects/{id}",
			Desc:   "Delete a project and its configuration. Ask the user before calling.",
			Params: []apiParam{pathParam("id", "Project ID.")}},

		// ── Tunnels ───────────────────────────────────────────────────────
		{Name: "tunnel_list", Title: "List tunnels", Method: "GET", Path: "/api/v1/tunnels",
			Desc: "List Cloudflare tunnel ingress entries (hostname to local service) of the account."},
		{Name: "tunnel_get", Title: "Get tunnel", Method: "GET", Path: "/api/v1/tunnels/{id}",
			Desc: "Get one tunnel entry.", Params: []apiParam{pathParam("id", "Tunnel ID.")}},
		{Name: "tunnel_create", Title: "Create tunnel", Method: "POST", Path: "/api/v1/tunnels", Hint: "write",
			Desc:   "Expose a local service at subdomain.domain through a Cloudflare tunnel profile. For one-step static deploys prefer quick_deploy_static.",
			Params: tunnelParams(false)},
		{Name: "tunnel_update", Title: "Update tunnel", Method: "PUT", Path: "/api/v1/tunnels/{id}", Hint: "write",
			Desc: "Replace a tunnel entry's settings.", Params: append([]apiParam{pathParam("id", "Tunnel ID.")}, tunnelParams(true)...)},
		{Name: "tunnel_delete", Title: "Delete tunnel", Method: "DELETE", Path: "/api/v1/tunnels/{id}",
			Desc:   "Remove a tunnel entry and its public route. Ask the user before calling.",
			Params: []apiParam{pathParam("id", "Tunnel ID.")}},

		// ── Cloudflare ────────────────────────────────────────────────────
		{Name: "cloudflare_get_config", Title: "Cloudflare config", Method: "GET", Path: "/api/v1/me/cloudflare",
			Desc: "Show whether a Cloudflare API token is configured for the account, its status and base domain (the token itself is never returned)."},
		{Name: "cloudflare_list_zones", Title: "List Cloudflare zones", Method: "GET", Path: "/api/v1/me/cloudflare/zones",
			Desc: "List zones visible to the configured Cloudflare token."},
		{Name: "cloudflare_update_dns", Title: "Update DNS record", Method: "PUT", Path: "/api/v1/cloudflare/domains/{zoneId}/dns/{recordId}", Hint: "write",
			Desc: "Replace a DNS record. Send the full desired record (type, name, content, ttl, proxied).",
			Params: []apiParam{zone, record,
				strParam("type", "Record type: A, AAAA, CNAME, TXT, MX...", true),
				strParam("name", "Record name (FQDN or @).", true),
				strParam("content", "Record value.", true),
				intParam("ttl", "TTL in seconds; 1 = automatic.", false),
				boolParam("proxied", "Proxy through Cloudflare (orange cloud)."),
				strParam("comment", "Optional note.", false),
			}},
		{Name: "cloudflare_list_tunnel_routes", Title: "List tunnel routes", Method: "GET", Path: "/api/v1/cloudflare/tunnel-profiles/{profileId}/routes",
			Desc: "List public hostname routes configured on a Cloudflare tunnel profile.", Params: []apiParam{profile}},
		{Name: "cloudflare_create_tunnel_profile", Title: "Create tunnel profile", Method: "POST", Path: "/api/v1/cloudflare/tunnel-profiles", Hint: "write",
			Desc: "Register a Cloudflare tunnel profile (mode and tunnel ID) the panel can route through.",
			Params: []apiParam{
				{Name: "mode", In: inBody, Type: "string", Desc: "managed creates a new Cloudflare tunnel; custom attaches an existing one (requires tunnel_id).", Enum: []string{"managed", "custom"}},
				strParam("name", "Profile name.", true),
				{Name: "tunnel_id", Key: "tunnelId", In: inBody, Type: "string", Desc: "Existing Cloudflare tunnel ID, if any."},
			}},
		{Name: "cloudflare_delete_tunnel_profile", Title: "Delete tunnel profile", Method: "DELETE", Path: "/api/v1/cloudflare/tunnel-profiles/{profileId}",
			Desc: "Delete a tunnel profile. Ask the user before calling.", Params: []apiParam{profile}},

		// ── Docker (REST, owner-scoped) ───────────────────────────────────
		{Name: "docker_inspect_container", Title: "Inspect container", Method: "GET", Path: "/api/v1/containers/{id}/config",
			Desc:   "Return a container's effective configuration: image, ports, env, volumes, network, restart policy.",
			Params: []apiParam{pathParam("id", "Container ID or name.")}},
		{Name: "docker_deploy_image", Title: "Deploy image", Method: "POST", Path: "/api/v1/containers/deploy-image", Hint: "write",
			Desc: "Pull and run a Docker image as a new container (compose-managed). Returns the deployment result.",
			Params: []apiParam{
				strParam("name", "Container/project name.", true),
				strParam("image", "Image reference, e.g. nginx:1.27.", true),
				strParam("network", "Docker network to join.", false),
				arrayParam("ports", "Port mappings.", portItems),
				arrayParam("env", "Environment variables.", envItems),
				arrayParam("volumes", "Volume bindings.", volumeItems),
				{Name: "replace_container_id", Key: "replaceContainerId", In: inBody, Type: "string", Desc: "Existing container to replace (redeploy)."},
			}},
		{Name: "docker_deploy_compose", Title: "Deploy compose", Method: "POST", Path: "/api/v1/containers/deploy-compose", Hint: "write",
			Desc: "Deploy a Docker Compose stack from YAML content.",
			Params: []apiParam{
				strParam("name", "Stack/project name.", true),
				{Name: "compose_yaml", Key: "composeYaml", In: inBody, Type: "string", Desc: "Full docker-compose YAML.", Required: true},
				{Name: "replace_container_id", Key: "replaceContainerId", In: inBody, Type: "string", Desc: "Existing container to replace."},
			}},
		{Name: "docker_list_images", Title: "List images", Method: "GET", Path: "/api/v1/docker/images",
			Desc: "List local Docker images with size, tags and owners."},
		{Name: "docker_pull_image", Title: "Pull image", Method: "POST", Path: "/api/v1/docker/images/pull", Hint: "write",
			Desc: "Pull an image from a registry.", Params: []apiParam{strParam("image", "Image reference, e.g. redis:7.", true)}},
		{Name: "docker_remove_image", Title: "Remove image", Method: "DELETE", Path: "/api/v1/docker/images/{id}",
			Desc: "Remove a local image. Fails when a container still uses it.", Params: []apiParam{pathParam("id", "Image ID.")}},
		{Name: "docker_list_networks", Title: "List networks", Method: "GET", Path: "/api/v1/docker/networks",
			Desc: "List Docker networks with driver, subnet and attached containers."},
		{Name: "docker_create_network", Title: "Create network", Method: "POST", Path: "/api/v1/docker/networks", Hint: "write",
			Desc: "Create a bridge network, optionally with subnet and gateway.",
			Params: []apiParam{
				strParam("name", "Network name.", true),
				strParam("subnet", "CIDR, e.g. 172.30.0.0/24.", false),
				strParam("gateway", "Gateway IP inside the subnet.", false),
			}},
		{Name: "docker_remove_network", Title: "Remove network", Method: "DELETE", Path: "/api/v1/docker/networks/{id}",
			Desc: "Remove a Docker network.", Params: []apiParam{pathParam("id", "Network ID.")}},
		{Name: "docker_list_templates", Title: "List compose templates", Method: "GET", Path: "/api/v1/docker/templates",
			Desc: "List saved Docker Compose templates."},
		{Name: "docker_create_template", Title: "Save compose template", Method: "POST", Path: "/api/v1/docker/templates", Hint: "write",
			Desc: "Save a Docker Compose template for later reuse.",
			Params: []apiParam{
				strParam("name", "Template name.", true),
				strParam("description", "What the template deploys.", false),
				{Name: "yaml_content", Key: "yamlContent", In: inBody, Type: "string", Desc: "Compose YAML.", Required: true},
			}},
		{Name: "docker_delete_template", Title: "Delete compose template", Method: "DELETE", Path: "/api/v1/docker/templates/{id}",
			Desc: "Delete a saved template.", Params: []apiParam{pathParam("id", "Template ID.")}},

		// ── Files (REST, root-access rules apply) ─────────────────────────
		{Name: "file_rename", Title: "Rename file", Method: "POST", Path: "/api/v1/files/rename", Hint: "write",
			Desc: "Rename a file or directory.",
			Params: []apiParam{
				{Name: "old_path", Key: "oldPath", In: inBody, Type: "string", Required: true, Desc: "Current absolute path."},
				{Name: "new_path", Key: "newPath", In: inBody, Type: "string", Required: true, Desc: "New absolute path."},
			}},
		{Name: "file_move", Title: "Move file", Method: "POST", Path: "/api/v1/files/move", Hint: "write",
			Desc: "Move a file or directory to another location.",
			Params: []apiParam{
				{Name: "old_path", Key: "oldPath", In: inBody, Type: "string", Required: true, Desc: "Source absolute path."},
				{Name: "new_path", Key: "newPath", In: inBody, Type: "string", Required: true, Desc: "Destination absolute path."},
			}},
		{Name: "file_copy", Title: "Copy file", Method: "POST", Path: "/api/v1/files/copy", Hint: "write",
			Desc: "Copy a file or directory.",
			Params: []apiParam{
				{Name: "old_path", Key: "oldPath", In: inBody, Type: "string", Required: true, Desc: "Source absolute path."},
				{Name: "new_path", Key: "newPath", In: inBody, Type: "string", Required: true, Desc: "Destination absolute path."},
			}},
		{Name: "file_touch", Title: "Create empty file", Method: "POST", Path: "/api/v1/files/touch", Hint: "write",
			Desc: "Create an empty file or update its timestamp.", Params: []apiParam{strParam("path", "Absolute file path.", true)}},
		{Name: "file_chmod", Title: "Change permissions", Method: "POST", Path: "/api/v1/files/chmod", Hint: "write",
			Desc: "Change file mode. Pass an octal string such as \"755\" or \"644\".",
			Params: []apiParam{
				strParam("path", "Absolute path.", true),
				{Name: "mode", In: inBody, Type: "string", Required: true, Desc: `Octal mode string, e.g. "755".`, Convert: octalMode},
				boolParam("recursive", "Apply to directory contents."),
			}},
		{Name: "file_compress", Title: "Create archive", Method: "POST", Path: "/api/v1/files/compress", Hint: "write",
			Desc: "Compress a file or directory into an archive next to it.",
			Params: []apiParam{
				strParam("target", "Absolute path to compress.", true),
				{Name: "dest_name", Key: "destName", In: inBody, Type: "string", Desc: "Archive file name, e.g. backup.zip."},
			}},
		{Name: "file_extract", Title: "Extract archive", Method: "POST", Path: "/api/v1/files/extract", Hint: "write",
			Desc: "Extract an archive into a directory.",
			Params: []apiParam{
				strParam("source", "Absolute path of the archive.", true),
				strParam("dest", "Destination directory.", true),
			}},

		// ── Documentation (panel docs) ────────────────────────────────────
		{Name: "docs_list", Title: "List docs", Method: "GET", Path: "/api/v1/docs",
			Desc: "List documentation pages stored in the panel."},
		{Name: "docs_get", Title: "Read doc", Method: "GET", Path: "/api/v1/docs/{id}",
			Desc: "Read one documentation page.", Params: []apiParam{pathParam("id", "Doc ID or slug.")}},
		{Name: "docs_create", Title: "Create doc", Method: "POST", Path: "/api/v1/docs", AdminOnly: true, Hint: "write",
			Desc: "Create a documentation page (Markdown content).", Params: docParams(false)},
		{Name: "docs_update", Title: "Update doc", Method: "PATCH", Path: "/api/v1/docs/{id}", AdminOnly: true, Hint: "write",
			Desc: "Update a documentation page.", Params: append([]apiParam{pathParam("id", "Doc ID.")}, docParams(true)...)},
		{Name: "docs_delete", Title: "Delete doc", Method: "DELETE", Path: "/api/v1/docs/{id}", AdminOnly: true,
			Desc: "Delete a documentation page.", Params: []apiParam{pathParam("id", "Doc ID.")}},

		// ── Terminal presets ──────────────────────────────────────────────
		{Name: "terminal_presets_list", Title: "List terminal presets", Method: "GET", Path: "/api/v1/terminal/presets",
			Desc: "List saved terminal command presets of the account."},

		// ── Users (admin) ─────────────────────────────────────────────────
		{Name: "user_create", Title: "Create user", Method: "POST", Path: "/api/v1/users", AdminOnly: true, Hint: "write",
			Desc: "Create a panel user. Role is user, admin or superadmin (only a superadmin may grant superadmin).",
			Params: []apiParam{
				strParam("username", "Unique username.", true),
				strParam("email", "Email address.", true),
				strParam("password", "Initial password (min 8 characters).", true),
				{Name: "role", In: inBody, Type: "string", Desc: "Account role.", Enum: []string{"user", "admin", "superadmin"}},
				{Name: "display_name", Key: "displayName", In: inBody, Type: "string", Desc: "Display name."},
			}},
		{Name: "user_update", Title: "Update user", Method: "PATCH", Path: "/api/v1/users/{id}", AdminOnly: true, Hint: "write",
			Desc:   "Update user fields. Pass the fields to change as `fields`, e.g. {\"displayName\":\"Ana\",\"email\":\"a@x.io\"}.",
			Params: []apiParam{pathParam("id", "User ID."), flattenParam("fields", "Fields to change.")}},
		{Name: "user_delete", Title: "Delete user", Method: "DELETE", Path: "/api/v1/users/{id}", AdminOnly: true,
			Desc:   "Permanently delete a user (superadmin only). Ask the user before calling.",
			Params: []apiParam{pathParam("id", "User ID.")}},
		{Name: "user_quota_get", Title: "Get user quota", Method: "GET", Path: "/api/v1/users/{id}/quota", AdminOnly: true,
			Desc:   "Read a user's resource quota (projects, tunnels, disk, CPU, memory).",
			Params: []apiParam{pathParam("id", "User ID.")}},
		{Name: "user_quota_set", Title: "Set user quota", Method: "PATCH", Path: "/api/v1/users/{id}/quota", AdminOnly: true, Hint: "write",
			Desc: "Set a user's resource quota. Read the current values first and send all fields.",
			Params: []apiParam{
				pathParam("id", "User ID."),
				{Name: "max_projects", Key: "maxProjects", In: inBody, Type: "integer", Desc: "Maximum projects."},
				{Name: "max_tunnels", Key: "maxTunnels", In: inBody, Type: "integer", Desc: "Maximum tunnels."},
				{Name: "disk_quota_mb", Key: "diskQuotaMb", In: inBody, Type: "integer", Desc: "Disk quota in MB."},
				{Name: "cpu_limit_pct", Key: "cpuLimitPct", In: inBody, Type: "integer", Desc: "CPU limit percent."},
				{Name: "memory_limit_mb", Key: "memoryLimitMb", In: inBody, Type: "integer", Desc: "Memory limit in MB."},
			}},
	}
	return specs
}

func tunnelParams(requireName bool) []apiParam {
	return []apiParam{
		strParam("name", "Human-readable label.", requireName),
		strParam("subdomain", "Subdomain part, e.g. app.", false),
		strParam("domain", "Base domain, e.g. example.com.", false),
		{Name: "zone_id", Key: "zoneId", In: inBody, Type: "string", Desc: "Cloudflare zone ID of the domain."},
		strParam("path", "URL path prefix to route (optional).", false),
		{Name: "protocol", In: inBody, Type: "string", Desc: "Origin protocol.", Enum: []string{"http", "https", "tcp", "ssh"}},
		strParam("ip", "Origin IP, usually 127.0.0.1.", false),
		strParam("port", "Origin port.", false),
		{Name: "profile_id", Key: "profileId", In: inBody, Type: "string", Desc: "Tunnel profile ID."},
		{Name: "project_id", Key: "projectId", In: inBody, Type: "integer", Desc: "Project to link this tunnel to."},
	}
}

func docParams(optional bool) []apiParam {
	return []apiParam{
		strParam("title", "Page title.", !optional),
		strParam("slug", "URL slug.", false),
		strParam("excerpt", "Short summary.", false),
		strParam("content", "Markdown content.", false),
		{Name: "status", In: inBody, Type: "string", Desc: "Publication status.", Enum: []string{"draft", "published", "archived"}},
	}
}
