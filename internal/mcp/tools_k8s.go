package mcp

// k8sSpecs exposes Kubernetes cluster inspection and workload management tools via the panel REST API.
// All Kubernetes tools require admin or superadmin permissions, enforced both here and on the REST endpoints.
func k8sSpecs() []apiSpec {
	clusterID := apiParam{Name: "cluster_id", Key: "id", In: inPath, Type: "string", Required: true, Desc: "Cluster ID ('local-k3s' or numeric saved cluster ID from k8s_status)."}
	nsPath := apiParam{Name: "namespace", Key: "ns", In: inPath, Type: "string", Required: true, Desc: "Kubernetes namespace."}
	nsQuery := apiParam{Name: "namespace", In: inQuery, Type: "string", Desc: "Filter by namespace (omit or 'all' for all namespaces)."}
	resName := apiParam{Name: "name", In: inPath, Type: "string", Required: true, Desc: "Kubernetes resource name."}

	return []apiSpec{
		{
			Name: "k8s_status", Title: "Kubernetes status and clusters", Method: "GET", Path: "/api/v1/k8s/status", AdminOnly: true,
			Desc: "Inspect local K3s/kubectl host status and list all connected Kubernetes clusters.",
		},
		{
			Name: "k8s_summary", Title: "Kubernetes cluster summary", Method: "GET", Path: "/api/v1/k8s/clusters/{id}/summary", AdminOnly: true,
			Desc:   "Return node, pod, deployment, service, and namespace counts for a Kubernetes cluster.",
			Params: []apiParam{clusterID},
		},
		{
			Name: "k8s_list_nodes", Title: "List Kubernetes nodes", Method: "GET", Path: "/api/v1/k8s/clusters/{id}/nodes", AdminOnly: true,
			Desc:   "List nodes in a Kubernetes cluster with status, roles, version, IP, CPU, and memory capacity.",
			Params: []apiParam{clusterID},
		},
		{
			Name: "k8s_list_pods", Title: "List Kubernetes pods", Method: "GET", Path: "/api/v1/k8s/clusters/{id}/pods", AdminOnly: true,
			Desc:   "List pods in a Kubernetes cluster, optionally filtered by namespace.",
			Params: []apiParam{clusterID, nsQuery},
		},
		{
			Name: "k8s_pod_logs", Title: "Fetch Kubernetes pod logs", Method: "GET", Path: "/api/v1/k8s/clusters/{id}/pods/{ns}/{name}/logs", AdminOnly: true,
			Desc: "Read recent log lines from a Kubernetes pod container.",
			Params: []apiParam{
				clusterID, nsPath, resName,
				{Name: "container", In: inQuery, Type: "string", Desc: "Container name inside the pod (optional for single-container pods)."},
				{Name: "tail", In: inQuery, Type: "integer", Desc: "Number of trailing log lines (1-2000, default 200).", Default: 200},
			},
		},
		{
			Name: "k8s_list_deployments", Title: "List Kubernetes deployments", Method: "GET", Path: "/api/v1/k8s/clusters/{id}/deployments", AdminOnly: true,
			Desc:   "List deployments in a Kubernetes cluster with ready/desired replica counts and images.",
			Params: []apiParam{clusterID, nsQuery},
		},
		{
			Name: "k8s_list_services", Title: "List Kubernetes services and ingresses", Method: "GET", Path: "/api/v1/k8s/clusters/{id}/services", AdminOnly: true,
			Desc:   "List Kubernetes services (ClusterIP/NodePort/LoadBalancer) and ingresses.",
			Params: []apiParam{clusterID, nsQuery},
		},
		{
			Name: "k8s_list_events", Title: "List Kubernetes cluster events", Method: "GET", Path: "/api/v1/k8s/clusters/{id}/events", AdminOnly: true,
			Desc:   "List recent Kubernetes events (Normal and Warning) to diagnose CrashLoopBackOff, ImagePullBackOff, or scheduling failures.",
			Params: []apiParam{clusterID, nsQuery},
		},
		{
			Name: "k8s_scale_deployment", Title: "Scale Kubernetes deployment", Method: "POST", Path: "/api/v1/k8s/clusters/{id}/deployments/{ns}/{name}/scale", AdminOnly: true, Hint: "write",
			Desc: "Scale a Kubernetes deployment to a target replica count (0-100).",
			Params: []apiParam{
				clusterID, nsPath, resName,
				{Name: "replicas", In: inBody, Type: "integer", Required: true, Desc: "Target replica count (0-100)."},
			},
		},
		{
			Name: "k8s_rollout_restart", Title: "Rollout restart Kubernetes deployment", Method: "POST", Path: "/api/v1/k8s/clusters/{id}/deployments/{ns}/{name}/restart", AdminOnly: true, Hint: "write",
			Desc:   "Trigger a rolling restart of a Kubernetes deployment.",
			Params: []apiParam{clusterID, nsPath, resName},
		},
		{
			Name: "k8s_apply_yaml", Title: "Apply Kubernetes YAML manifest", Method: "POST", Path: "/api/v1/k8s/clusters/{id}/apply", AdminOnly: true, Hint: "write",
			Desc: "Apply a Kubernetes YAML manifest to the cluster via kubectl apply.",
			Params: []apiParam{
				clusterID,
				{Name: "namespace", In: inBody, Type: "string", Desc: "Default namespace if omitted in manifest metadata."},
				{Name: "yaml", In: inBody, Type: "string", Required: true, Desc: "YAML manifest content."},
			},
		},
		{
			Name: "k8s_delete_pod", Title: "Delete Kubernetes pod", Method: "DELETE", Path: "/api/v1/k8s/clusters/{id}/pods/{ns}/{name}", AdminOnly: true, Hint: "destroy",
			Desc:   "Delete a Kubernetes pod (recreated automatically if managed by a Deployment). Ask before calling.",
			Params: []apiParam{clusterID, nsPath, resName},
		},
		{
			Name: "backup_overview", Title: "List backup targets, jobs, and runs", Method: "GET", Path: "/api/v1/backups/overview", AdminOnly: true,
			Desc: "Inspect configured local and S3/R2 backup storage targets, scheduled backup jobs, and recent backup runs.",
		},
		{
			Name: "backup_run_job", Title: "Run a backup job immediately", Method: "POST", Path: "/api/v1/backups/jobs/{id}/run", AdminOnly: true, Hint: "write",
			Desc:   "Trigger an immediate backup run for a scheduled database or project backup job.",
			Params: []apiParam{pathParam("id", "Backup job ID from backup_overview.")},
		},
		{
			Name: "uptime_list_monitors", Title: "List Uptime & SSL monitors", Method: "GET", Path: "/api/v1/uptime/monitors",
			Desc: "List all HTTP/HTTPS/TCP uptime monitors with 24h uptime percentage, latency, and SSL certificate expiry days.",
		},
		{
			Name: "uptime_check_monitor", Title: "Check an uptime monitor now", Method: "POST", Path: "/api/v1/uptime/monitors/{id}/check", Hint: "write",
			Desc:   "Trigger an immediate health and SSL expiry probe for a specific uptime monitor.",
			Params: []apiParam{pathParam("id", "Monitor ID from uptime_list_monitors.")},
		},
		{
			Name: "project_webhook_trigger", Title: "Trigger Git pull & auto-deploy for a project", Method: "POST", Path: "/api/v1/projects/{id}/webhook/trigger", Hint: "write",
			Desc:   "Run git pull and redeploy a Reneo project (either local rebuild/restart or K8s rolling build/deploy).",
			Params: []apiParam{pathParam("id", "Project ID.")},
		},
		{
			Name: "hostops_overview", Title: "List systemd services and host cron jobs", Method: "GET", Path: "/api/v1/hostops/overview", SuperOnly: true,
			Desc: "Inspect Linux systemd service states and host crontab entries.",
		},
		{
			Name: "k8s_helm_list", Title: "List Helm releases in a Kubernetes cluster", Method: "GET", Path: "/api/v1/k8s/clusters/{id}/helm", AdminOnly: true,
			Desc:   "List installed Helm chart releases across all namespaces in a Kubernetes cluster.",
			Params: []apiParam{clusterID},
		},
		{
			Name: "security_hardening_overview", Title: "Inspect SSH keys, Fail2Ban jails, and OS updates", Method: "GET", Path: "/api/v1/security/hardening", SuperOnly: true,
			Desc: "Read authorized SSH keys, Fail2Ban banned IPs, recent failed SSH logins, and available OS package updates.",
		},
	}
}
