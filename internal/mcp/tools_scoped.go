package mcp

// scopedSpecs are the host-facing tools for every account except the superadmin. They call the
// REST API with the caller's own token, so ownership, home-directory roots, quotas and the
// account's OS user apply exactly as in the panel UI. The superadmin keeps the direct
// implementations that act on the machine itself.
func scopedSpecs() []apiSpec {
	container := pathParam("id", "Container ID or name (from docker_list_containers).")
	path := func(desc string) apiParam { return strParam("path", desc, true) }

	return []apiSpec{
		{Name: "system_info", Title: "My resources", Method: "GET", Path: "/api/v1/system/summary",
			Desc: "CPU, memory and storage of this account against its quota, plus project counts. The host machine itself is not shown."},

		{Name: "docker_list_containers", Title: "List containers", Method: "GET", Path: "/api/v1/containers",
			Desc: "List the containers this account owns (and those of the accounts below it for an admin): state, image, ports, networks."},
		{Name: "docker_container_logs", Title: "Container logs", Method: "GET", Path: "/api/v1/containers/{id}/logs",
			Desc:   "Read the most recent log lines of one of your containers.",
			Params: []apiParam{container, queryParam("tail", "integer", "Number of lines from the end (default 200).")}},
		{Name: "docker_start_container", Title: "Start container", Method: "POST", Path: "/api/v1/containers/{id}/start", Hint: "write",
			Desc: "Start a stopped container you own.", Params: []apiParam{container}},
		{Name: "docker_stop_container", Title: "Stop container", Method: "POST", Path: "/api/v1/containers/{id}/stop", Hint: "write",
			Desc: "Stop a running container you own.", Params: []apiParam{container}},
		{Name: "docker_restart_container", Title: "Restart container", Method: "POST", Path: "/api/v1/containers/{id}/restart", Hint: "write",
			Desc: "Restart a container you own.", Params: []apiParam{container}},
		{Name: "docker_delete_container", Title: "Delete container", Method: "DELETE", Path: "/api/v1/containers/{id}",
			Desc: "Remove a container you own.", Params: []apiParam{container}},

		{Name: "file_list", Title: "List directory", Method: "GET", Path: "/api/v1/files",
			Desc:   "List a directory inside your home or project folders. Paths outside your area are refused.",
			Params: []apiParam{queryParam("path", "string", "Absolute directory path. Omit for your home directory.")}},
		{Name: "file_read", Title: "Read file", Method: "GET", Path: "/api/v1/files/read",
			Desc:   "Read a text file inside your home or project folders.",
			Params: []apiParam{{Name: "path", In: inQuery, Type: "string", Required: true, Desc: "Absolute file path."}}},
		{Name: "file_write", Title: "Write file", Method: "POST", Path: "/api/v1/files/write", Hint: "write",
			Desc: "Create or overwrite a text file inside your home or project folders.",
			Params: []apiParam{path("Absolute file path."),
				{Name: "content", In: inBody, Type: "string", Required: true, Desc: "Full file content."}}},
		{Name: "file_delete", Title: "Delete file", Method: "POST", Path: "/api/v1/files/delete",
			Desc: "Delete a file or directory inside your area.", Params: []apiParam{path("Absolute path.")}},
		{Name: "file_mkdir", Title: "Create directory", Method: "POST", Path: "/api/v1/files/mkdir", Hint: "write",
			Desc: "Create a directory (with parents) inside your area.", Params: []apiParam{path("Absolute directory path.")}},

		{Name: "terminal_exec", Title: "Run a command", Method: "POST", Path: "/api/v1/terminal/exec", Hint: "write",
			Desc: "Run one shell command as your own OS account, inside the CPU and memory limits of your quota (no sudo). Output is capped at 64 KB and the timeout at 60 seconds.",
			Params: []apiParam{
				strParam("command", "Shell command, for example `ls -la ~` or `npm run build`.", true),
				{Name: "timeout_seconds", Key: "timeoutSeconds", In: inBody, Type: "integer", Desc: "Timeout in seconds (1-60, default 30)."},
			}},
	}
}
