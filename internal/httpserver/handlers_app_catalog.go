package httpserver

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
)

const (
	appCatalogProxyPrefix = "/api/v1/app-catalog/proxy/"
	appCatalogPortMin     = 18000
	appCatalogPortMax     = 18999
)

type catalogVolumeSpec struct {
	HostSubdir    string `json:"hostSubdir"`
	ContainerPath string `json:"containerPath"`
	Label         string `json:"label"`
}

type catalogEnvSpec struct {
	Key          string `json:"key"`
	DefaultValue string `json:"defaultValue"`
	LabelID      string `json:"labelId"`
	LabelEN      string `json:"labelEn"`
	Required     bool   `json:"required"`
	Secret       bool   `json:"secret"`
	Placeholder  string `json:"placeholder"`
}

// CatalogApp describes a curated one-click self-hosted application in Reneo's App Catalog.
type CatalogApp struct {
	ID              string              `json:"id"`
	Name            string              `json:"name"`
	TaglineID       string              `json:"taglineId"`
	TaglineEN       string              `json:"taglineEn"`
	DescriptionID   string              `json:"descriptionId"`
	DescriptionEN   string              `json:"descriptionEn"`
	Category        string              `json:"category"`
	IconKey         string              `json:"iconKey"`
	IconColor       string              `json:"iconColor"`
	Image           string              `json:"image"`
	ContainerPort   int                 `json:"containerPort"`
	DefaultHostPort int                 `json:"defaultHostPort"`
	OpenPath        string              `json:"openPath"`
	KeepPrefix      bool                `json:"keepPrefix"`
	SuperadminOnly  bool                `json:"superadminOnly"`
	NotesID         string              `json:"notesId,omitempty"`
	NotesEN         string              `json:"notesEn,omitempty"`
	Volumes         []catalogVolumeSpec `json:"volumes"`
	Env             []catalogEnvSpec    `json:"env"`
	ProxyEnv        map[string]string   `json:"-"`
}

var builtinCatalogApps = []CatalogApp{
	{
		ID:              "uptime-kuma",
		Name:            "Uptime Kuma",
		TaglineID:       "Monitor uptime HTTP, TCP, DNS, dan status layanan real-time",
		TaglineEN:       "Self-hosted uptime monitoring for HTTP, TCP, DNS, and services",
		DescriptionID:   "Pantau ketersediaan website, API, port TCP, dan sertifikat SSL dengan halaman status publik dan notifikasi.",
		DescriptionEN:   "Monitor websites, APIs, TCP ports, and SSL certificates with public status pages and alerts.",
		Category:        "monitoring",
		IconKey:         "activity",
		IconColor:       "emerald",
		Image:           "louislam/uptime-kuma:1",
		ContainerPort:   3001,
		DefaultHostPort: 18001,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/app/data", Label: "Data & database Uptime Kuma"},
		},
		Env: []catalogEnvSpec{
			{Key: "TZ", DefaultValue: "Asia/Jakarta", LabelID: "Zona Waktu", LabelEN: "Timezone", Placeholder: "Asia/Jakarta"},
		},
	},
	{
		ID:              "filebrowser",
		Name:            "FileBrowser",
		TaglineID:       "Manajer berkas web ringan dengan preview & tautan berbagi",
		TaglineEN:       "Lightweight web file manager with media preview and share links",
		DescriptionID:   "Jelajahi, unggah, sunting, dan bagikan berkas dari browser dalam antarmuka web modern yang cepat.",
		DescriptionEN:   "Browse, upload, edit, and share files directly from a clean, fast web interface.",
		Category:        "files",
		IconKey:         "folder",
		IconColor:       "amber",
		Image:           "filebrowser/filebrowser:latest",
		ContainerPort:   80,
		DefaultHostPort: 18002,
		OpenPath:        "/",
		KeepPrefix:      true,
		NotesID:         "Login awal bawaan FileBrowser: user admin / password admin (segera ganti setelah masuk).",
		NotesEN:         "Default initial login is admin / admin — change the password immediately after sign-in.",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "srv", ContainerPath: "/srv", Label: "Direktori berkas"},
			{HostSubdir: "database", ContainerPath: "/database", Label: "Database konfigurasi"},
		},
		ProxyEnv: map[string]string{
			"FB_BASEURL": "{{PROXY_PREFIX}}",
		},
	},
	{
		ID:              "it-tools",
		Name:            "IT-Tools",
		TaglineID:       "Kumpulan utilitas developer offline (hash, JSON, regex, JWT, UUID)",
		TaglineEN:       "Handy developer utilities: encoders, formatters, JWT, regex, generators",
		DescriptionID:   "Puluhan alat bantu harian untuk developer dan sysadmin tanpa mengirim data ke pihak ketiga.",
		DescriptionEN:   "Dozens of offline developer and sysadmin tools running directly inside your own server.",
		Category:        "dev",
		IconKey:         "wrench",
		IconColor:       "teal",
		Image:           "corentinth/it-tools:latest",
		ContainerPort:   80,
		DefaultHostPort: 18003,
		OpenPath:        "/",
	},
	{
		ID:              "n8n",
		Name:            "n8n",
		TaglineID:       "Otomatisasi workflow visual, webhook, cron, dan integrasi AI/API",
		TaglineEN:       "Visual workflow automation with webhooks, cron schedules, and API nodes",
		DescriptionID:   "Bangun alur otomasi antar layanan, webhook, database, dan Telegram/WhatsApp secara visual.",
		DescriptionEN:   "Build visual automation workflows connecting APIs, webhooks, databases, and messaging.",
		Category:        "automation",
		IconKey:         "workflow",
		IconColor:       "orange",
		Image:           "docker.n8n.io/n8nio/n8n:latest",
		ContainerPort:   5678,
		DefaultHostPort: 18004,
		OpenPath:        "/",
		KeepPrefix:      true,
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/home/node/.n8n", Label: "Workflow & kredensial n8n"},
		},
		Env: []catalogEnvSpec{
			{Key: "GENERIC_TIMEZONE", DefaultValue: "Asia/Jakarta", LabelID: "Zona Waktu", LabelEN: "Timezone", Placeholder: "Asia/Jakarta"},
			{Key: "N8N_SECURE_COOKIE", DefaultValue: "false", LabelID: "Cookie HTTPS Ketat (false untuk akses LAN/HTTP)", LabelEN: "Strict HTTPS Cookie (false for HTTP/LAN proxy)"},
		},
		ProxyEnv: map[string]string{
			"N8N_PATH": "{{PROXY_PREFIX}}/",
		},
	},
	{
		ID:              "vaultwarden",
		Name:            "Vaultwarden",
		TaglineID:       "Manajer kata sandi self-hosted yang kompatibel dengan klien Bitwarden",
		TaglineEN:       "Self-hosted password manager compatible with official Bitwarden clients",
		DescriptionID:   "Simpan kata sandi, 2FA TOTP, dan catatan aman di server pribadi Anda sendiri.",
		DescriptionEN:   "Store passwords, 2FA codes, and secure notes privately on your own server.",
		Category:        "security",
		IconKey:         "shield",
		IconColor:       "indigo",
		Image:           "vaultwarden/server:latest",
		ContainerPort:   80,
		DefaultHostPort: 18005,
		OpenPath:        "/",
		NotesID:         "Web vault memerlukan HTTPS (atau localhost) untuk WebCrypto API pada browser.",
		NotesEN:         "Bitwarden Web Vault requires HTTPS (or localhost) in the browser for WebCrypto.",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/data", Label: "Vault & SQLite data"},
		},
		Env: []catalogEnvSpec{
			{Key: "SIGNUPS_ALLOWED", DefaultValue: "true", LabelID: "Izinkan Pendaftaran Akun", LabelEN: "Allow Account Signups"},
		},
	},
	{
		ID:              "grafana",
		Name:            "Grafana",
		TaglineID:       "Dashboard observabilitas, metrik Prometheus, dan analitik log",
		TaglineEN:       "Observability dashboards, Prometheus metrics, and time-series visualization",
		DescriptionID:   "Buat grafik performa server, database, dan aplikasi dengan dukungan berbagai sumber data.",
		DescriptionEN:   "Visualize server, database, and application metrics across multiple data sources.",
		Category:        "monitoring",
		IconKey:         "bar-chart",
		IconColor:       "orange",
		Image:           "grafana/grafana-oss:latest",
		ContainerPort:   3000,
		DefaultHostPort: 18006,
		OpenPath:        "/",
		KeepPrefix:      true,
		NotesID:         "Login bawaan Grafana: admin / admin.",
		NotesEN:         "Default Grafana login: admin / admin.",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/var/lib/grafana", Label: "Dashboard & plugin Grafana"},
		},
		Env: []catalogEnvSpec{
			{Key: "GF_SECURITY_ADMIN_USER", DefaultValue: "admin", LabelID: "Username Admin", LabelEN: "Admin Username"},
			{Key: "GF_SECURITY_ADMIN_PASSWORD", DefaultValue: "admin", LabelID: "Password Admin", LabelEN: "Admin Password", Secret: true},
		},
		ProxyEnv: map[string]string{
			"GF_SERVER_SERVE_FROM_SUB_PATH": "true",
			"GF_SECURITY_ALLOW_EMBEDDING":   "true",
			"GF_SERVER_ROOT_URL":            "%(protocol)s://%(domain)s{{PROXY_PREFIX}}/",
		},
	},
	{
		ID:              "stirling-pdf",
		Name:            "Stirling-PDF",
		TaglineID:       "Editor & utilitas PDF lengkap (gabung, pisah, kompres, konversi)",
		TaglineEN:       "Full local PDF toolkit: merge, split, compress, sign, and convert",
		DescriptionID:   "Olah dokumen PDF langsung di server pribadi Anda tanpa mengunggah dokumen sensitif ke layanan luar.",
		DescriptionEN:   "Process PDF files privately on your own server without uploading documents externally.",
		Category:        "files",
		IconKey:         "file-text",
		IconColor:       "rose",
		Image:           "stirlingtools/stirling-pdf:latest",
		ContainerPort:   8080,
		DefaultHostPort: 18007,
		OpenPath:        "/",
		KeepPrefix:      true,
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "configs", ContainerPath: "/configs", Label: "Konfigurasi Stirling-PDF"},
		},
		Env: []catalogEnvSpec{
			{Key: "DOCKER_ENABLE_SECURITY", DefaultValue: "false", LabelID: "Aktifkan Login Tambahan", LabelEN: "Enable Built-in Login"},
		},
		ProxyEnv: map[string]string{
			"SERVER_SERVLET_CONTEXT_PATH": "{{PROXY_PREFIX}}",
		},
	},
	{
		ID:              "excalidraw",
		Name:            "Excalidraw",
		TaglineID:       "Papan tulis diagram arsitektur dan sketsa cepat bergaya vektor",
		TaglineEN:       "Virtual whiteboard for architecture diagrams and technical sketches",
		DescriptionID:   "Gambar diagram sistem, alur kerja, dan wireframe langsung di desktop panel Anda.",
		DescriptionEN:   "Draw system diagrams, architecture flows, and wireframes directly in a desktop window.",
		Category:        "dev",
		IconKey:         "pen-tool",
		IconColor:       "violet",
		Image:           "excalidraw/excalidraw:latest",
		ContainerPort:   80,
		DefaultHostPort: 18008,
		OpenPath:        "/",
	},
	{
		ID:              "gitea",
		Name:            "Gitea",
		TaglineID:       "Server Git ringan dengan pull request, issue tracker, dan package registry",
		TaglineEN:       "Lightweight self-hosted Git service with issues, PRs, and registries",
		DescriptionID:   "Hosting repositori kode sumber privat di server Anda dengan konsumsi RAM yang sangat ringan.",
		DescriptionEN:   "Host private Git repositories on your own server with low memory footprint.",
		Category:        "dev",
		IconKey:         "git-branch",
		IconColor:       "emerald",
		Image:           "gitea/gitea:latest",
		ContainerPort:   3000,
		DefaultHostPort: 18009,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/data", Label: "Repositori & konfigurasi Gitea"},
		},
		Env: []catalogEnvSpec{
			{Key: "USER_UID", DefaultValue: "1000", LabelID: "UID Proses", LabelEN: "Process UID"},
			{Key: "USER_GID", DefaultValue: "1000", LabelID: "GID Proses", LabelEN: "Process GID"},
		},
	},
	{
		ID:              "memos",
		Name:            "Memos",
		TaglineID:       "Catatan cepat berbasis Markdown & knowledge base pribadi",
		TaglineEN:       "Privacy-first lightweight Markdown note-taking & knowledge hub",
		DescriptionID:   "Simpan catatan teknis, snippet perintah, dan dokumentasi tim harian di server Anda.",
		DescriptionEN:   "Capture technical notes, snippets, and daily knowledge cleanly on your own server.",
		Category:        "files",
		IconKey:         "notebook",
		IconColor:       "sky",
		Image:           "neosmemo/memos:stable",
		ContainerPort:   5230,
		DefaultHostPort: 18010,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/var/opt/memos", Label: "Database catatan Memos"},
		},
	},
}

func findCatalogApp(id string) (CatalogApp, bool) {
	trimmed := strings.TrimSpace(id)
	for _, item := range builtinCatalogApps {
		if item.ID == trimmed {
			return item, true
		}
	}
	return CatalogApp{}, false
}

type installedAppView struct {
	database.InstalledApp
	KeepPrefix      bool   `json:"keepPrefix"`
	ProxyPath       string `json:"proxyPath"`
	ContainerID     string `json:"containerId,omitempty"`
	ContainerStatus string `json:"containerStatus,omitempty"`
	ContainerState  string `json:"containerState,omitempty"`
}

type appConfigMeta struct {
	KeepPrefix bool   `json:"keepPrefix,omitempty"`
	NotesID    string `json:"notesId,omitempty"`
	NotesEN    string `json:"notesEn,omitempty"`
}

func parseAppConfigMeta(raw string) appConfigMeta {
	var meta appConfigMeta
	if strings.TrimSpace(raw) != "" {
		_ = json.Unmarshal([]byte(raw), &meta)
	}
	return meta
}

func sanitizeAppSlug(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevDash = false
		} else if !prevDash && b.Len() > 0 {
			b.WriteByte('-')
			prevDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func normalizeOpenPath(raw string) string {
	p := strings.TrimSpace(raw)
	if p == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return p
}

func (s *Server) uniqueAppSlug(userID int64, base string) string {
	slug := sanitizeAppSlug(base)
	if slug == "" {
		slug = "app"
	}
	if len(slug) > 60 {
		slug = strings.Trim(slug[:60], "-")
	}
	candidate := slug
	for i := 2; i < 100; i++ {
		existing, _ := s.database.GetInstalledAppBySlug(userID, candidate)
		if existing == nil {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", slug, i)
	}
	return fmt.Sprintf("%s-%d", slug, time.Now().Unix()%10000)
}

func matchContainerForApp(app database.InstalledApp, containers []docker.Container, scope ownerScope) *docker.Container {
	if app.ContainerName == "" {
		return nil
	}
	want := strings.TrimPrefix(app.ContainerName, "/")
	for i := range containers {
		c := &containers[i]
		if !scope.all && !scope.has(c.OwnerUserID) {
			continue
		}
		for _, name := range c.Names {
			if strings.TrimPrefix(name, "/") == want {
				return c
			}
		}
	}
	return nil
}

func (s *Server) buildInstalledAppView(app database.InstalledApp, containers []docker.Container, scope ownerScope) installedAppView {
	meta := parseAppConfigMeta(app.ConfigJSON)
	proxyPath := fmt.Sprintf("%s%d%s", appCatalogProxyPrefix, app.ID, normalizeOpenPath(app.OpenPath))
	if !app.UseProxy && app.TargetURL != "" {
		proxyPath = app.TargetURL
	}
	view := installedAppView{
		InstalledApp: app,
		KeepPrefix:   meta.KeepPrefix,
		ProxyPath:    proxyPath,
	}
	if app.Kind == "docker" || app.Kind == "existing-container" {
		if matched := matchContainerForApp(app, containers, scope); matched != nil {
			view.ContainerID = matched.ID
			view.ContainerStatus = matched.Status
			view.ContainerState = matched.State
		} else {
			view.ContainerState = "missing"
		}
	}
	return view
}

func (s *Server) handleAppCatalogList(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	if s.isDemoUser(actor) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "demo account cannot access app catalog"})
		return
	}

	catalog := make([]CatalogApp, 0, len(builtinCatalogApps))
	isSuper := auth.IsSuperAdmin(actor.Role)
	for _, item := range builtinCatalogApps {
		if item.SuperadminOnly && !isSuper {
			continue
		}
		catalog = append(catalog, item)
	}

	installed, err := s.database.ListInstalledApps(actor.ID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	containers, _ := docker.ListContainers()
	scope := s.ownerScopeFor(actor)
	views := make([]installedAppView, 0, len(installed))
	for _, item := range installed {
		views = append(views, s.buildInstalledAppView(item, containers, scope))
	}

	s.writeJSON(w, http.StatusOK, jsonResponse{
		"catalog":   catalog,
		"installed": views,
	})
}

type installCatalogAppRequest struct {
	Mode          string            `json:"mode"` // "catalog" | "existing-container" | "custom-url"
	CatalogID     string            `json:"catalogId"`
	ContainerID   string            `json:"containerId"`
	Name          string            `json:"name"`
	Tagline       string            `json:"tagline"`
	Category      string            `json:"category"`
	IconKey       string            `json:"iconKey"`
	IconColor     string            `json:"iconColor"`
	HostPort      int               `json:"hostPort"`
	OpenPath      string            `json:"openPath"`
	TargetURL     string            `json:"targetUrl"`
	UseProxy      *bool             `json:"useProxy"`
	Env           map[string]string `json:"env"`
}

func validateTargetURLForRole(rawURL, role string, willProxy bool) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed == nil {
		return "", errors.New("URL target tidak valid")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", errors.New("URL harus menggunakan skema http:// atau https://")
	}
	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return "", errors.New("hostname URL wajib diisi")
	}
	if willProxy && !auth.IsSuperAdmin(role) {
		if err := rejectInternalTargetHost(host); err != nil {
			return "", err
		}
	}
	return parsed.String(), nil
}

func rejectInternalTargetHost(host string) error {
	lower := strings.ToLower(strings.TrimSpace(host))
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") || strings.HasSuffix(lower, ".local") || lower == "metadata.google.internal" {
		return errors.New("proxy custom URL untuk akun non-superadmin tidak boleh mengarah ke localhost atau jaringan lokal")
	}
	if ip := net.ParseIP(lower); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() {
			return errors.New("proxy custom URL untuk akun non-superadmin tidak boleh mengarah ke alamat IP lokal/internal")
		}
		return nil
	}
	addrs, err := net.LookupIP(lower)
	if err == nil {
		for _, ip := range addrs {
			if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
				return errors.New("proxy custom URL untuk akun non-superadmin tidak boleh mengarah ke alamat IP lokal/internal")
			}
		}
	}
	return nil
}

func (s *Server) handleAppCatalogInstall(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	actor := s.currentUserRecord(r)
	if actor == nil {
		s.writeJSON(w, http.StatusUnauthorized, jsonResponse{"error": "unauthorized"})
		return
	}
	if s.isDemoUser(actor) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "demo account cannot install applications"})
		return
	}

	var req installCatalogAppRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON payload"})
		return
	}

	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "catalog"
	}

	switch mode {
	case "catalog":
		s.installFromCatalog(w, r, actor, req)
	case "existing-container":
		s.installFromExistingContainer(w, r, actor, req)
	case "custom-url":
		s.installFromCustomURL(w, r, actor, req)
	default:
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid install mode"})
	}
}

func (s *Server) installFromCatalog(w http.ResponseWriter, r *http.Request, actor *database.User, req installCatalogAppRequest) {
	if !auth.HasCapability(actor.Role, auth.CapabilityDockerDeploy) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "tidak memiliki izin deploy container Docker"})
		return
	}
	spec, ok := findCatalogApp(req.CatalogID)
	if !ok {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "aplikasi tidak ditemukan di katalog"})
		return
	}
	if spec.SuperadminOnly && !auth.IsSuperAdmin(actor.Role) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "aplikasi ini memerlukan hak superadmin"})
		return
	}

	owner, err := s.resolveDockerOwnerContext(actor, actor.ID)
	if err != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = spec.Name
	}
	slug := s.uniqueAppSlug(actor.ID, name)
	containerProject := fmt.Sprintf("reneo-app-%d-%s", actor.ID, slug)

	hostPort := req.HostPort
	if hostPort > 0 {
		if err := s.ensurePortsFree([]docker.HostPort{{Port: hostPort, Proto: "tcp"}}, portIgnore{composeName: containerProject}); err != nil {
			s.writePortError(w, actor, err)
			return
		}
	} else {
		preferred := spec.DefaultHostPort
		if preferred >= appCatalogPortMin && preferred <= appCatalogPortMax && s.ensurePortsFree([]docker.HostPort{{Port: preferred, Proto: "tcp"}}, portIgnore{}) == nil {
			hostPort = preferred
		} else {
			free, portErr := s.freePort(appCatalogPortMin, appCatalogPortMax, nil)
			if portErr != nil {
				s.writeError(w, http.StatusConflict, portErr)
				return
			}
			hostPort = free
		}
	}

	metaBytes, _ := json.Marshal(appConfigMeta{
		KeepPrefix: spec.KeepPrefix,
		NotesID:    spec.NotesID,
		NotesEN:    spec.NotesEN,
	})

	tagline := strings.TrimSpace(req.Tagline)
	if tagline == "" {
		tagline = spec.TaglineID
	}
	iconKey := strings.TrimSpace(req.IconKey)
	if iconKey == "" {
		iconKey = spec.IconKey
	}
	iconColor := strings.TrimSpace(req.IconColor)
	if iconColor == "" {
		iconColor = spec.IconColor
	}
	openPath := normalizeOpenPath(spec.OpenPath)
	if strings.TrimSpace(req.OpenPath) != "" {
		openPath = normalizeOpenPath(req.OpenPath)
	}
	useProxy := true
	if req.UseProxy != nil {
		useProxy = *req.UseProxy
	}
	targetURL := ""
	if !useProxy {
		targetURL = fmt.Sprintf("http://127.0.0.1:%d%s", hostPort, openPath)
	}

	created, err := s.database.CreateInstalledApp(&database.InstalledApp{
		UserID:        actor.ID,
		Slug:          slug,
		CatalogID:     spec.ID,
		Name:          name,
		Tagline:       tagline,
		Category:      spec.Category,
		IconKey:       iconKey,
		IconColor:     iconColor,
		Kind:          "docker",
		Image:         spec.Image,
		ContainerName: containerProject,
		HostPort:      hostPort,
		ContainerPort: spec.ContainerPort,
		OpenPath:      openPath,
		TargetURL:     targetURL,
		UseProxy:      useProxy,
		ConfigJSON:    string(metaBytes),
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	proxyPrefix := fmt.Sprintf("%s%d", appCatalogProxyPrefix, created.ID)
	envMap := make(map[string]string)
	for _, e := range spec.Env {
		if strings.TrimSpace(e.DefaultValue) != "" {
			envMap[e.Key] = e.DefaultValue
		}
	}
	if useProxy {
		for k, v := range spec.ProxyEnv {
			envMap[k] = strings.ReplaceAll(v, "{{PROXY_PREFIX}}", proxyPrefix)
		}
	}
	for k, v := range req.Env {
		if strings.TrimSpace(k) != "" {
			envMap[strings.TrimSpace(k)] = v
		}
	}

	envVars := make([]docker.EnvVar, 0, len(envMap))
	for k, v := range envMap {
		envVars = append(envVars, docker.EnvVar{Key: k, Value: v})
	}

	volumes := make([]docker.VolumeBinding, 0, len(spec.Volumes))
	for _, vol := range spec.Volumes {
		volumes = append(volumes, docker.VolumeBinding{
			HostPath:      fmt.Sprintf("docker/%s/%s", containerProject, vol.HostSubdir),
			ContainerPath: vol.ContainerPath,
		})
	}

	_, deployErr := docker.DeployFromImage(owner, docker.DeployImageRequest{
		Name:  containerProject,
		Image: spec.Image,
		Ports: []docker.PortBinding{{
			HostPort:      strconv.Itoa(hostPort),
			ContainerPort: strconv.Itoa(spec.ContainerPort),
			Protocol:      "tcp",
		}},
		Env:     envVars,
		Volumes: volumes,
	})
	if deployErr != nil {
		_ = s.database.DeleteInstalledApp(created.ID)
		s.writeError(w, http.StatusUnprocessableEntity, deployErr)
		return
	}

	s.auditSensitiveAction(r, actor, "appcatalog.install", "ok", map[string]any{"catalogId": spec.ID, "name": name, "port": hostPort})
	containers, _ := docker.ListContainers()
	view := s.buildInstalledAppView(*created, containers, s.ownerScopeFor(actor))
	s.writeJSON(w, http.StatusCreated, jsonResponse{"ok": true, "app": view})
}

func (s *Server) installFromExistingContainer(w http.ResponseWriter, r *http.Request, actor *database.User, req installCatalogAppRequest) {
	cid := strings.TrimSpace(req.ContainerID)
	if cid == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "container wajib dipilih"})
		return
	}
	if _, err := s.ensureContainerAccess(r, cid); err != nil {
		s.writeError(w, http.StatusForbidden, err)
		return
	}
	containers, err := docker.ListContainers()
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	var matched *docker.Container
	for i := range containers {
		if containers[i].ID == cid || strings.HasPrefix(containers[i].ID, cid) {
			matched = &containers[i]
			break
		}
	}
	if matched == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "container tidak ditemukan"})
		return
	}

	var selectedHostPort, selectedContainerPort int
	for _, p := range matched.Ports {
		if p.PublicPort > 0 && (req.HostPort == 0 || p.PublicPort == req.HostPort) {
			selectedHostPort = p.PublicPort
			selectedContainerPort = p.PrivatePort
			break
		}
	}
	if selectedHostPort <= 0 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "container yang dipilih belum mem-publish port host yang bisa diakses"})
		return
	}

	containerName := ""
	if len(matched.Names) > 0 {
		containerName = strings.TrimPrefix(matched.Names[0], "/")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = containerName
	}
	if name == "" {
		name = matched.Image
	}

	iconKey := strings.TrimSpace(req.IconKey)
	if iconKey == "" {
		iconKey = "box"
	}
	iconColor := strings.TrimSpace(req.IconColor)
	if iconColor == "" {
		iconColor = "sky"
	}

	created, err := s.database.CreateInstalledApp(&database.InstalledApp{
		UserID:        actor.ID,
		Slug:          s.uniqueAppSlug(actor.ID, name),
		CatalogID:     "",
		Name:          name,
		Tagline:       strings.TrimSpace(req.Tagline),
		Category:      "custom",
		IconKey:       iconKey,
		IconColor:     iconColor,
		Kind:          "existing-container",
		Image:         matched.Image,
		ContainerName: containerName,
		HostPort:      selectedHostPort,
		ContainerPort: selectedContainerPort,
		OpenPath:      normalizeOpenPath(req.OpenPath),
		TargetURL:     "",
		UseProxy:      true,
		ConfigJSON:    "{}",
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	s.auditSensitiveAction(r, actor, "appcatalog.attach_container", "ok", map[string]any{"container": containerName, "port": selectedHostPort})
	view := s.buildInstalledAppView(*created, containers, s.ownerScopeFor(actor))
	s.writeJSON(w, http.StatusCreated, jsonResponse{"ok": true, "app": view})
}

func (s *Server) installFromCustomURL(w http.ResponseWriter, r *http.Request, actor *database.User, req installCatalogAppRequest) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "nama aplikasi wajib diisi"})
		return
	}
	useProxy := true
	if req.UseProxy != nil {
		useProxy = *req.UseProxy
	}
	validatedURL, err := validateTargetURLForRole(req.TargetURL, actor.Role, useProxy)
	if err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
		return
	}

	iconKey := strings.TrimSpace(req.IconKey)
	if iconKey == "" {
		iconKey = "globe"
	}
	iconColor := strings.TrimSpace(req.IconColor)
	if iconColor == "" {
		iconColor = "blue"
	}

	created, err := s.database.CreateInstalledApp(&database.InstalledApp{
		UserID:    actor.ID,
		Slug:      s.uniqueAppSlug(actor.ID, name),
		CatalogID: "",
		Name:      name,
		Tagline:   strings.TrimSpace(req.Tagline),
		Category:  "custom",
		IconKey:   iconKey,
		IconColor: iconColor,
		Kind:      "custom-url",
		OpenPath:  "/",
		TargetURL: validatedURL,
		UseProxy:  useProxy,
	})
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}

	s.auditSensitiveAction(r, actor, "appcatalog.add_custom_url", "ok", map[string]any{"name": name})
	view := s.buildInstalledAppView(*created, nil, s.ownerScopeFor(actor))
	s.writeJSON(w, http.StatusCreated, jsonResponse{"ok": true, "app": view})
}

func (s *Server) loadOwnedInstalledApp(r *http.Request) (*database.User, *database.InstalledApp, int, error) {
	actor := s.currentUserRecord(r)
	if actor == nil {
		return nil, nil, http.StatusUnauthorized, errors.New("unauthorized")
	}
	if s.isDemoUser(actor) {
		return nil, nil, http.StatusForbidden, errors.New("demo account cannot access installed apps")
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return nil, nil, http.StatusBadRequest, errors.New("invalid app id")
	}
	app, err := s.database.GetInstalledApp(id)
	if err != nil {
		return nil, nil, http.StatusInternalServerError, err
	}
	if app == nil {
		return nil, nil, http.StatusNotFound, errors.New("aplikasi tidak ditemukan")
	}
	if app.UserID != actor.ID && !s.ownerScopeFor(actor).has(app.UserID) {
		return nil, nil, http.StatusForbidden, errors.New("forbidden: aplikasi bukan milik akun ini")
	}
	return actor, app, http.StatusOK, nil
}

func (s *Server) handleAppCatalogUpdate(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	actor, app, code, err := s.loadOwnedInstalledApp(r)
	if err != nil {
		s.writeError(w, code, err)
		return
	}
	var body struct {
		Name      *string `json:"name"`
		Tagline   *string `json:"tagline"`
		IconKey   *string `json:"iconKey"`
		IconColor *string `json:"iconColor"`
		OpenPath  *string `json:"openPath"`
		TargetURL *string `json:"targetUrl"`
		UseProxy  *bool   `json:"useProxy"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON payload"})
		return
	}

	patch := map[string]any{}
	if body.Name != nil {
		trimmed := strings.TrimSpace(*body.Name)
		if trimmed == "" {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "nama aplikasi tidak boleh kosong"})
			return
		}
		patch["name"] = trimmed
	}
	if body.Tagline != nil {
		patch["tagline"] = strings.TrimSpace(*body.Tagline)
	}
	if body.IconKey != nil && strings.TrimSpace(*body.IconKey) != "" {
		patch["iconKey"] = strings.TrimSpace(*body.IconKey)
	}
	if body.IconColor != nil && strings.TrimSpace(*body.IconColor) != "" {
		patch["iconColor"] = strings.TrimSpace(*body.IconColor)
	}
	if body.OpenPath != nil {
		patch["openPath"] = normalizeOpenPath(*body.OpenPath)
	}
	nextUseProxy := app.UseProxy
	if body.UseProxy != nil {
		nextUseProxy = *body.UseProxy
		patch["useProxy"] = nextUseProxy
	}
	if app.Kind == "custom-url" {
		rawURL := app.TargetURL
		if body.TargetURL != nil {
			rawURL = *body.TargetURL
		}
		if body.TargetURL != nil || body.UseProxy != nil {
			validURL, err := validateTargetURLForRole(rawURL, actor.Role, nextUseProxy)
			if err != nil {
				s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": err.Error()})
				return
			}
			patch["targetUrl"] = validURL
		}
	}

	updated, err := s.database.UpdateInstalledApp(app.ID, patch)
	if err != nil || updated == nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	containers, _ := docker.ListContainers()
	view := s.buildInstalledAppView(*updated, containers, s.ownerScopeFor(actor))
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "app": view})
}

func (s *Server) handleAppCatalogAction(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	actor, app, code, err := s.loadOwnedInstalledApp(r)
	if err != nil {
		s.writeError(w, code, err)
		return
	}
	if app.Kind != "docker" && app.Kind != "existing-container" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "aksi container hanya tersedia untuk aplikasi Docker"})
		return
	}
	var body struct {
		Action string `json:"action"` // start | stop | restart
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON payload"})
		return
	}
	containers, err := docker.ListContainers()
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}
	matched := matchContainerForApp(*app, containers, s.ownerScopeFor(actor))
	if matched == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "container aplikasi tidak ditemukan"})
		return
	}

	switch strings.ToLower(strings.TrimSpace(body.Action)) {
	case "start":
		err = docker.StartContainer(matched.ID)
	case "stop":
		err = docker.StopContainer(matched.ID)
	case "restart":
		err = docker.RestartContainer(matched.ID)
	default:
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "aksi tidak dikenal (gunakan start, stop, atau restart)"})
		return
	}
	if err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	s.auditSensitiveAction(r, actor, "appcatalog.action", "ok", map[string]any{"appId": app.ID, "action": body.Action})
	nextContainers, _ := docker.ListContainers()
	view := s.buildInstalledAppView(*app, nextContainers, s.ownerScopeFor(actor))
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "app": view})
}

func (s *Server) handleAppCatalogUninstall(w http.ResponseWriter, r *http.Request) {
	actor, app, code, err := s.loadOwnedInstalledApp(r)
	if err != nil {
		s.writeError(w, code, err)
		return
	}

	removeContainer := r.URL.Query().Get("removeContainer") == "true"
	removeVolumes := r.URL.Query().Get("removeVolumes") == "true"

	if removeContainer && (app.Kind == "docker" || app.Kind == "existing-container") {
		if !auth.HasCapability(actor.Role, auth.CapabilityDockerLifecycle) {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "tidak memiliki izin menghapus container"})
			return
		}
		if containers, listErr := docker.ListContainers(); listErr == nil {
			if matched := matchContainerForApp(*app, containers, s.ownerScopeFor(actor)); matched != nil {
				if docker.ManagedKind(*matched) == "" {
					if delErr := docker.DeleteContainer(matched.ID, removeVolumes, false); delErr != nil {
						s.writeError(w, http.StatusBadGateway, delErr)
						return
					}
				}
			}
		}
	}

	if err := s.database.DeleteInstalledApp(app.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, actor, "appcatalog.uninstall", "ok", map[string]any{"appId": app.ID, "name": app.Name, "removeContainer": removeContainer})
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
}

func appCatalogSplitPath(p string) (idStr, rest string) {
	trimmed := strings.TrimPrefix(p, appCatalogProxyPrefix)
	idStr, rest, _ = strings.Cut(trimmed, "/")
	return idStr, rest
}

func stripPanelCookies(cookieHeader string) string {
	if strings.TrimSpace(cookieHeader) == "" {
		return ""
	}
	parts := strings.Split(cookieHeader, ";")
	kept := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		name, _, _ := strings.Cut(trimmed, "=")
		if strings.EqualFold(strings.TrimSpace(name), "reneo_session") {
			continue
		}
		kept = append(kept, trimmed)
	}
	return strings.Join(kept, "; ")
}

var (
	htmlRootAttrRe = regexp.MustCompile(`(?i)(\b(?:href|src|action|poster|data-src)=["'])(/[^/"'][^"']*)`)
)

func rewriteProxyHTML(body []byte, prefix string) []byte {
	// Prefix root-relative HTML attributes like href="/assets/..." except "//" and already-prefixed paths
	rewritten := htmlRootAttrRe.ReplaceAllFunc(body, func(match []byte) []byte {
		sub := htmlRootAttrRe.FindSubmatch(match)
		if len(sub) != 3 {
			return match
		}
		val := string(sub[2])
		if strings.HasPrefix(val, prefix+"/") || val == prefix {
			return match
		}
		return append(append([]byte{}, sub[1]...), []byte(prefix+val)...)
	})

	shim := fmt.Sprintf(
		`<script>(function(){var P=%q;function rw(u){if(typeof u==="string"&&u.charAt(0)==="/"&&u.charAt(1)!=="/"&&u.indexOf(P+"/")!==0&&u!==P){return P+u}return u}if(window.fetch){var f=window.fetch;window.fetch=function(i,o){if(typeof i==="string"){i=rw(i)}else if(i&&typeof i.url==="string"&&i.url.indexOf(location.origin+"/")===0){var rel=i.url.slice(location.origin.length);var nr=rw(rel);if(nr!==rel)i=new Request(location.origin+nr,i)}return f.call(this,i,o)}}var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"){arguments[1]=rw(u)}return XO.apply(this,arguments)}})();</script>`,
		prefix,
	)

	if idx := bytes.Index(bytes.ToLower(rewritten), []byte("<head>")); idx != -1 {
		pos := idx + len("<head>")
		var out bytes.Buffer
		out.Write(rewritten[:pos])
		out.WriteString(shim)
		out.Write(rewritten[pos:])
		return out.Bytes()
	}
	return append([]byte(shim), rewritten...)
}

func rewriteCookiePath(cookieHeader, prefix string) string {
	parts := strings.Split(cookieHeader, ";")
	hasPath := false
	for i, part := range parts {
		trimmed := strings.TrimSpace(part)
		lower := strings.ToLower(trimmed)
		if strings.HasPrefix(lower, "path=/") {
			hasPath = true
			if lower == "path=/" {
				parts[i] = " Path=" + prefix + "/"
			} else {
				origPath := trimmed[5:]
				if !strings.HasPrefix(origPath, prefix) {
					parts[i] = " Path=" + prefix + origPath
				}
			}
		}
	}
	if !hasPath {
		parts = append(parts, " Path="+prefix+"/")
	}
	return strings.Join(parts, ";")
}

func (s *Server) appCatalogProxy() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := userFromCtx(r)
		if u == nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if s.isDemoUser(u) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		idStr, rest := appCatalogSplitPath(r.URL.Path)
		appID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil || appID <= 0 {
			http.NotFound(w, r)
			return
		}
		app, err := s.database.GetInstalledApp(appID)
		if err != nil || app == nil {
			http.NotFound(w, r)
			return
		}
		if app.UserID != u.ID && !s.ownerScopeFor(u).has(app.UserID) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if r.URL.Path == appCatalogProxyPrefix+idStr {
			http.Redirect(w, r, appCatalogProxyPrefix+idStr+"/", http.StatusPermanentRedirect)
			return
		}

		var targetURL *url.URL
		if app.Kind == "custom-url" {
			if !app.UseProxy {
				http.Error(w, "proxy disabled for this custom url app", http.StatusForbidden)
				return
			}
			valid, err := validateTargetURLForRole(app.TargetURL, u.Role, true)
			if err != nil {
				http.Error(w, err.Error(), http.StatusForbidden)
				return
			}
			targetURL, err = url.Parse(valid)
			if err != nil {
				http.Error(w, "invalid target url", http.StatusBadGateway)
				return
			}
		} else {
			if app.HostPort <= 0 {
				http.Error(w, "application host port is not configured", http.StatusBadGateway)
				return
			}
			targetURL = &url.URL{
				Scheme: "http",
				Host:   net.JoinHostPort("127.0.0.1", strconv.Itoa(app.HostPort)),
			}
		}

		meta := parseAppConfigMeta(app.ConfigJSON)
		prefix := strings.TrimSuffix(appCatalogProxyPrefix+idStr, "/")

		proxy := &httputil.ReverseProxy{
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.Out.URL.Scheme = targetURL.Scheme
				pr.Out.URL.Host = targetURL.Host
				pr.Out.Host = targetURL.Host
				pr.Out.Header.Del("Authorization")
				if cleanedCookies := stripPanelCookies(pr.In.Header.Get("Cookie")); cleanedCookies != "" {
					pr.Out.Header.Set("Cookie", cleanedCookies)
				} else {
					pr.Out.Header.Del("Cookie")
				}
				if meta.KeepPrefix {
					pr.Out.URL.Path = pr.In.URL.Path
					pr.Out.URL.RawPath = pr.In.URL.RawPath
				} else {
					basePath := strings.TrimSuffix(targetURL.Path, "/")
					pr.Out.URL.Path = basePath + "/" + rest
					pr.Out.URL.RawPath = ""
					// Request uncompressed HTML/text so root-relative rewrites stay clean and fast.
					pr.Out.Header.Del("Accept-Encoding")
				}
				pr.SetXForwarded()
			},
			ModifyResponse: func(resp *http.Response) error {
				resp.Header.Del("X-Frame-Options")
				resp.Header.Del("Cross-Origin-Opener-Policy")
				if csp := resp.Header.Get("Content-Security-Policy"); csp != "" && strings.Contains(strings.ToLower(csp), "frame-ancestors") {
					// Strip restrictive frame-ancestors so the app renders inside its Reneo desktop window.
					directives := strings.Split(csp, ";")
					filtered := make([]string, 0, len(directives))
					for _, d := range directives {
						if strings.HasPrefix(strings.ToLower(strings.TrimSpace(d)), "frame-ancestors") {
							continue
						}
						if strings.TrimSpace(d) != "" {
							filtered = append(filtered, d)
						}
					}
					if len(filtered) > 0 {
						resp.Header.Set("Content-Security-Policy", strings.Join(filtered, ";"))
					} else {
						resp.Header.Del("Content-Security-Policy")
					}
				}

				if !meta.KeepPrefix {
					if loc := resp.Header.Get("Location"); loc != "" {
						if strings.HasPrefix(loc, "/") && !strings.HasPrefix(loc, "//") && !strings.HasPrefix(loc, prefix+"/") && loc != prefix {
							resp.Header.Set("Location", prefix+loc)
						}
					}
					if cookies := resp.Header.Values("Set-Cookie"); len(cookies) > 0 {
						resp.Header.Del("Set-Cookie")
						for _, c := range cookies {
							resp.Header.Add("Set-Cookie", rewriteCookiePath(c, prefix))
						}
					}
					ct := strings.ToLower(resp.Header.Get("Content-Type"))
					if strings.Contains(ct, "text/html") && resp.Header.Get("Content-Encoding") == "" && resp.Body != nil {
						raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
						_ = resp.Body.Close()
						if err == nil {
							updated := rewriteProxyHTML(raw, prefix)
							resp.Body = io.NopCloser(bytes.NewReader(updated))
							resp.ContentLength = int64(len(updated))
							resp.Header.Set("Content-Length", strconv.Itoa(len(updated)))
						}
					}
				}
				return nil
			},
			ErrorHandler: func(rw http.ResponseWriter, _ *http.Request, _ error) {
				rw.Header().Set("Content-Type", "text/html; charset=utf-8")
				rw.WriteHeader(http.StatusBadGateway)
				_, _ = io.WriteString(rw, "<!doctype html><html><body style=\"font-family:sans-serif;padding:24px;color:#334155\"><h3>Aplikasi belum merespons</h3><p>Pastikan container sedang berjalan dan siap menerima koneksi di port "+strconv.Itoa(app.HostPort)+".</p></body></html>")
			},
		}

		proxy.ServeHTTP(w, r)
	})
}
