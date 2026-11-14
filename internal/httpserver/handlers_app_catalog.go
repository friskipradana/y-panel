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
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/friskipradana/panel-desktop-ui/internal/auth"
	"github.com/friskipradana/panel-desktop-ui/internal/crypto"
	"github.com/friskipradana/panel-desktop-ui/internal/database"
	"github.com/friskipradana/panel-desktop-ui/internal/docker"
	"github.com/friskipradana/panel-desktop-ui/internal/userdb"
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
	Hidden       bool   `json:"hidden,omitempty"`
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
	Versions        []string            `json:"versions,omitempty"`
	ContainerPort   int                 `json:"containerPort"`
	DefaultHostPort int                 `json:"defaultHostPort"`
	OpenPath        string              `json:"openPath"`
	KeepPrefix      bool                `json:"keepPrefix"`
	SuperadminOnly  bool                `json:"superadminOnly"`
	Official        bool                `json:"official,omitempty"`
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
		IconKey:         "uptime-kuma",
		IconColor:       "emerald",
		Image:           "louislam/uptime-kuma:2",
		Versions:        []string{"2", "2-slim", "1", "1-slim"},
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
		IconKey:         "filebrowser",
		IconColor:       "amber",
		Image:           "filebrowser/filebrowser:latest",
		Versions:        []string{"latest", "s6"},
		ContainerPort:   80,
		DefaultHostPort: 18002,
		OpenPath:        "/",
		KeepPrefix:      true,
		NotesID:         "Login awal bawaan FileBrowser: user admin / password admin (segera ganti setelah masuk).",
		NotesEN:         "Default initial login is admin / admin — change the password immediately after sign-in.",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "srv", ContainerPath: "/srv", Label: "Direktori berkas"},
			{HostSubdir: "database", ContainerPath: "/database", Label: "Database konfigurasi"},
			{HostSubdir: "config", ContainerPath: "/config", Label: "Konfigurasi FileBrowser"},
		},
		Env: []catalogEnvSpec{
			{Key: "FB_DATABASE", DefaultValue: "/database/filebrowser.db", LabelID: "Lokasi Database", LabelEN: "Database Path"},
			{Key: "FB_ROOT", DefaultValue: "/srv", LabelID: "Direktori Berkas", LabelEN: "Files Root Path"},
		},
		ProxyEnv: map[string]string{
			"FB_DATABASE": "/database/filebrowser.db",
			"FB_ROOT":     "/srv",
			"FB_PORT":     "80",
			"FB_ADDRESS":  "0.0.0.0",
			"FB_BASEURL":  "{{PROXY_PREFIX}}",
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
		IconKey:         "it-tools",
		IconColor:       "teal",
		Image:           "corentinth/it-tools:latest",
		Versions:        []string{"latest"},
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
		IconKey:         "n8n",
		IconColor:       "orange",
		Image:           "docker.n8n.io/n8nio/n8n:latest",
		Versions:        []string{"latest", "next"},
		ContainerPort:   5678,
		DefaultHostPort: 18004,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/home/node/.n8n", Label: "Workflow & kredensial n8n"},
		},
		Env: []catalogEnvSpec{
			{Key: "GENERIC_TIMEZONE", DefaultValue: "Asia/Jakarta", LabelID: "Zona Waktu", LabelEN: "Timezone", Placeholder: "Asia/Jakarta"},
			{Key: "N8N_SECURE_COOKIE", DefaultValue: "false", LabelID: "Cookie HTTPS Ketat (false untuk akses LAN/HTTP)", LabelEN: "Strict HTTPS Cookie (false for HTTP/LAN proxy)"},
		},
		ProxyEnv: map[string]string{
			"N8N_LISTEN_ADDRESS": "0.0.0.0",
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
		IconKey:         "vaultwarden",
		IconColor:       "indigo",
		Image:           "vaultwarden/server:latest",
		Versions:        []string{"latest", "alpine"},
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
		IconKey:         "grafana",
		IconColor:       "orange",
		Image:           "grafana/grafana-oss:latest",
		Versions:        []string{"latest", "main"},
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
		IconKey:         "stirling-pdf",
		IconColor:       "rose",
		Image:           "stirlingtools/stirling-pdf:latest",
		Versions:        []string{"latest", "latest-fat", "latest-ultra-lite"},
		ContainerPort:   8080,
		DefaultHostPort: 18007,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "configs", ContainerPath: "/configs", Label: "Konfigurasi Stirling-PDF"},
		},
		Env: []catalogEnvSpec{
			{Key: "DOCKER_ENABLE_SECURITY", DefaultValue: "false", LabelID: "Aktifkan Login Tambahan", LabelEN: "Enable Built-in Login"},
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
		IconKey:         "excalidraw",
		IconColor:       "violet",
		Image:           "excalidraw/excalidraw:latest",
		Versions:        []string{"latest"},
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
		IconKey:         "gitea",
		IconColor:       "emerald",
		Image:           "gitea/gitea:latest",
		Versions:        []string{"latest", "1.23", "1.22", "rootless"},
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
		IconKey:         "memos",
		IconColor:       "sky",
		Image:           "neosmemo/memos:stable",
		Versions:        []string{"stable", "latest"},
		ContainerPort:   5230,
		DefaultHostPort: 18010,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/var/opt/memos", Label: "Database catatan Memos"},
		},
	},
	{
		ID:              "reneo-crm",
		Name:            "Reneo CRM WhatsApp",
		TaglineID:       "CRM WhatsApp, siaran terjadwal, ucapan ultah & live chat lead",
		TaglineEN:       "WhatsApp CRM with scheduled broadcast, birthday bot & live chat",
		DescriptionID:   "Kelola database pelanggan, jalankan siaran WhatsApp terjadwal dengan jeda anti-ban, otomatisasi ucapan ulang tahun, serta pantau status pesan terkirim dan dibaca (centang biru) secara real-time.",
		DescriptionEN:   "Manage customer leads, execute scheduled WhatsApp broadcasts with anti-ban delay, automate birthday greetings, and track real-time delivery and read receipts.",
		Category:        "automation",
		IconKey:         "reneo-crm",
		IconColor:       "emerald",
		Official:        true,
		Image:           "reneoofc/crm-services:latest",
		Versions:        []string{"latest", "1.0.7", "1.0.6", "1.0.5", "1.0.4", "1.0.3", "1.0.0"},
		ContainerPort:   80,
		DefaultHostPort: 18011,
		OpenPath:        "/",
		NotesID:         "Aplikasi berlisensi berlangganan bulanan. Dikelola dan dibayar langsung melalui panel Hosting Reneo.",
		NotesEN:         "Subscription-based licensed application. Managed and billed directly through the Reneo Hosting panel.",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/app/data", Label: "Data CRM & Berkas"},
		},
		Env: []catalogEnvSpec{
			{Key: "DATABASE_URL", DefaultValue: "", LabelID: "Koneksi PostgreSQL", LabelEN: "PostgreSQL Database URL", Hidden: true},
			{Key: "REDIS_URL", DefaultValue: "", LabelID: "Koneksi Redis Queue", LabelEN: "Redis Queue URL", Hidden: true},
			{Key: "WAHA_BASE_URL", DefaultValue: "http://reneo-waha:3000", LabelID: "Base URL WAHA Reneo", LabelEN: "Reneo WAHA Base URL", Hidden: true},
			{Key: "WAHA_SESSION", DefaultValue: "", LabelID: "Nama Sesi WhatsApp", LabelEN: "WhatsApp Session Name", Hidden: true},
			{Key: "WAHA_API_KEY", DefaultValue: "", LabelID: "API Key WAHA (opsional)", LabelEN: "WAHA API Key", Secret: true, Hidden: true},
			{Key: "RENEO_PANEL_URL", DefaultValue: "", LabelID: "URL Panel Reneo", LabelEN: "Reneo Panel URL", Hidden: true},
		},
	},
	{
		ID:              "adguard-home",
		Name:            "AdGuard Home",
		TaglineID:       "DNS blocker tingkat jaringan untuk memblokir iklan, pelacak, & malware",
		TaglineEN:       "Network-wide DNS sinkhole for blocking ads, trackers, and malware",
		DescriptionID:   "Server DNS pribadi dengan dashboard analitik kueri, parental control, dan dukungan DoH/DoT.",
		DescriptionEN:   "Private DNS server with query analytics dashboard, parental control, and DoH/DoT support.",
		Category:        "security",
		IconKey:         "adguard-home",
		IconColor:       "emerald",
		Image:           "adguard/adguardhome:latest",
		Versions:        []string{"latest"},
		ContainerPort:   3000,
		DefaultHostPort: 18012,
		OpenPath:        "/",
		NotesID:         "Wizard setup awal berjalan di port 3000; saat setup, arahkan web admin port ke 3000 agar tetap dapat dibuka lewat proxy ini.",
		NotesEN:         "Initial setup runs on port 3000; keep the admin web port set to 3000 during setup so this proxy stays reachable.",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "work", ContainerPath: "/opt/adguardhome/work", Label: "Data kerja AdGuard Home"},
			{HostSubdir: "conf", ContainerPath: "/opt/adguardhome/conf", Label: "Konfigurasi AdGuard Home"},
		},
	},
	{
		ID:              "jellyfin",
		Name:            "Jellyfin",
		TaglineID:       "Server streaming media film, serial TV, dan musik open-source",
		TaglineEN:       "Free and open-source media server for movies, TV shows, and music",
		DescriptionID:   "Streaming koleksi video dan musik pribadi ke browser, TV, maupun ponsel tanpa biaya langganan.",
		DescriptionEN:   "Stream your personal video and music library to browsers, TVs, and mobile apps without subscriptions.",
		Category:        "media",
		IconKey:         "jellyfin",
		IconColor:       "violet",
		Image:           "jellyfin/jellyfin:latest",
		Versions:        []string{"latest", "10.10"},
		ContainerPort:   8096,
		DefaultHostPort: 18013,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "config", ContainerPath: "/config", Label: "Konfigurasi & metadata Jellyfin"},
			{HostSubdir: "cache", ContainerPath: "/cache", Label: "Cache transcoding"},
			{HostSubdir: "media", ContainerPath: "/media", Label: "Direktori media"},
		},
		Env: []catalogEnvSpec{
			{Key: "TZ", DefaultValue: "Asia/Jakarta", LabelID: "Zona Waktu", LabelEN: "Timezone"},
		},
	},
	{
		ID:              "nextcloud",
		Name:            "Nextcloud",
		TaglineID:       "Cloud storage pribadi, sinkronisasi berkas, kalender & kolaborasi tim",
		TaglineEN:       "Self-hosted cloud storage, file sync, calendar, and team collaboration",
		DescriptionID:   "Alternatif Google Drive dan Office pribadi yang menyimpan seluruh data dan dokumen di server Anda.",
		DescriptionEN:   "Private alternative to Google Drive for storing files, photos, calendars, and shared documents on your server.",
		Category:        "files",
		IconKey:         "nextcloud",
		IconColor:       "blue",
		Image:           "nextcloud:latest",
		Versions:        []string{"latest", "apache", "30"},
		ContainerPort:   80,
		DefaultHostPort: 18014,
		OpenPath:        "/",
		NotesID:         "SQLite bawaan dapat langsung digunakan saat wizard awal untuk penggunaan pribadi.",
		NotesEN:         "Built-in SQLite works out of the box during initial setup for personal use.",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "html", ContainerPath: "/var/www/html", Label: "Data & aplikasi Nextcloud"},
		},
	},
	{
		ID:              "nginx-proxy-manager",
		Name:            "Nginx Proxy Manager",
		TaglineID:       "Manajemen reverse proxy visual dengan sertifikat SSL Let's Encrypt otomatis",
		TaglineEN:       "Visual reverse proxy manager with automated Let's Encrypt SSL certificates",
		DescriptionID:   "Kelola domain, subdomain, access list, dan SSL certificate melalui antarmuka web tanpa konfigurasi manual.",
		DescriptionEN:   "Manage proxy hosts, domains, access lists, and SSL certificates from a clean web interface.",
		Category:        "security",
		IconKey:         "nginx-proxy-manager",
		IconColor:       "amber",
		Image:           "jc21/nginx-proxy-manager:latest",
		Versions:        []string{"latest", "2"},
		ContainerPort:   81,
		DefaultHostPort: 18015,
		OpenPath:        "/",
		NotesID:         "Login awal: admin@example.com / changeme (segera ubah setelah masuk).",
		NotesEN:         "Default login: admin@example.com / changeme (change immediately after login).",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/data", Label: "Database & konfigurasi proxy"},
			{HostSubdir: "letsencrypt", ContainerPath: "/etc/letsencrypt", Label: "Sertifikat SSL Let's Encrypt"},
		},
	},
	{
		ID:              "open-webui",
		Name:            "Open WebUI",
		TaglineID:       "Antarmuka web modern untuk model AI lokal (Ollama) & API kompatibel OpenAI",
		TaglineEN:       "Modern ChatGPT-style web interface for local Ollama models and OpenAI APIs",
		DescriptionID:   "Jalankan obrolan AI, RAG dokumen, dan manajemen prompt secara privat terhubung ke Ollama atau endpoint OpenAI.",
		DescriptionEN:   "Run private AI chat, document RAG, and prompt workflows connected to Ollama or OpenAI-compatible endpoints.",
		Category:        "automation",
		IconKey:         "open-webui",
		IconColor:       "slate",
		Image:           "ghcr.io/open-webui/open-webui:main",
		Versions:        []string{"main", "latest"},
		ContainerPort:   8080,
		DefaultHostPort: 18016,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/app/backend/data", Label: "Database riwayat chat & model"},
		},
		Env: []catalogEnvSpec{
			{Key: "OLLAMA_BASE_URL", DefaultValue: "http://host.docker.internal:11434", LabelID: "URL Ollama Server", LabelEN: "Ollama Server URL"},
			{Key: "WEBUI_AUTH", DefaultValue: "true", LabelID: "Aktifkan Autentikasi Akun", LabelEN: "Enable User Auth"},
		},
	},
	{
		ID:              "beszel",
		Name:            "Beszel",
		TaglineID:       "Hub pemantauan server ringan dengan riwayat CPU, RAM, disk, & Docker",
		TaglineEN:       "Lightweight server monitoring hub with CPU, memory, disk, and Docker stats",
		DescriptionID:   "Pantau statistik beberapa server dan status container Docker dengan konsumsi sumber daya sangat kecil.",
		DescriptionEN:   "Monitor server metrics, resource alerts, and Docker container stats with minimal footprint.",
		Category:        "monitoring",
		IconKey:         "beszel",
		IconColor:       "cyan",
		Image:           "henrygd/beszel:latest",
		Versions:        []string{"latest"},
		ContainerPort:   8090,
		DefaultHostPort: 18017,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/beszel_data", Label: "Database metrik Beszel"},
		},
	},
	{
		ID:              "actual-budget",
		Name:            "Actual Budget",
		TaglineID:       "Aplikasi manajemen keuangan & anggaran pribadi berkonsep local-first",
		TaglineEN:       "Local-first personal finance and envelope budgeting application",
		DescriptionID:   "Kelola pemasukan, pengeluaran, target tabungan, dan laporan kas bulanan secara privat di server Anda.",
		DescriptionEN:   "Track expenses, manage monthly budgets, and analyze cashflow privately on your own server.",
		Category:        "files",
		IconKey:         "actual-budget",
		IconColor:       "violet",
		Image:           "actualbudget/actual-server:latest",
		Versions:        []string{"latest"},
		ContainerPort:   5006,
		DefaultHostPort: 18018,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "data", ContainerPath: "/data", Label: "Data anggaran Actual"},
		},
	},
	{
		ID:              "vikunja",
		Name:            "Vikunja",
		TaglineID:       "Manajer tugas & papan Kanban open-source alternatif Trello/Todoist",
		TaglineEN:       "Open-source task manager and Kanban board alternative to Trello and Todoist",
		DescriptionID:   "Atur daftar tugas proyek, papan Kanban, kalender tenggat waktu, dan kolaborasi tim dengan SQLite bawaan.",
		DescriptionEN:   "Organize project tasks, Kanban boards, Gantt timelines, and team checklists with built-in SQLite.",
		Category:        "automation",
		IconKey:         "vikunja",
		IconColor:       "blue",
		Image:           "vikunja/vikunja:latest",
		Versions:        []string{"latest"},
		ContainerPort:   3456,
		DefaultHostPort: 18019,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "files", ContainerPath: "/app/vikunja/files", Label: "Berkas & database SQLite Vikunja"},
		},
	},
	{
		ID:              "metube",
		Name:            "MeTube",
		TaglineID:       "Antarmuka web yt-dlp untuk mengunduh video & audio dari berbagai platform",
		TaglineEN:       "Web GUI for yt-dlp to download videos and audio from YouTube and more",
		DescriptionID:   "Unduh video maupun audio playlist langsung ke folder server dengan pemilihan format dan kualitas otomatis.",
		DescriptionEN:   "Download videos and audio playlists directly to your server storage with format presets.",
		Category:        "media",
		IconKey:         "metube",
		IconColor:       "rose",
		Image:           "ghcr.io/alexta69/metube:latest",
		Versions:        []string{"latest"},
		ContainerPort:   8081,
		DefaultHostPort: 18020,
		OpenPath:        "/",
		Volumes: []catalogVolumeSpec{
			{HostSubdir: "downloads", ContainerPath: "/downloads", Label: "Folder hasil unduhan"},
		},
	},
	{
		ID:              "pairdrop",
		Name:            "PairDrop",
		TaglineID:       "Berbagi berkas lintas perangkat bergaya AirDrop langsung di browser",
		TaglineEN:       "Local AirDrop-style cross-platform file sharing directly in your browser",
		DescriptionID:   "Kirim foto, video, dan dokumen antar ponsel atau PC dengan cepat tanpa instalasi aplikasi tambahan.",
		DescriptionEN:   "Transfer files across phones and desktops instantaneously over local network or rooms.",
		Category:        "files",
		IconKey:         "pairdrop",
		IconColor:       "sky",
		Image:           "lscr.io/linuxserver/pairdrop:latest",
		Versions:        []string{"latest"},
		ContainerPort:   3000,
		DefaultHostPort: 18021,
		OpenPath:        "/",
		Env: []catalogEnvSpec{
			{Key: "TZ", DefaultValue: "Asia/Jakarta", LabelID: "Zona Waktu", LabelEN: "Timezone"},
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

var customCatalogMu sync.Mutex

func (s *Server) customCatalogPath() string {
	return filepath.Join(s.cfg.StateDir, "custom_app_catalog.json")
}

func (s *Server) loadCustomCatalogApps() []CatalogApp {
	customCatalogMu.Lock()
	defer customCatalogMu.Unlock()
	data, err := os.ReadFile(s.customCatalogPath())
	if err != nil {
		return nil
	}
	var items []CatalogApp
	if err := json.Unmarshal(data, &items); err != nil {
		return nil
	}
	return items
}

func (s *Server) saveCustomCatalogApps(items []CatalogApp) error {
	customCatalogMu.Lock()
	defer customCatalogMu.Unlock()
	if err := os.MkdirAll(s.cfg.StateDir, 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.customCatalogPath(), raw, 0o600)
}

func (s *Server) findCatalogAppByID(id string) (CatalogApp, bool) {
	if item, ok := findCatalogApp(id); ok {
		return item, true
	}
	trimmed := strings.TrimSpace(id)
	for _, item := range s.loadCustomCatalogApps() {
		if item.ID == trimmed {
			return item, true
		}
	}
	return CatalogApp{}, false
}

type createCustomCatalogRequest struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Tagline         string   `json:"tagline"`
	Description     string   `json:"description"`
	Category        string   `json:"category"`
	IconKey         string   `json:"iconKey"`
	IconColor       string   `json:"iconColor"`
	Image           string   `json:"image"`
	Versions        []string `json:"versions"`
	ContainerPort   int      `json:"containerPort"`
	DefaultHostPort int      `json:"defaultHostPort"`
	OpenPath        string   `json:"openPath"`
	Notes           string   `json:"notes"`
}

var customCatalogSlugRe = regexp.MustCompile(`[^a-z0-9-]+`)

func customCatalogSlug(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = customCatalogSlugRe.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func (s *Server) handleCreateCustomCatalogApp(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil || !auth.IsSuperAdmin(actor.Role) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "hanya superadmin yang dapat menambahkan item katalog"})
		return
	}
	var req createCustomCatalogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "payload tidak valid"})
		return
	}
	name := strings.TrimSpace(req.Name)
	image := strings.TrimSpace(req.Image)
	if name == "" || image == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "nama dan image Docker wajib diisi"})
		return
	}
	if req.ContainerPort < 1 || req.ContainerPort > 65535 {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "port container tidak valid (1-65535)"})
		return
	}
	slug := customCatalogSlug(req.ID)
	if slug == "" {
		slug = customCatalogSlug(name)
	}
	if slug == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "id/slug katalog tidak valid"})
		return
	}
	if _, exists := s.findCatalogAppByID(slug); exists {
		s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "aplikasi dengan ID tersebut sudah ada di katalog"})
		return
	}
	tagline := strings.TrimSpace(req.Tagline)
	if tagline == "" {
		tagline = name
	}
	desc := strings.TrimSpace(req.Description)
	if desc == "" {
		desc = tagline
	}
	cat := strings.TrimSpace(req.Category)
	if cat == "" {
		cat = "tools"
	}
	iconKey := strings.TrimSpace(req.IconKey)
	if iconKey == "" {
		iconKey = "box"
	}
	iconColor := strings.TrimSpace(req.IconColor)
	if iconColor == "" {
		iconColor = "sky"
	}
	openPath := strings.TrimSpace(req.OpenPath)
	if openPath == "" {
		openPath = "/"
	} else if !strings.HasPrefix(openPath, "/") {
		openPath = "/" + openPath
	}
	defaultHostPort := req.DefaultHostPort
	if defaultHostPort < 1 || defaultHostPort > 65535 {
		defaultHostPort = 18100
	}
	versions := req.Versions
	if len(versions) == 0 {
		if idx := strings.LastIndex(image, ":"); idx > strings.LastIndex(image, "/") {
			versions = []string{image[idx+1:]}
		} else {
			versions = []string{"latest"}
		}
	}
	item := CatalogApp{
		ID:              slug,
		Name:            name,
		TaglineID:       tagline,
		TaglineEN:       tagline,
		DescriptionID:   desc,
		DescriptionEN:   desc,
		Category:        cat,
		IconKey:         iconKey,
		IconColor:       iconColor,
		Image:           image,
		Versions:        versions,
		ContainerPort:   req.ContainerPort,
		DefaultHostPort: defaultHostPort,
		OpenPath:        openPath,
		NotesID:         strings.TrimSpace(req.Notes),
		NotesEN:         strings.TrimSpace(req.Notes),
	}
	existing := s.loadCustomCatalogApps()
	existing = append(existing, item)
	if err := s.saveCustomCatalogApps(existing); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, actor, "appcatalog.create_catalog", "ok", map[string]any{"id": item.ID, "image": item.Image})
	s.writeJSON(w, http.StatusCreated, jsonResponse{"item": item})
}

func (s *Server) handleDeleteCustomCatalogApp(w http.ResponseWriter, r *http.Request) {
	actor := s.currentUserRecord(r)
	if actor == nil || !auth.IsSuperAdmin(actor.Role) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "hanya superadmin yang dapat menghapus item katalog kustom"})
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if _, isBuiltin := findCatalogApp(id); isBuiltin {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "item katalog bawaan tidak dapat dihapus"})
		return
	}
	existing := s.loadCustomCatalogApps()
	next := make([]CatalogApp, 0, len(existing))
	found := false
	for _, item := range existing {
		if item.ID == id {
			found = true
			continue
		}
		next = append(next, item)
	}
	if !found {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "item katalog kustom tidak ditemukan"})
		return
	}
	if err := s.saveCustomCatalogApps(next); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true})
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

func normalizeOpenPath(raw string, slugs ...string) string {
	p := strings.TrimSpace(raw)
	if p == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	// Strip proxy prefix if accidentally included (/api/v1/app-catalog/proxy/<id>)
	if idx := strings.Index(p, appCatalogProxyPrefix); idx != -1 {
		rest := p[idx+len(appCatalogProxyPrefix):]
		if slash := strings.Index(rest, "/"); slash != -1 {
			p = rest[slash:]
		} else {
			return "/"
		}
	}
	// Strip repeated leading /app/ or /app
	for strings.HasPrefix(p, "/app/") {
		p = strings.TrimPrefix(p, "/app")
	}
	if p == "/app" {
		return "/"
	}
	// Strip specified slugs
	for _, s := range slugs {
		clean := strings.TrimSpace(s)
		if clean == "" {
			continue
		}
		prefix := "/" + clean
		for strings.HasPrefix(p, prefix+"/") {
			p = strings.TrimPrefix(p, prefix)
		}
		if p == prefix {
			return "/"
		}
	}
	// Strip builtin catalog IDs (e.g. /grafana, /n8n, /uptime-kuma)
	for _, cat := range builtinCatalogApps {
		prefix := "/" + cat.ID
		for strings.HasPrefix(p, prefix+"/") {
			p = strings.TrimPrefix(p, prefix)
		}
		if p == prefix {
			return "/"
		}
	}
	if p == "" || !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	for strings.Contains(p, "//") {
		p = strings.ReplaceAll(p, "//", "/")
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
	usedContainers := make(map[string]bool)
	if containers, err := docker.ListContainers(); err == nil {
		for _, c := range containers {
			for _, n := range c.Names {
				usedContainers[strings.TrimPrefix(n, "/")] = true
			}
		}
	}
	candidate := slug
	for i := 2; i < 100; i++ {
		existing, _ := s.database.GetInstalledAppBySlug(userID, candidate)
		projectName := fmt.Sprintf("reneo-app-%d-%s", userID, candidate)
		if existing == nil && !usedContainers[projectName] {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", slug, i)
	}
	return fmt.Sprintf("%s-%d", slug, time.Now().Unix()%10000)
}

func effectiveKeepPrefix(app database.InstalledApp, meta appConfigMeta) bool {
	if app.CatalogID == "n8n" || app.CatalogID == "stirling-pdf" || app.CatalogID == "reneo-crm" {
		return false
	}
	return meta.KeepPrefix
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
			clean := strings.TrimPrefix(name, "/")
			if clean == want || clean == want+"-"+want || strings.HasPrefix(clean, want+"-") {
				return c
			}
		}
		if strings.EqualFold(strings.TrimSpace(c.ProjectName), want) {
			return c
		}
	}
	return nil
}

func (s *Server) ensureManagedDependencyDB(actor *database.User, engineID, defaultName string) (string, error) {
	if actor == nil || s.database == nil || !s.database.IsConnected() {
		return "", errors.New("database panel tidak aktif")
	}
	engine, ok := userdb.Lookup(engineID)
	if !ok {
		return "", fmt.Errorf("engine %s tidak didukung", engineID)
	}
	existing, err := s.database.ListManagedDatabases(actor.ID, false)
	if err == nil {
		var fallback *database.ManagedDatabase
		for i := range existing {
			item := &existing[i]
			if item.Engine != engineID || item.Status == "error" {
				continue
			}
			if item.Name == defaultName {
				fallback = item
				break
			}
			if fallback == nil {
				fallback = item
			}
		}
		if fallback != nil {
			if fallback.Status == "stopped" {
				_ = userdb.Start(fallback.ID)
				_ = s.database.SetManagedDatabaseStatus(fallback.ID, "ready", "")
			}
			password, decErr := crypto.Decrypt(s.cfg.EncryptionKey, fallback.PasswordEncrypted)
			if decErr == nil && password != "" {
				cName := strings.TrimSpace(fallback.ContainerName)
				if cName == "" {
					cName = fmt.Sprintf("reneo-db-%d", fallback.ID)
				}
				if netErr := docker.EnsureContainerOnNetwork("reneo-internal", cName); netErr == nil {
					return userdb.ConnectionURL(engine, cName, engine.InternalPort, fallback.DatabaseName, fallback.Username, password), nil
				}
				return userdb.ConnectionURL(engine, "host.docker.internal", fallback.HostPort, fallback.DatabaseName, fallback.Username, password), nil
			}
		}
	}

	s.databaseCreateMu.Lock()
	defer s.databaseCreateMu.Unlock()
	port, err := s.allocateDatabasePort()
	if err != nil {
		return "", err
	}
	password, err := userdb.RandomPassword(24)
	if err != nil {
		return "", err
	}
	encrypted, err := crypto.Encrypt(s.cfg.EncryptionKey, password)
	if err != nil {
		return "", err
	}
	dbName, dbUser := "", ""
	if engine.HasDatabaseName {
		dbName = userdb.SQLIdent(defaultName)
	}
	if engine.HasUser {
		dbUser = userdb.SQLIdent(defaultName)
	}
	row, err := s.database.CreateManagedDatabase(actor.ID, defaultName, engine.ID, engine.DefaultVersion, dbName, dbUser, encrypted, port)
	if err != nil {
		return "", err
	}
	spec := userdb.Spec{
		ID:        row.ID,
		OwnerID:   actor.ID,
		OwnerName: actor.Username,
		Engine:    engine,
		Version:   engine.DefaultVersion,
		HostPort:  port,
		Database:  dbName,
		User:      dbUser,
		Password:  password,
	}
	if err := userdb.Create(spec); err != nil {
		_ = s.database.SetManagedDatabaseStatus(row.ID, "error", err.Error())
		return "", err
	}
	_ = s.database.SetManagedDatabaseStatus(row.ID, "ready", "")
	cName := strings.TrimSpace(row.ContainerName)
	if cName == "" {
		cName = fmt.Sprintf("reneo-db-%d", row.ID)
	}
	if netErr := docker.EnsureContainerOnNetwork("reneo-internal", cName); netErr == nil {
		return userdb.ConnectionURL(engine, cName, engine.InternalPort, dbName, dbUser, password), nil
	}
	return userdb.ConnectionURL(engine, "host.docker.internal", port, dbName, dbUser, password), nil
}

func (s *Server) buildInstalledAppView(app database.InstalledApp, containers []docker.Container, scope ownerScope) installedAppView {
	meta := parseAppConfigMeta(app.ConfigJSON)
	slug := strings.TrimSpace(app.Slug)
	cleanOpen := normalizeOpenPath(app.OpenPath, slug, app.CatalogID)
	var proxyPath string
	if slug != "" {
		proxyPath = fmt.Sprintf("/app/%s%s", slug, cleanOpen)
	} else {
		proxyPath = fmt.Sprintf("%s%d%s", appCatalogProxyPrefix, app.ID, cleanOpen)
	}
	if !app.UseProxy && app.TargetURL != "" {
		proxyPath = app.TargetURL
	}
	app.OpenPath = cleanOpen
	if app.CatalogID != "" {
		if cat, ok := s.findCatalogAppByID(app.CatalogID); ok && cat.IconKey != "" {
			switch strings.ToLower(strings.TrimSpace(app.IconKey)) {
			case "", "activity", "folder", "wrench", "workflow", "shield", "bar-chart", "chart", "file-text", "pen-tool", "pen", "git-branch", "notebook", "note", "box", "globe":
				app.IconKey = cat.IconKey
			}
		}
	}
	view := installedAppView{
		InstalledApp: app,
		KeepPrefix:   effectiveKeepPrefix(app, meta),
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
	for _, item := range s.loadCustomCatalogApps() {
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
	repairedAny := false
	for _, item := range installed {
		if item.Kind != "docker" || strings.TrimSpace(item.ContainerName) == "" {
			continue
		}
		matched := matchContainerForApp(item, containers, scope)
		owner, ownerErr := s.resolveDockerOwnerContext(actor, item.UserID)
		if ownerErr != nil {
			continue
		}
		composePath := filepath.Join(owner.DockerRootDir, item.ContainerName, "compose.yml")
		rawCompose, readErr := os.ReadFile(composePath)
		if readErr != nil || len(rawCompose) == 0 {
			continue
		}
		sanitized, changed := sanitizeExistingAppCompose(string(rawCompose), item.ContainerName, item.CatalogID)
		if changed || matched == nil {
			ensureAppVolumePermissions(owner, item.ContainerName)
			_ = docker.DeleteContainer(item.ContainerName+"-"+item.ContainerName, false, false)
			if _, deployErr := docker.DeployFromCompose(owner, docker.DeployComposeRequest{
				Name:        item.ContainerName,
				ComposeYAML: sanitized,
			}); deployErr == nil {
				ensureAppVolumePermissions(owner, item.ContainerName)
				repairedAny = true
			}
		}
	}
	if repairedAny {
		containers, _ = docker.ListContainers()
	}
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
	Version       string            `json:"version"`
	Slug          string            `json:"slug"`
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

var dockerTagRe = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$`)

func splitImageRepoTag(image string) (repo, tag string) {
	trimmed := strings.TrimSpace(image)
	lastSlash := strings.LastIndexByte(trimmed, '/')
	lastColon := strings.LastIndexByte(trimmed, ':')
	if lastColon > lastSlash {
		return trimmed[:lastColon], trimmed[lastColon+1:]
	}
	return trimmed, "latest"
}

func resolveCatalogImage(baseImage, requestedVersion string) (string, error) {
	tag := strings.TrimSpace(requestedVersion)
	if tag == "" {
		return baseImage, nil
	}
	if !dockerTagRe.MatchString(tag) {
		return "", errors.New("tag versi image tidak valid (gunakan huruf, angka, titik, strip, atau garis bawah)")
	}
	repo, _ := splitImageRepoTag(baseImage)
	return repo + ":" + tag, nil
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

	if quota, _ := s.database.GetUserQuota(actor.ID); quota != nil {
		existingApps, _ := s.database.ListInstalledApps(actor.ID)
		if len(existingApps) >= quota.MaxApps {
			if quota.MaxApps <= 0 {
				s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "paket hosting Anda tidak mengizinkan pemasangan aplikasi katalog"})
			} else {
				s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": fmt.Sprintf("kuota aplikasi katalog telah mencapai batas paket Anda (%d/%d aplikasi)", len(existingApps), quota.MaxApps)})
			}
			return
		}
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
	spec, ok := s.findCatalogAppByID(req.CatalogID)
	if !ok {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "aplikasi tidak ditemukan di katalog"})
		return
	}
	if spec.SuperadminOnly && !auth.IsSuperAdmin(actor.Role) {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "aplikasi ini memerlukan hak superadmin"})
		return
	}

	imageRef, imgErr := resolveCatalogImage(spec.Image, req.Version)
	if imgErr != nil {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": imgErr.Error()})
		return
	}

	owner, err := s.resolveDockerOwnerContext(actor, actor.ID)
	if err != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}
	if !auth.IsSuperAdmin(actor.Role) && owner.DiskQuotaMB > 0 && s.accountDiskUsed(actor) >= uint64(owner.DiskQuotaMB)<<20 {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "kuota penyimpanan disk paket Anda sudah penuh"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = spec.Name
	}
	slugCandidate := strings.TrimSpace(req.Slug)
	if slugCandidate == "" && strings.HasPrefix(strings.TrimSpace(req.OpenPath), "/app/") {
		parts := strings.Split(strings.TrimPrefix(strings.TrimSpace(req.OpenPath), "/app/"), "/")
		if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
			slugCandidate = parts[0]
		}
	}
	if slugCandidate == "" {
		slugCandidate = name
	}
	slug := s.uniqueAppSlug(actor.ID, slugCandidate)
	containerProject := fmt.Sprintf("reneo-app-%d-%s", actor.ID, slug)

	hostPort := req.HostPort
	if hostPort > 0 {
		if err := s.ensurePortsFree([]docker.HostPort{{Port: hostPort, Proto: "tcp"}}, portIgnore{composeName: containerProject}); err != nil {
			suggestedPort, _ := s.freePort(appCatalogPortMin, appCatalogPortMax, func(p int) bool { return p == hostPort })
			s.writePortErrorWithSuggestion(w, actor, err, suggestedPort)
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
	openPath := normalizeOpenPath(spec.OpenPath, slug, spec.ID)
	if strings.TrimSpace(req.OpenPath) != "" {
		openPath = normalizeOpenPath(req.OpenPath, slug, spec.ID)
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
		Image:         imageRef,
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

	if spec.ID == "reneo-crm" {
		if v, ok := envMap["DATABASE_URL"]; !ok || strings.TrimSpace(v) == "" {
			pgURL, pgErr := s.ensureManagedDependencyDB(actor, "postgres", "reneo-crm-db")
			if pgErr != nil {
				_ = s.database.DeleteInstalledApp(created.ID)
				s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "gagal menyiapkan PostgreSQL bawaan Reneo: " + pgErr.Error()})
				return
			}
			envMap["DATABASE_URL"] = pgURL
		}
		if v, ok := envMap["REDIS_URL"]; !ok || strings.TrimSpace(v) == "" {
			redisURL, redisErr := s.ensureManagedDependencyDB(actor, "redis", "reneo-crm-redis")
			if redisErr != nil {
				_ = s.database.DeleteInstalledApp(created.ID)
				s.writeJSON(w, http.StatusInternalServerError, jsonResponse{"error": "gagal menyiapkan Redis bawaan Reneo: " + redisErr.Error()})
				return
			}
			envMap["REDIS_URL"] = redisURL
		}
		if v, ok := envMap["RENEO_PANEL_URL"]; !ok || strings.TrimSpace(v) == "" {
			port := listenPort(s.cfg.BindAddr)
			if port == "" {
				port = "8000"
			}
			envMap["RENEO_PANEL_URL"] = "http://host.docker.internal:" + port
		}
		userSession := strings.TrimSpace(actor.Username)
		if userSession == "" {
			userSession = "default"
		}
		if s, ok := envMap["WAHA_SESSION"]; !ok || strings.TrimSpace(s) == "" || strings.TrimSpace(s) == "default" {
			envMap["WAHA_SESSION"] = userSession
		}
		if b, ok := envMap["WAHA_BASE_URL"]; !ok || strings.TrimSpace(b) == "" {
			envMap["WAHA_BASE_URL"] = "http://reneo-waha:3000"
		}
		if k, ok := envMap["WAHA_API_KEY"]; !ok || strings.TrimSpace(k) == "" {
			if s.notify != nil {
				_ = s.notify.EnableWaha()
				_, wahaKey, _, _, err := s.notify.WahaProxyTarget()
				if err == nil && wahaKey != "" {
					envMap["WAHA_API_KEY"] = wahaKey
				}
			}
		} else if s.notify != nil {
			_ = s.notify.EnableWaha()
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

	deployNetwork := ""
	if spec.ID == "reneo-crm" {
		deployNetwork = "reneo-internal"
		_ = docker.EnsureContainerOnNetwork(deployNetwork, "reneo-waha")
	}

	_, deployErr := docker.DeployFromImage(owner, docker.DeployImageRequest{
		Name:  containerProject,
		Image: imageRef,
		Ports: []docker.PortBinding{{
			HostPort:      strconv.Itoa(hostPort),
			ContainerPort: strconv.Itoa(spec.ContainerPort),
			Protocol:      "tcp",
		}},
		Env:     envVars,
		Volumes: volumes,
		Network: deployNetwork,
	})
	if deployErr != nil {
		_ = s.database.DeleteInstalledApp(created.ID)
		s.writeError(w, http.StatusUnprocessableEntity, deployErr)
		return
	}

	ensureAppVolumePermissions(owner, containerProject)
	waitForAppHTTPReady([]string{net.JoinHostPort("127.0.0.1", strconv.Itoa(hostPort))}, 2500*time.Millisecond)

	s.auditSensitiveAction(r, actor, "appcatalog.install", "ok", map[string]any{"catalogId": spec.ID, "image": imageRef, "name": name, "port": hostPort})
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

	slugCandidate := strings.TrimSpace(req.Slug)
	if slugCandidate == "" {
		slugCandidate = name
	}
	slug := s.uniqueAppSlug(actor.ID, slugCandidate)

	created, err := s.database.CreateInstalledApp(&database.InstalledApp{
		UserID:        actor.ID,
		Slug:          slug,
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
		OpenPath:      normalizeOpenPath(req.OpenPath, slug),
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

	slugCandidate := strings.TrimSpace(req.Slug)
	if slugCandidate == "" {
		slugCandidate = name
	}
	slug := s.uniqueAppSlug(actor.ID, slugCandidate)

	created, err := s.database.CreateInstalledApp(&database.InstalledApp{
		UserID:    actor.ID,
		Slug:      slug,
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
		Slug      *string `json:"slug"`
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
	if body.Slug != nil {
		candidate := sanitizeAppSlug(*body.Slug)
		if candidate == "" {
			candidate = sanitizeAppSlug(app.Name)
		}
		if candidate != "" && candidate != app.Slug {
			if existing, _ := s.database.GetInstalledAppBySlug(actor.ID, candidate); existing != nil && existing.ID != app.ID {
				s.writeJSON(w, http.StatusConflict, jsonResponse{"error": "path slug aplikasi ini sudah digunakan"})
				return
			}
			patch["slug"] = candidate
		}
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
		activeSlug := app.Slug
		if s, ok := patch["slug"].(string); ok && s != "" {
			activeSlug = s
		}
		patch["openPath"] = normalizeOpenPath(*body.OpenPath, activeSlug, app.CatalogID)
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
	actionName := strings.ToLower(strings.TrimSpace(body.Action))
	if (actionName == "start" || actionName == "restart") && app.CatalogID != "" && s.database != nil && s.database.IsConnected() {
		if lic, licErr := s.database.GetAppLicense(app.UserID, app.CatalogID); licErr == nil && lic != nil && strings.EqualFold(lic.Status, "SUSPENDED") {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "Lisensi aplikasi ini sedang disuspend. Aktifkan kembali lisensi sebelum menjalankan aplikasi."})
			return
		}
	}
	matched := matchContainerForApp(*app, containers, s.ownerScopeFor(actor))
	if matched == nil && (actionName == "start" || actionName == "restart") {
		_, matched = s.healAndResolveAppTargets(actor, app)
	}
	if matched == nil {
		s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "container aplikasi tidak ditemukan"})
		return
	}

	if owner, ownerErr := s.resolveDockerOwnerContext(actor, app.UserID); ownerErr == nil {
		ensureAppVolumePermissions(owner, app.ContainerName)
	}

	switch actionName {
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
	if (actionName == "start" || actionName == "restart") && app.HostPort > 0 {
		waitForAppHTTPReady([]string{net.JoinHostPort("127.0.0.1", strconv.Itoa(app.HostPort))}, 2000*time.Millisecond)
	}

	s.auditSensitiveAction(r, actor, "appcatalog.action", "ok", map[string]any{"appId": app.ID, "action": body.Action})
	nextContainers, _ := docker.ListContainers()
	view := s.buildInstalledAppView(*app, nextContainers, s.ownerScopeFor(actor))
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "app": view})
}

var composeImageLineRe = regexp.MustCompile(`(?m)^([ \t]*image:[ \t]*)(?:["'][^"'\r\n]+["']|[^\s#\r\n]+)([ \t]*(?:#.*)?)$`)

func replaceComposeImageLine(composeYAML, newImage string) (string, bool) {
	replaced := false
	updated := composeImageLineRe.ReplaceAllStringFunc(composeYAML, func(line string) string {
		if replaced {
			return line
		}
		sub := composeImageLineRe.FindStringSubmatch(line)
		if len(sub) != 3 {
			return line
		}
		replaced = true
		return sub[1] + `"` + newImage + `"` + sub[2]
	})
	return updated, replaced
}

func filterNonDefaultEnvVars(env []docker.EnvVar) []docker.EnvVar {
	out := make([]docker.EnvVar, 0, len(env))
	for _, item := range env {
		switch item.Key {
		case "PATH", "HOME", "TERM", "HOSTNAME":
			continue
		}
		out = append(out, item)
	}
	return out
}

func (s *Server) handleAppCatalogUpgrade(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	actor, app, code, err := s.loadOwnedInstalledApp(r)
	if err != nil {
		s.writeError(w, code, err)
		return
	}
	if app.Kind != "docker" && app.Kind != "existing-container" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "pembaruan container hanya tersedia untuk aplikasi Docker"})
		return
	}

	var body struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "invalid JSON payload"})
		return
	}

	owner, err := s.resolveDockerOwnerContext(actor, app.UserID)
	if err != nil {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": err.Error()})
		return
	}
	if !auth.IsSuperAdmin(actor.Role) && owner.DiskQuotaMB > 0 && s.accountDiskUsed(actor) >= uint64(owner.DiskQuotaMB)<<20 {
		s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "kuota penyimpanan disk paket Anda sudah penuh"})
		return
	}

	baseImage := strings.TrimSpace(app.Image)
	if spec, ok := s.findCatalogAppByID(app.CatalogID); ok && strings.TrimSpace(spec.Image) != "" {
		baseImage = strings.TrimSpace(spec.Image)
	}
	targetImage := baseImage
	if strings.TrimSpace(body.Version) != "" {
		resolved, verErr := resolveCatalogImage(baseImage, body.Version)
		if verErr != nil {
			s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": verErr.Error()})
			return
		}
		targetImage = resolved
	}
	if targetImage == "" {
		s.writeJSON(w, http.StatusBadRequest, jsonResponse{"error": "nama image aplikasi tidak ditemukan"})
		return
	}

	if err := docker.PullImage(targetImage, nil); err != nil {
		s.writeError(w, http.StatusBadGateway, err)
		return
	}

	composePath := filepath.Join(owner.DockerRootDir, app.ContainerName, "compose.yml")
	ensureAppVolumePermissions(owner, app.ContainerName)
	existingContainers, _ := docker.ListContainers()
	if matched := matchContainerForApp(*app, existingContainers, s.ownerScopeFor(actor)); matched != nil {
		_ = docker.DeleteContainer(matched.ID, false, false)
	}
	if app.ContainerName != "" {
		_ = docker.DeleteContainer(app.ContainerName, false, false)
		_ = docker.DeleteContainer(app.ContainerName+"-"+app.ContainerName, false, false)
	}
	if rawCompose, readErr := os.ReadFile(composePath); readErr == nil && len(rawCompose) > 0 {
		sanitized, _ := sanitizeExistingAppCompose(string(rawCompose), app.ContainerName, app.CatalogID)
		updatedCompose, ok := replaceComposeImageLine(sanitized, targetImage)
		if !ok {
			s.writeJSON(w, http.StatusUnprocessableEntity, jsonResponse{"error": "gagal memperbarui baris image di compose.yml aplikasi"})
			return
		}
		if _, deployErr := docker.DeployFromCompose(owner, docker.DeployComposeRequest{
			Name:        app.ContainerName,
			ComposeYAML: updatedCompose,
		}); deployErr != nil {
			s.writeError(w, http.StatusUnprocessableEntity, deployErr)
			return
		}
	} else {
		containers, listErr := docker.ListContainers()
		if listErr != nil {
			s.writeError(w, http.StatusBadGateway, listErr)
			return
		}
		matched := matchContainerForApp(*app, containers, s.ownerScopeFor(actor))
		if matched == nil {
			s.writeJSON(w, http.StatusNotFound, jsonResponse{"error": "container aplikasi dan compose.yml tidak ditemukan"})
			return
		}
		cfg, inspErr := docker.InspectContainerConfig(matched.ID)
		if inspErr != nil {
			s.writeError(w, http.StatusBadGateway, inspErr)
			return
		}
		projectName := strings.TrimSpace(app.ContainerName)
		if projectName == "" {
			projectName = cfg.Name
		}
		if delErr := docker.DeleteContainer(matched.ID, false, false); delErr != nil {
			s.writeError(w, http.StatusBadGateway, delErr)
			return
		}
		if _, deployErr := docker.DeployFromImage(owner, docker.DeployImageRequest{
			Name:    projectName,
			Image:   targetImage,
			Network: cfg.Network,
			Ports:   cfg.Ports,
			Env:     filterNonDefaultEnvVars(cfg.Env),
			Volumes: cfg.Volumes,
		}); deployErr != nil {
			s.writeError(w, http.StatusUnprocessableEntity, deployErr)
			return
		}
	}

	ensureAppVolumePermissions(owner, app.ContainerName)
	if app.HostPort > 0 {
		waitForAppHTTPReady([]string{net.JoinHostPort("127.0.0.1", strconv.Itoa(app.HostPort))}, 2500*time.Millisecond)
	}

	updatedApp := app
	if targetImage != app.Image {
		if saved, saveErr := s.database.UpdateInstalledApp(app.ID, map[string]any{"image": targetImage}); saveErr == nil && saved != nil {
			updatedApp = saved
		}
	}

	s.auditSensitiveAction(r, actor, "appcatalog.upgrade", "ok", map[string]any{
		"appId":     app.ID,
		"name":      app.Name,
		"prevImage": app.Image,
		"nextImage": targetImage,
	})
	nextContainers, _ := docker.ListContainers()
	view := s.buildInstalledAppView(*updatedApp, nextContainers, s.ownerScopeFor(actor))
	s.writeJSON(w, http.StatusOK, jsonResponse{"ok": true, "app": view})
}

func (s *Server) handleAppCatalogUninstall(w http.ResponseWriter, r *http.Request) {
	actor, app, code, err := s.loadOwnedInstalledApp(r)
	if err != nil {
		s.writeError(w, code, err)
		return
	}

	removeContainerParam := r.URL.Query().Get("removeContainer")
	removeContainer := removeContainerParam != "false"
	removeVolumes := r.URL.Query().Get("removeVolumes") == "true"
	removeImage := r.URL.Query().Get("removeImage") == "true"

	var matchedID string
	var matchedImage string

	if app.Kind == "docker" || app.Kind == "existing-container" {
		if containers, listErr := docker.ListContainers(); listErr == nil {
			if matched := matchContainerForApp(*app, containers, s.ownerScopeFor(actor)); matched != nil {
				matchedID = matched.ID
				matchedImage = matched.Image
				if removeContainer {
					if !auth.HasCapability(actor.Role, auth.CapabilityDockerLifecycle) {
						s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "tidak memiliki izin menghapus container"})
						return
					}
					if docker.ManagedKind(*matched) == "" {
						if delErr := docker.DeleteContainer(matched.ID, removeVolumes, false); delErr != nil {
							s.writeError(w, http.StatusBadGateway, delErr)
							return
						}
					}
				}
			}
		}
	}

	imageDeleted := false
	imageInUse := false
	imageSkippedReason := ""

	targetImage := strings.TrimSpace(matchedImage)
	if targetImage == "" {
		targetImage = strings.TrimSpace(app.Image)
	}

	if removeImage && targetImage != "" {
		if !auth.HasCapability(actor.Role, auth.CapabilityDockerLifecycle) {
			s.writeJSON(w, http.StatusForbidden, jsonResponse{"error": "tidak memiliki izin menghapus image docker"})
			return
		}
		excludeID := ""
		if removeContainer {
			excludeID = matchedID
		}
		inUse, chkErr := docker.IsImageInUse(targetImage, excludeID)
		if chkErr == nil && inUse {
			imageInUse = true
			imageSkippedReason = "Image masih digunakan oleh container lain di sistem"
		} else {
			if delImgErr := docker.RemoveImage(targetImage); delImgErr != nil {
				imageSkippedReason = delImgErr.Error()
			} else {
				imageDeleted = true
			}
		}
	}

	if err := s.database.DeleteInstalledApp(app.ID); err != nil {
		s.writeError(w, http.StatusInternalServerError, err)
		return
	}
	s.auditSensitiveAction(r, actor, "appcatalog.uninstall", "ok", map[string]any{
		"appId":           app.ID,
		"name":            app.Name,
		"removeContainer": removeContainer,
		"removeImage":     removeImage,
		"imageDeleted":    imageDeleted,
		"imageInUse":      imageInUse,
	})
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":                 true,
		"imageDeleted":       imageDeleted,
		"imageInUse":         imageInUse,
		"imageSkippedReason": imageSkippedReason,
		"targetImage":        targetImage,
	})
}

func appGatewaySplitPath(p string) (slug, rest string, hasSlash bool) {
	trimmed := strings.TrimPrefix(p, "/app/")
	if !strings.HasPrefix(p, "/app/") {
		trimmed = strings.TrimPrefix(p, "/app")
	}
	idx := strings.IndexByte(trimmed, '/')
	if idx == -1 {
		return trimmed, "", false
	}
	return trimmed[:idx], trimmed[idx+1:], true
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
	htmlRootAttrRe  = regexp.MustCompile(`(?i)(\b(?:href|src|action|poster|data|data-src|formaction)=)(["'])(/(?:[^/"'][^"']*)?)(["'])`)
	htmlSrcsetRe    = regexp.MustCompile(`(?i)(\bsrcset=)(["'])([^"']+)(["'])`)
	htmlInlineStyle = regexp.MustCompile(`(?is)(<style\b[^>]*>)(.*?)(</style>)`)
	cssURLRe        = regexp.MustCompile(`(?i)url\(\s*(["']?)(/(?:[^/"')][^"')]*?)?)(["']?)\s*\)`)
)

func rewriteRootPath(val, prefix string) string {
	if !strings.HasPrefix(val, "/") || strings.HasPrefix(val, "//") {
		return val
	}
	if val == prefix || strings.HasPrefix(val, prefix+"/") {
		return val
	}
	return prefix + val
}

func rewriteProxyCSS(body []byte, prefix string) []byte {
	return cssURLRe.ReplaceAllFunc(body, func(match []byte) []byte {
		sub := cssURLRe.FindSubmatch(match)
		if len(sub) != 4 {
			return match
		}
		quote := string(sub[1])
		val := string(sub[2])
		endQuote := string(sub[3])
		if quote != endQuote {
			return match
		}
		rewritten := rewriteRootPath(val, prefix)
		if rewritten == val {
			return match
		}
		return []byte("url(" + quote + rewritten + quote + ")")
	})
}

func isInsideBaseTag(buf []byte, attrOffset int) bool {
	openIdx := bytes.LastIndexByte(buf[:attrOffset], '<')
	if openIdx == -1 {
		return false
	}
	if closeIdx := bytes.LastIndexByte(buf[:attrOffset], '>'); closeIdx > openIdx {
		return false
	}
	tagStart := strings.ToLower(strings.TrimSpace(string(buf[openIdx+1 : attrOffset])))
	return strings.HasPrefix(tagStart, "base ") || strings.HasPrefix(tagStart, "base\t") || strings.HasPrefix(tagStart, "base\n") || tagStart == "base"
}

const proxyShimTemplate = `<script>(function(){var P=__PREFIX__;var ORI=location.origin;function hasP(p){return p===P||p.indexOf(P+"/")===0}function rw(u){if(typeof u!=="string"||!u)return u;var c=u.charAt(0);if(c==="#"||c==="?")return u;if(/^(?:data|blob|mailto|tel|javascript):/i.test(u))return u;if(u.indexOf("//")===0)return u;if(c==="/"){return hasP(u)?u:P+u}if(/^(?:https?|wss?):\/\//i.test(u)){try{var parsed=new URL(u);if(parsed.host===location.host&&!hasP(parsed.pathname)){parsed.pathname=P+(parsed.pathname.charAt(0)==="/"?parsed.pathname:"/"+parsed.pathname);return parsed.href}}catch(e){}return u}try{var base=document.baseURI||location.href;var rel=new URL(u,base);if(rel.origin===ORI&&!hasP(rel.pathname)){rel.pathname=P+(rel.pathname.charAt(0)==="/"?rel.pathname:"/"+rel.pathname)}return rel.href}catch(e){return u}}if(window.history&&window.history.pushState){var oPush=window.history.pushState;var oRep=window.history.replaceState;window.history.pushState=function(s,t,u){if(typeof u==="string")u=rw(u);return oPush.call(this,s,t,u)};window.history.replaceState=function(s,t,u){if(typeof u==="string")u=rw(u);return oRep.call(this,s,t,u)}}if(window.fetch){var oFetch=window.fetch;window.fetch=function(i,o){if(typeof i==="string"){i=rw(i)}else if(i&&typeof i.url==="string"){var nu=rw(i.url);if(nu!==i.url){try{i=new Request(nu,i)}catch(e){}}}return oFetch.call(this,i,o)}}if(window.XMLHttpRequest){var oOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(typeof u==="string"){arguments[1]=rw(u)}return oOpen.apply(this,arguments)}}if(window.WebSocket){var OWS=window.WebSocket;window.WebSocket=function(u,pr){if(typeof u==="string")u=rw(u);return arguments.length>1?new OWS(u,pr):new OWS(u)};window.WebSocket.prototype=OWS.prototype;window.WebSocket.CONNECTING=OWS.CONNECTING;window.WebSocket.OPEN=OWS.OPEN;window.WebSocket.CLOSING=OWS.CLOSING;window.WebSocket.CLOSED=OWS.CLOSED}if(window.EventSource){var OES=window.EventSource;window.EventSource=function(u,cfg){if(typeof u==="string")u=rw(u);return cfg?new OES(u,cfg):new OES(u)};window.EventSource.prototype=OES.prototype}if(navigator.sendBeacon){var oSB=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){return oSB(typeof u==="string"?rw(u):u,d)}}if(window.Worker){var OWK=window.Worker;window.Worker=function(u,opts){if(typeof u==="string")u=rw(u);return opts?new OWK(u,opts):new OWK(u)};window.Worker.prototype=OWK.prototype}if(navigator.serviceWorker&&navigator.serviceWorker.register){var oSWR=navigator.serviceWorker.register.bind(navigator.serviceWorker);navigator.serviceWorker.register=function(u,opts){try{if(window.self!==window.top){return Promise.reject(new DOMException("ServiceWorker disabled in container frame","SecurityError")).catch(function(){})}if(typeof u==="string")u=rw(u);opts=opts||{};if(typeof opts.scope==="string")opts.scope=rw(opts.scope);return oSWR(u,opts)}catch(e){return Promise.reject(e)}}}var oSA=Element.prototype.setAttribute;var ATTRS={src:1,href:1,data:1,action:1,poster:1,"data-src":1,formaction:1};var TAGS={IMG:1,SCRIPT:1,LINK:1,OBJECT:1,IFRAME:1,SOURCE:1,VIDEO:1,AUDIO:1,FORM:1};Element.prototype.setAttribute=function(k,v){if(typeof k==="string"&&typeof v==="string"&&ATTRS[k.toLowerCase()]&&TAGS[this.tagName]){v=rw(v)}return oSA.call(this,k,v)};function hookProp(Proto,prop){if(!Proto)return;var desc=Object.getOwnPropertyDescriptor(Proto,prop);if(desc&&desc.set&&desc.configurable){Object.defineProperty(Proto,prop,{get:desc.get,set:function(v){return desc.set.call(this,typeof v==="string"?rw(v):v)},enumerable:desc.enumerable,configurable:true})}}hookProp(HTMLImageElement.prototype,"src");hookProp(HTMLScriptElement.prototype,"src");hookProp(HTMLLinkElement.prototype,"href");hookProp(HTMLObjectElement.prototype,"data");document.addEventListener("click",function(e){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a||a.target||a.hasAttribute("download"))return;var href=a.getAttribute("href");if(!href||href.charAt(0)==="#"||href.indexOf("javascript:")===0)return;try{var dest=new URL(href,document.baseURI||location.href);if(dest.origin===ORI&&!hasP(dest.pathname)){e.preventDefault();location.href=ORI+P+(dest.pathname.charAt(0)==="/"?dest.pathname:"/"+dest.pathname)+dest.search+dest.hash}}catch(err){}},false)})();</script>`

func rewriteProxyHTML(body []byte, prefix string) []byte {
	matches := htmlRootAttrRe.FindAllSubmatchIndex(body, -1)
	var outBuf bytes.Buffer
	last := 0
	for _, m := range matches {
		// m[0]:m[1] full match, m[2]:m[3] attr=, m[4]:m[5] q1, m[6]:m[7] val, m[8]:m[9] q2
		outBuf.Write(body[last:m[0]])
		if strings.EqualFold(string(body[m[2]:m[3]]), "href=") && isInsideBaseTag(body, m[0]) {
			outBuf.Write(body[m[0]:m[1]])
		} else {
			val := string(body[m[6]:m[7]])
			rewritten := rewriteRootPath(val, prefix)
			outBuf.Write(body[m[2]:m[3]])
			outBuf.Write(body[m[4]:m[5]])
			outBuf.WriteString(rewritten)
			outBuf.Write(body[m[8]:m[9]])
		}
		last = m[1]
	}
	outBuf.Write(body[last:])
	rewritten := outBuf.Bytes()

	// Rewrite srcset="/img-1x.png 1x, /img-2x.png 2x"
	rewritten = htmlSrcsetRe.ReplaceAllFunc(rewritten, func(match []byte) []byte {
		sub := htmlSrcsetRe.FindSubmatch(match)
		if len(sub) != 5 {
			return match
		}
		parts := strings.Split(string(sub[3]), ",")
		for i, part := range parts {
			trimmed := strings.TrimSpace(part)
			if trimmed == "" {
				continue
			}
			fields := strings.Fields(trimmed)
			if len(fields) > 0 {
				fields[0] = rewriteRootPath(fields[0], prefix)
				parts[i] = strings.Join(fields, " ")
			}
		}
		return []byte(string(sub[1]) + string(sub[2]) + strings.Join(parts, ", ") + string(sub[4]))
	})

	// Rewrite root-relative url(/...) inside inline <style> blocks
	rewritten = htmlInlineStyle.ReplaceAllFunc(rewritten, func(match []byte) []byte {
		sub := htmlInlineStyle.FindSubmatch(match)
		if len(sub) != 4 {
			return match
		}
		var b bytes.Buffer
		b.Write(sub[1])
		b.Write(rewriteProxyCSS(sub[2], prefix))
		b.Write(sub[3])
		return b.Bytes()
	})

	shim := strings.ReplaceAll(proxyShimTemplate, "__PREFIX__", strconv.Quote(prefix))

	if idx := bytes.Index(bytes.ToLower(rewritten), []byte("<head>")); idx != -1 {
		pos := idx + len("<head>")
		var out bytes.Buffer
		out.Write(rewritten[:pos])
		out.WriteString(shim)
		out.Write(rewritten[pos:])
		return out.Bytes()
	}
	if idx := bytes.Index(bytes.ToLower(rewritten), []byte("<head ")); idx != -1 {
		if gt := bytes.IndexByte(rewritten[idx:], '>'); gt != -1 {
			pos := idx + gt + 1
			var out bytes.Buffer
			out.Write(rewritten[:pos])
			out.WriteString(shim)
			out.Write(rewritten[pos:])
			return out.Bytes()
		}
	}
	return append([]byte(shim), rewritten...)
}

func rewriteProxyLocation(loc string, targetURL *url.URL, prefix string, keepPrefix bool) string {
	trimmed := strings.TrimSpace(loc)
	if trimmed == "" {
		return loc
	}
	cleanPrefix := strings.TrimSuffix(prefix, "/")
	// Strip upstream internal loopback host (e.g. http://127.0.0.1:18001/setup -> /setup) so redirects stay on the panel origin.
	if strings.HasPrefix(strings.ToLower(trimmed), "http://") || strings.HasPrefix(strings.ToLower(trimmed), "https://") {
		if parsed, err := url.Parse(trimmed); err == nil && targetURL != nil {
			hostMatch := strings.EqualFold(parsed.Host, targetURL.Host)
			if !hostMatch && targetURL.Port() != "" {
				hostMatch = strings.EqualFold(parsed.Host, net.JoinHostPort("localhost", targetURL.Port())) ||
					strings.EqualFold(parsed.Host, net.JoinHostPort("127.0.0.1", targetURL.Port()))
			}
			if hostMatch {
				rel := parsed.Path
				if rel == "" {
					rel = "/"
				}
				if parsed.RawQuery != "" {
					rel += "?" + parsed.RawQuery
				}
				if parsed.Fragment != "" {
					rel += "#" + parsed.Fragment
				}
				trimmed = rel
			}
		}
	}

	// Handle relative redirects (e.g. "grafana/" or "./login")
	if !strings.HasPrefix(trimmed, "/") && !strings.Contains(trimmed, "://") {
		cleanRel := strings.TrimPrefix(trimmed, "./")
		cleanSlug := strings.TrimPrefix(cleanPrefix, "/app/")
		if strings.TrimSuffix(cleanRel, "/") == cleanSlug || strings.HasSuffix(cleanPrefix, "/"+strings.TrimSuffix(cleanRel, "/")) {
			return cleanPrefix + "/"
		}
		return cleanPrefix + "/" + cleanRel
	}

	// For keepPrefix apps accessed via /app/<slug>, rewrite internal /api/v1/app-catalog/proxy/<id> redirects to /app/<slug>
	if keepPrefix && cleanPrefix != "" {
		if idx := strings.Index(trimmed, appCatalogProxyPrefix); idx != -1 {
			rest := trimmed[idx+len(appCatalogProxyPrefix):]
			if slash := strings.Index(rest, "/"); slash != -1 {
				trimmed = cleanPrefix + rest[slash:]
			} else {
				trimmed = cleanPrefix + "/"
			}
		}
		// Strip any nested repetition (e.g. /app/grafana/app/grafana)
		if strings.HasPrefix(cleanPrefix, "/app/") {
			dup := cleanPrefix + cleanPrefix
			for strings.Contains(trimmed, dup) {
				trimmed = strings.ReplaceAll(trimmed, dup, cleanPrefix)
			}
			if strings.HasPrefix(trimmed, cleanPrefix+"/app/") {
				trimmed = strings.ReplaceAll(trimmed, cleanPrefix+"/app/", "/app/")
			}
		}
		return trimmed
	}

	if !keepPrefix {
		return rewriteRootPath(trimmed, cleanPrefix)
	}
	return trimmed
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

var zeroMemoryDeployRe = regexp.MustCompile(`(?m)\n[ \t]*deploy:\r?\n[ \t]*resources:\r?\n[ \t]*limits:\r?\n(?:[ \t]*cpus:[ \t]*"[^"]*"\r?\n)?[ \t]*memory:[ \t]*"0M"`)

func ensureAppVolumePermissions(owner docker.OwnerContext, containerName string) bool {
	if strings.TrimSpace(owner.DockerRootDir) == "" || strings.TrimSpace(containerName) == "" {
		return false
	}
	projectDir := filepath.Join(owner.DockerRootDir, strings.TrimSpace(containerName))
	entries, err := os.ReadDir(projectDir)
	if err != nil {
		return false
	}
	changed := false
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dirPath := filepath.Join(projectDir, entry.Name())
		if info, statErr := os.Stat(dirPath); statErr == nil && info.Mode().Perm() != 0777 {
			if chmodErr := os.Chmod(dirPath, 0777); chmodErr == nil {
				changed = true
			}
		}
	}
	return changed
}

func sanitizeExistingAppCompose(composeYAML, projectName, catalogID string) (string, bool) {
	updated := composeYAML
	changed := false

	if projectName != "" {
		doubled := projectName + "-" + projectName
		if strings.Contains(updated, doubled) {
			updated = strings.ReplaceAll(updated, doubled, projectName)
			changed = true
		}
	}

	if zeroMemoryDeployRe.MatchString(updated) {
		updated = zeroMemoryDeployRe.ReplaceAllString(updated, "")
		changed = true
	}

	if catalogID == "filebrowser" && !strings.Contains(updated, "FB_DATABASE:") {
		if strings.Contains(updated, "    environment:\n") {
			updated = strings.Replace(updated, "    environment:\n", "    environment:\n      FB_DATABASE: \"/database/filebrowser.db\"\n      FB_ROOT: \"/srv\"\n      FB_PORT: \"80\"\n      FB_ADDRESS: \"0.0.0.0\"\n", 1)
			changed = true
		}
	}

	if catalogID == "n8n" && strings.Contains(updated, "N8N_PATH:") {
		re := regexp.MustCompile(`(?m)^[ \t]*N8N_PATH:.*\r?\n`)
		updated = re.ReplaceAllString(updated, "")
		changed = true
	}

	if catalogID == "stirling-pdf" && strings.Contains(updated, "SERVER_SERVLET_CONTEXT_PATH:") {
		re := regexp.MustCompile(`(?m)^[ \t]*SERVER_SERVLET_CONTEXT_PATH:.*\r?\n`)
		updated = re.ReplaceAllString(updated, "")
		changed = true
	}

	return updated, changed
}

func waitForAppHTTPReady(hosts []string, maxWait time.Duration) (string, bool) {
	if len(hosts) == 0 {
		return "", false
	}
	client := &http.Client{
		Timeout: 450 * time.Millisecond,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	deadline := time.Now().Add(maxWait)
	for {
		for _, host := range hosts {
			if strings.TrimSpace(host) == "" {
				continue
			}
			resp, err := client.Get("http://" + host + "/")
			if err == nil {
				_ = resp.Body.Close()
				return host, true
			}
		}
		if time.Now().After(deadline) {
			break
		}
		time.Sleep(180 * time.Millisecond)
	}
	return "", false
}

func appendUniqueHost(list []string, host string) []string {
	trimmed := strings.TrimSpace(host)
	if trimmed == "" {
		return list
	}
	for _, item := range list {
		if strings.EqualFold(item, trimmed) {
			return list
		}
	}
	return append(list, trimmed)
}

func (s *Server) collectAppCandidateHosts(actor *database.User, app *database.InstalledApp) ([]string, *docker.Container) {
	var hosts []string
	if app.HostPort > 0 {
		hosts = appendUniqueHost(hosts, net.JoinHostPort("127.0.0.1", strconv.Itoa(app.HostPort)))
	}
	containers, err := docker.ListContainers()
	if err != nil {
		return hosts, nil
	}
	matched := matchContainerForApp(*app, containers, s.ownerScopeFor(actor))
	if matched == nil {
		return hosts, nil
	}
	for _, p := range matched.Ports {
		if p.PublicPort > 0 {
			hosts = appendUniqueHost(hosts, net.JoinHostPort("127.0.0.1", strconv.Itoa(p.PublicPort)))
		}
	}
	cPort := app.ContainerPort
	if cPort <= 0 {
		for _, p := range matched.Ports {
			if p.PrivatePort > 0 {
				cPort = p.PrivatePort
				break
			}
		}
	}
	if cPort > 0 {
		for _, ip := range matched.IPAddresses {
			if strings.TrimSpace(ip) != "" {
				hosts = appendUniqueHost(hosts, net.JoinHostPort(strings.TrimSpace(ip), strconv.Itoa(cPort)))
			}
		}
	}
	return hosts, matched
}

func (s *Server) healAndResolveAppTargets(actor *database.User, app *database.InstalledApp) ([]string, *docker.Container) {
	if app.Kind != "docker" && app.Kind != "existing-container" {
		return nil, nil
	}
	permsFixed := false
	composeRepaired := false
	if owner, err := s.resolveDockerOwnerContext(actor, app.UserID); err == nil {
		if app.CatalogID == "filebrowser" && app.ContainerName != "" {
			cfgDir := filepath.Join(owner.DockerRootDir, app.ContainerName, "config")
			_ = os.MkdirAll(cfgDir, 0777)
			_ = os.Chmod(cfgDir, 0777)
		}
		permsFixed = ensureAppVolumePermissions(owner, app.ContainerName)
		if app.ContainerName != "" {
			composePath := filepath.Join(owner.DockerRootDir, app.ContainerName, "compose.yml")
			if rawCompose, readErr := os.ReadFile(composePath); readErr == nil && len(rawCompose) > 0 {
				if sanitized, changed := sanitizeExistingAppCompose(string(rawCompose), app.ContainerName, app.CatalogID); changed {
					_ = docker.DeleteContainer(app.ContainerName+"-"+app.ContainerName, false, false)
					if _, deployErr := docker.DeployFromCompose(owner, docker.DeployComposeRequest{
						Name:        app.ContainerName,
						ComposeYAML: sanitized,
					}); deployErr == nil {
						composeRepaired = true
						ensureAppVolumePermissions(owner, app.ContainerName)
					}
				}
			}
		}
	}

	hosts, matched := s.collectAppCandidateHosts(actor, app)
	if matched == nil && !composeRepaired {
		if owner, err := s.resolveDockerOwnerContext(actor, app.UserID); err == nil && app.ContainerName != "" {
			composePath := filepath.Join(owner.DockerRootDir, app.ContainerName, "compose.yml")
			if rawCompose, readErr := os.ReadFile(composePath); readErr == nil && len(rawCompose) > 0 {
				sanitized, _ := sanitizeExistingAppCompose(string(rawCompose), app.ContainerName, app.CatalogID)
				if _, deployErr := docker.DeployFromCompose(owner, docker.DeployComposeRequest{
					Name:        app.ContainerName,
					ComposeYAML: sanitized,
				}); deployErr == nil {
					ensureAppVolumePermissions(owner, app.ContainerName)
					hosts, matched = s.collectAppCandidateHosts(actor, app)
				}
			}
		}
	} else if matched != nil && !composeRepaired {
		state := strings.ToLower(strings.TrimSpace(matched.State))
		if state == "exited" || state == "created" || state == "dead" {
			_ = docker.StartContainer(matched.ID)
			hosts, matched = s.collectAppCandidateHosts(actor, app)
		} else if permsFixed && (state == "restarting" || matched.RestartCount > 0) {
			_ = docker.RestartContainer(matched.ID)
			hosts, matched = s.collectAppCandidateHosts(actor, app)
		}
	}
	return hosts, matched
}

type appCatalogRoundTripper struct {
	base       http.RoundTripper
	server     *Server
	actor      *database.User
	app        *database.InstalledApp
	targetURL  *url.URL
	keepPrefix bool
	prefix     string
}

func (rt *appCatalogRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	base := rt.base
	if base == nil {
		base = http.DefaultTransport
	}
	resp, err := base.RoundTrip(req)
	if err == nil || rt.app.Kind == "custom-url" {
		return resp, err
	}
	if strings.EqualFold(req.Header.Get("Upgrade"), "websocket") {
		return nil, err
	}
	method := req.Method
	if method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions {
		return nil, err
	}

	hosts, _ := rt.server.healAndResolveAppTargets(rt.actor, rt.app)
	if len(hosts) == 0 {
		return nil, err
	}

	deadline := time.Now().Add(3200 * time.Millisecond)
	var lastErr error = err
	for {
		for _, host := range hosts {
			if req.Context().Err() != nil {
				return nil, lastErr
			}
			clone := req.Clone(req.Context())
			clone.URL.Host = host
			clone.Host = host
			if clone.Header.Get("Origin") != "" {
				clone.Header.Set("Origin", clone.URL.Scheme+"://"+host)
			}
			if ref := clone.Header.Get("Referer"); ref != "" {
				if refURL, parseErr := url.Parse(ref); parseErr == nil {
					refURL.Host = host
					clone.Header.Set("Referer", refURL.String())
				}
			}
			tryResp, tryErr := base.RoundTrip(clone)
			if tryErr == nil {
				rt.targetURL.Host = host
				return tryResp, nil
			}
			lastErr = tryErr
		}
		if time.Now().After(deadline) || req.Context().Err() != nil {
			break
		}
		time.Sleep(280 * time.Millisecond)
	}
	return nil, lastErr
}

func (s *Server) serveAppProxy(w http.ResponseWriter, r *http.Request, u *database.User, app *database.InstalledApp, prefix, rest string) {
	// Intercept Cloudflare RUM / Web Analytics to avoid 404 upstream spam
	if strings.Contains(r.URL.Path, "cdn-cgi/rum") || strings.HasSuffix(rest, "cdn-cgi/rum") {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Lightweight readiness probe from the waiting screen so iframe reloads only once the container answers.
	if r.Header.Get("X-Reneo-Probe") == "1" {
		w.Header().Set("Cache-Control", "no-store")
		if app.Kind == "custom-url" {
			w.Header().Set("X-Reneo-Proxy-State", "ready")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		hosts, _ := s.collectAppCandidateHosts(u, app)
		if _, ok := waitForAppHTTPReady(hosts, 500*time.Millisecond); ok {
			w.Header().Set("X-Reneo-Proxy-State", "ready")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		hosts, _ = s.healAndResolveAppTargets(u, app)
		if _, ok := waitForAppHTTPReady(hosts, 700*time.Millisecond); ok {
			w.Header().Set("X-Reneo-Proxy-State", "ready")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("X-Reneo-Proxy-State", "waiting")
		w.WriteHeader(http.StatusNoContent)
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
	keepPrefix := effectiveKeepPrefix(*app, meta)
	cleanPrefix := strings.TrimSuffix(prefix, "/")
	internalProxyPrefix := fmt.Sprintf("%s%d", appCatalogProxyPrefix, app.ID)

	proxy := &httputil.ReverseProxy{
		Transport: &appCatalogRoundTripper{
			base:       http.DefaultTransport,
			server:     s,
			actor:      u,
			app:        app,
			targetURL:  targetURL,
			keepPrefix: keepPrefix,
			prefix:     cleanPrefix,
		},
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
			if app.Kind != "custom-url" {
				// Align Origin/Referer with the container target so CSRF & Socket.IO checks pass cleanly inside Reneo's window.
				upstreamOrigin := targetURL.Scheme + "://" + targetURL.Host
				if pr.In.Header.Get("Origin") != "" {
					pr.Out.Header.Set("Origin", upstreamOrigin)
				}
				if ref := pr.In.Header.Get("Referer"); ref != "" {
					if refURL, parseErr := url.Parse(ref); parseErr == nil {
						refURL.Scheme = targetURL.Scheme
						refURL.Host = targetURL.Host
						if !keepPrefix && (refURL.Path == cleanPrefix || strings.HasPrefix(refURL.Path, cleanPrefix+"/")) {
							refURL.Path = strings.TrimPrefix(refURL.Path, cleanPrefix)
							if refURL.Path == "" {
								refURL.Path = "/"
							}
						}
						pr.Out.Header.Set("Referer", refURL.String())
					}
				}
			}
			if keepPrefix {
				if cleanPrefix != internalProxyPrefix && strings.HasPrefix(pr.In.URL.Path, cleanPrefix) {
					sub := strings.TrimPrefix(pr.In.URL.Path, cleanPrefix)
					if sub == "" {
						sub = "/"
					}
					pr.Out.URL.Path = internalProxyPrefix + sub
					pr.Out.URL.RawPath = ""
				} else {
					cleanedPath := pr.In.URL.Path
					if app.Slug != "" && strings.Contains(cleanedPath, "/app/"+app.Slug) && strings.Contains(cleanedPath, internalProxyPrefix) {
						cleanedPath = strings.ReplaceAll(cleanedPath, "/app/"+app.Slug, "")
					}
					pr.Out.URL.Path = cleanedPath
					pr.Out.URL.RawPath = ""
				}
			} else {
				basePath := strings.TrimSuffix(targetURL.Path, "/")
				pr.Out.URL.Path = basePath + "/" + rest
				pr.Out.URL.RawPath = ""
				// Request uncompressed text so HTML/CSS sub-path rewrites and SPA shims always apply cleanly.
				pr.Out.Header.Del("Accept-Encoding")
				if strings.Contains(pr.In.Header.Get("Accept"), "text/html") || strings.Contains(pr.In.Header.Get("Accept"), "text/css") || strings.HasSuffix(pr.Out.URL.Path, ".html") || strings.HasSuffix(pr.Out.URL.Path, ".css") {
					pr.Out.Header.Del("If-None-Match")
					pr.Out.Header.Del("If-Modified-Since")
				}
			}
			pr.SetXForwarded()
		},
		ModifyResponse: func(resp *http.Response) error {
			if resp.StatusCode == http.StatusSwitchingProtocols {
				return nil
			}
			resp.Header.Del("X-Frame-Options")
			resp.Header.Del("Cross-Origin-Opener-Policy")
			resp.Header.Del("Cross-Origin-Embedder-Policy")
			resp.Header.Del("Content-Security-Policy")
			resp.Header.Del("Content-Security-Policy-Report-Only")

			if loc := resp.Header.Get("Location"); loc != "" {
				rewritten := rewriteProxyLocation(loc, targetURL, cleanPrefix, keepPrefix)
				if rewritten == r.URL.RequestURI() || rewritten == r.URL.Path {
					rewritten = cleanPrefix + "/"
				}
				resp.Header.Set("Location", rewritten)
			}

			if keepPrefix && cleanPrefix != internalProxyPrefix {
				if cookies := resp.Header.Values("Set-Cookie"); len(cookies) > 0 {
					resp.Header.Del("Set-Cookie")
					for _, c := range cookies {
						resp.Header.Add("Set-Cookie", strings.ReplaceAll(c, internalProxyPrefix, cleanPrefix))
					}
				}
				ct := strings.ToLower(resp.Header.Get("Content-Type"))
				if resp.Header.Get("Content-Encoding") == "" && resp.Body != nil {
					isHTML := strings.Contains(ct, "text/html")
					isJS := strings.Contains(ct, "javascript")
					if isHTML || isJS {
						raw, readErr := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
						_ = resp.Body.Close()
						if readErr == nil {
							updated := bytes.ReplaceAll(raw, []byte(internalProxyPrefix), []byte(cleanPrefix))
							resp.Body = io.NopCloser(bytes.NewReader(updated))
							resp.ContentLength = int64(len(updated))
							resp.Header.Set("Content-Length", strconv.Itoa(len(updated)))
						}
					}
				}
			}

			if !keepPrefix {
				if cookies := resp.Header.Values("Set-Cookie"); len(cookies) > 0 {
					resp.Header.Del("Set-Cookie")
					for _, c := range cookies {
						resp.Header.Add("Set-Cookie", rewriteCookiePath(c, cleanPrefix))
					}
				}
				ct := strings.ToLower(resp.Header.Get("Content-Type"))
				if resp.Header.Get("Content-Encoding") == "" && resp.Body != nil {
					isHTML := strings.Contains(ct, "text/html")
					isCSS := strings.Contains(ct, "text/css")
					if isHTML || isCSS {
						raw, readErr := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
						_ = resp.Body.Close()
						if readErr == nil {
							var updated []byte
							if isHTML {
								updated = rewriteProxyHTML(raw, cleanPrefix)
							} else {
								updated = rewriteProxyCSS(raw, cleanPrefix)
							}
							resp.Body = io.NopCloser(bytes.NewReader(updated))
							resp.ContentLength = int64(len(updated))
							resp.Header.Set("Content-Length", strconv.Itoa(len(updated)))
						}
					}
				}
			}
			return nil
		},
		ErrorHandler: func(rw http.ResponseWriter, req *http.Request, _ error) {
			rw.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
			rw.Header().Set("X-Reneo-Proxy-State", "waiting")
			rw.Header().Set("Content-Type", "text/html; charset=utf-8")
			if req.Method == http.MethodGet || req.Method == http.MethodHead {
				rw.WriteHeader(http.StatusOK)
			} else {
				rw.WriteHeader(http.StatusBadGateway)
			}
			portLabel := strconv.Itoa(app.HostPort)
			if app.Kind == "custom-url" {
				portLabel = app.TargetURL
			}
			diagHTML := ""
			if app.Kind != "custom-url" {
				if _, matched := s.collectAppCandidateHosts(u, app); matched != nil {
					statusLine := strings.TrimSpace(matched.Status)
					if statusLine == "" {
						statusLine = matched.State
					}
					logSnippet := ""
					if logs, logErr := docker.ReadContainerLogs(matched.ID, 8); logErr == nil && len(logs.Lines) > 0 {
						logSnippet = strings.TrimSpace(strings.Join(logs.Lines, "\n"))
					}
					if statusLine != "" || logSnippet != "" {
						diagHTML = `<div class="diag"><div class="diag-hd">Status Container: <code>` + htmlEscapeMinimal(statusLine) + `</code></div>`
						if logSnippet != "" {
							diagHTML += `<pre class="diag-pre">` + htmlEscapeMinimal(logSnippet) + `</pre>`
						}
						diagHTML += `</div>`
					}
				}
			}
			_, _ = io.WriteString(rw, `<!doctype html><html><head><meta charset="utf-8"><style>:root{color-scheme:light dark;--bg:#f8fafc;--card:#ffffff;--bd:#e2e8f0;--tx:#0f172a;--sub:#475569;--btn:#2563eb;--btx:#ffffff;--pre:#f1f5f9}@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--card:#182132;--bd:#273549;--tx:#f1f5f9;--sub:#94a3b8;--btn:#3b82f6;--btx:#ffffff;--pre:#0b1120}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--tx);font:13px/1.55 system-ui,-apple-system,sans-serif}.box{max-width:460px;width:100%;padding:20px;border-radius:12px;border:1px solid var(--bd);background:var(--card)}.ttl{margin:0 0 6px;font-size:15px;font-weight:600}.dsc{margin:0 0 14px;color:var(--sub)}.diag{margin:0 0 14px;padding:10px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--pre);font-size:12px}.diag-hd{margin-bottom:6px;color:var(--sub)}.diag-pre{margin:0;max-height:130px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:11.5px/1.45 ui-monospace,monospace;color:var(--tx)}.btn{border:0;border-radius:8px;padding:8px 14px;background:var(--btn);color:var(--btx);font:600 12.5px inherit;cursor:pointer}.btn:hover{opacity:.92}</style></head><body><div class="box"><h3 class="ttl">Aplikasi sedang memulai atau belum merespons</h3><p class="dsc">Menunggu layanan aktif di <code style="font-family:ui-monospace,monospace">`+htmlEscapeMinimal(portLabel)+`</code>. Halaman ini akan terbuka otomatis begitu layanan siap.</p>`+diagHTML+`<button class="btn" onclick="location.reload()">Muat Ulang</button></div><script>(function(){var tries=0;function poll(){if(tries>=24)return;tries++;fetch(location.href,{headers:{"X-Reneo-Probe":"1"},cache:"no-store"}).then(function(r){if(r.headers.get("X-Reneo-Proxy-State")==="ready"){location.reload();return}setTimeout(poll,2500)}).catch(function(){setTimeout(poll,3000)})}setTimeout(poll,2000)})()</script></body></html>`)
		},
	}

	proxy.ServeHTTP(w, r)
}

func (s *Server) appGatewayProxy() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slug, rest, hasSlash := appGatewaySplitPath(r.URL.Path)
		slug = strings.TrimSpace(slug)
		if slug == "" {
			http.NotFound(w, r)
			return
		}
		if !hasSlash {
			target := "/app/" + slug + "/"
			if r.URL.RawQuery != "" {
				target += "?" + r.URL.RawQuery
			}
			http.Redirect(w, r, target, http.StatusMovedPermanently)
			return
		}

		u := s.currentUserRecord(r)
		if u == nil {
			// Check if an app exists with this slug
			app, _ := s.database.GetInstalledAppBySlugAnyUser(slug)
			if app == nil {
				http.NotFound(w, r)
				return
			}
			// Unauthenticated browser navigation: redirect to login with redirect parameter
			isHTML := strings.Contains(r.Header.Get("Accept"), "text/html") || r.Header.Get("Sec-Fetch-Dest") == "document"
			if (r.Method == http.MethodGet || r.Method == http.MethodHead) && isHTML {
				targetURI := r.URL.RequestURI()
				http.Redirect(w, r, "/login?redirect="+url.QueryEscape(targetURI), http.StatusFound)
				return
			}
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if s.isDemoUser(u) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		app, err := s.database.GetInstalledAppBySlug(u.ID, slug)
		if (app == nil || err != nil) && (auth.IsSuperAdmin(u.Role) || auth.IsAdmin(u.Role)) {
			app, _ = s.database.GetInstalledAppBySlugAnyUser(slug)
		}
		if app == nil {
			http.NotFound(w, r)
			return
		}
		if app.UserID != u.ID && !s.ownerScopeFor(u).has(app.UserID) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		s.serveAppProxy(w, r, u, app, "/app/"+slug, rest)
	})
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
		if app.CatalogID != "" && s.database != nil && s.database.IsConnected() {
			if lic, licErr := s.database.GetAppLicense(app.UserID, app.CatalogID); licErr == nil && lic != nil && strings.EqualFold(lic.Status, "SUSPENDED") {
				if strings.HasPrefix(rest, "/api/") || strings.Contains(r.Header.Get("Accept"), "application/json") {
					s.writeJSON(w, http.StatusForbidden, jsonResponse{
						"error": "Lisensi aplikasi ini sedang disuspend oleh administrator.",
						"code":  "LICENSE_SUSPENDED",
					})
					return
				}
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.WriteHeader(http.StatusForbidden)
				_, _ = w.Write([]byte(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Lisensi Disuspend</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}main{max-width:440px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;text-align:center}h1{font-size:18px;margin:0 0 8px;color:#be123c}p{font-size:14px;line-height:1.6;color:#475569;margin:0}</style></head><body><main><h1>Lisensi Aplikasi Disuspend</h1><p>Lisensi untuk <strong>` + htmlEscapeMinimal(app.Name) + `</strong> sedang disuspend oleh administrator sehingga aplikasi tidak dapat digunakan. Hubungi administrator untuk mengaktifkan kembali.</p></main></body></html>`))
				return
			}
		}
		if r.URL.Path == appCatalogProxyPrefix+idStr {
			http.Redirect(w, r, appCatalogProxyPrefix+idStr+"/", http.StatusPermanentRedirect)
			return
		}

		s.serveAppProxy(w, r, u, app, appCatalogProxyPrefix+idStr, rest)
	})
}

func htmlEscapeMinimal(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&#39;")
	return r.Replace(s)
}

func (s *Server) handleAppCatalogLicense(w http.ResponseWriter, r *http.Request) {
	catalogID := r.PathValue("catalogId")
	if catalogID == "" {
		catalogID = "reneo-crm"
	}

	userID := int64(1)
	if actor := s.currentUserRecord(r); actor != nil {
		userID = actor.ID
	}

	if s.database != nil && s.database.IsConnected() {
		lic, err := s.database.GetAppLicense(userID, catalogID)
		if err == nil && lic != nil {
			isSuspended := strings.EqualFold(lic.Status, "SUSPENDED")
			isLocked := lic.IsExpired || isSuspended
			features := lic.Features
			if isLocked {
				features = json.RawMessage(`{"unlimitedBroadcast":false,"birthdayBot":false,"liveChat":false,"multiSession":false,"maxSessions":0,"maxContacts":0,"wahaSync":false}`)
			}
			s.writeJSON(w, http.StatusOK, jsonResponse{
				"ok":            true,
				"catalogId":     lic.CatalogID,
				"status":        lic.Status,
				"plan":          lic.PlanName,
				"period":        lic.Period,
				"expiresAt":     lic.ExpiresAt,
				"daysRemaining": lic.DaysLeft,
				"daysLeft":      lic.DaysLeft,
				"isExpired":     isLocked,
				"isSuspended":   isSuspended,
				"licenseKey":    lic.LicenseKey,
				"billingUrl":    "/hosting",
				"features":      features,
			})
			return
		}
	}

	now := time.Now()
	s.writeJSON(w, http.StatusOK, jsonResponse{
		"ok":            true,
		"catalogId":     catalogID,
		"status":        "UNLICENSED",
		"plan":          "Belum Diaktivasi",
		"period":        "monthly",
		"expiresAt":     now.Format(time.RFC3339),
		"daysRemaining": 0,
		"daysLeft":      0,
		"isExpired":     true,
		"licenseKey":    "",
		"billingUrl":    "/hosting",
		"features": map[string]any{
			"unlimitedBroadcast": false,
			"birthdayBot":        false,
			"liveChat":           false,
			"maxContacts":        0,
			"wahaSync":           false,
		},
	})
}
