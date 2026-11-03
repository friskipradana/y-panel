# Peta Arsitektur Backend Go (`cmd/panel-agent/` & `internal/`)

## 1. Entrypoint & Subcommand CLI (`cmd/panel-agent/`)
- **`cmd/panel-agent/main.go`**:
  - **Mode Server Default** (tanpa argumen):
    1. Memuat `config.Load()`.
    2. Menginisialisasi `httpserver.New(cfg)`.
    3. Menjalankan pemulihan otomatis di background: `EnsureDemoAccount`, `RestoreProjects`, `RecoverDatabases`, `RestoreDatabaseAccess`, `WatchDatabaseAccess`, `RestoreTunnels`, `RestorePublicProxy`.
    4. Menjalankan HTTP server di `cfg.BindAddr` (default `:8787`).
  - **Subcommand CLI**:
    - `reset-primary-password --password-stdin` (wajib root): Reset password akun superadmin pertama.
    - `migrate <up|down|status|create>` (wajib root): Menjalankan migrasi SQL via `internal/database/migrations`.
    - `seed-plans` (`cmd/panel-agent/seed_plans.go`, wajib root): Mengisi contoh paket hosting.
    - `mcp [--token ...] [--url ...]`: Menjalankan server MCP stdio/HTTP bridge (`internal/mcp`).
- **`cmd/panel-agent/root_unix.go` & `root_windows.go`**: Helper pemeriksaan privilege root (`requireRoot()`).

---

## 2. Peta Package di `internal/` (23 Package)

| Package | File Utama | Tanggung Jawab Utama |
| :--- | :--- | :--- |
| `internal/config` | `config.go` | Memuat `.env` / `/etc/reneo/agent.env` (`PANEL_*` & alias `RENEO_*`), mengelola `ALLOWED_ORIGINS` dan `EncryptionKey`. |
| `internal/runtimepath` | `runtimepath.go` | Resolusi path produksi (`/etc/reneo`, `/var/lib/reneo`, `/opt/reneo`) dengan fallback instalasi lama. |
| `internal/crypto` | `crypto.go` | Enkripsi/dekripsi AES-256-GCM untuk rahasia di DB (token Cloudflare, kredensial DB, env project, token bot). |
| `internal/auth` | `auth.go` | Autentikasi multi-user PostgreSQL + bcrypt, definisi Role (`superadmin`, `admin`, `user`, `demo`) dan Capability RBAC. |
| `internal/database` | `database.go`, 19 file domain, `migrations/` | Koneksi PostgreSQL, auto-migration `goose` (`000001` s/d `000043`), repositori data untuk users, templates, managed DBs, hosting, orders, vouchers, custom domains, public routes, payment, notifications, dan WhatsApp/Telegram. |
| `internal/httpserver` | `server.go`, `routes.go`, `middleware.go`, `scope.go`, `handlers_*.go`, `notify_*.go`, `project_*.go`, `public_*.go` | Router HTTP/WebSocket utama, validasi sesi (`reneo_session`) & token API (`rno_...`), isolasi scope per-user, injeksi SEO & `window.__REN_BOOT__`, serta loop rekonsiliasi project & masa aktif paket. |
| `internal/docker` | `docker.go`, `containers.go`, `deploy.go`, `compose.go`, `images.go`, `networks.go`, `mounts.go`, `logs*.go`, `update.go`, `policy.go` | Orkestrasi Docker CLI & Compose, isolasi container per-user (`panel.owner.user_id`), kuota CPU/RAM, pembatasan mount di dalam home user, streaming log, dan recreate/update image. |
| `internal/userdb` | `userdb.go`, `admin.go`, `access.go` | Penyediaan container database user (PostgreSQL, MySQL, MariaDB, MongoDB, Redis) di port `20000-29999`, query SQL/koleksi dari panel, dan firewall IPv4/CIDR via rantai iptables `RENEO-DB-<id>` pada `DOCKER-USER`. |
| `internal/projects` | `projects.go`, `run.go`, `stack.go`, `gateway.go`, `workdir.go`, `logs.go` | Supervisor aplikasi user (Static, Node, Go, Python, Custom, Fullstack multi-service) yang dijalankan sebagai akun OS pemilik (`runuser`) di balik reverse proxy `gateway.go`. |
| `internal/cloudflare` | `api.go`, `config.go`, `daemon.go`, `custom_hostnames.go` | Klien Cloudflare API v4 (Zones, DNS, Redirect Rules, Zero Trust Tunnels, Custom Hostnames/SaaS) dan supervisor daemon `cloudflared`. |
| `internal/publicproxy` | `proxy.go`, `cert.go` | Reverse proxy publik bawaan Reneo (`:80` & `:443`) dengan sertifikat otomatis Let's Encrypt (`autocert`). |
| `internal/webserver` | `webserver.go` | Deteksi, pembuatan konfigurasi virtual host, dan manajemen TLS `certbot` untuk `nginx` dan `Apache` di server ber-IP publik. |
| `internal/ufw` | `ufw.go`, `manage.go` | Manajemen firewall `ufw` yang aman tanpa eksekusi shell mentah (mencegah penguncian port SSH/panel). |
| `internal/listening` | `listening.go` | Pembacaan daftar port TCP/UDP yang sedang mendengarkan menggunakan `ss`. |
| `internal/terminal` | `terminal.go`, `guard.go`, `kill_*.go` | Sesi PTY interaktif (`creack/pty`) sebagai akun OS user, dilengkapi `guard.go` untuk menahan user biasa di dalam home directory. |
| `internal/osuser` | `osuser.go`, `limits_linux.go`, `owner_unix.go` | Pembuatan/penghapusan akun OS Linux per user panel, penerapan limit resource, dan pembungkusan PATH toolchain (`WrapCommand`). |
| `internal/accountusage` | `accountusage.go`, `proc_linux.go` | Penghitungan pemakaian CPU, RAM, dan Disk gabungan dari proses Linux akun + container Docker miliknya. |
| `internal/toolchain` | `toolchain.go`, `tools.go`, `files_unix.go` | Instalasi mandiri Node.js, Bun, pnpm, Yarn, pm2, dan uv ke `~/.reneo` milik akun user. |
| `internal/notify` | `service.go`, `worker.go`, `detect*.go`, `telegram.go`, `own_bot.go`, `waha.go`, `whatsapp_cloud.go` | Antrian pengiriman notifikasi (`FOR UPDATE SKIP LOCKED`), detektor serangan/ambang batas resource, dan integrasi Telegram, WAHA (`reneo-waha`), serta WhatsApp Cloud API. |
| `internal/mcp` | `server.go`, `protocol.go`, `run.go`, `tools_*.go` | Server Model Context Protocol (MCP) JSON-RPC 2.0 (Streamable HTTP, SSE, dan CLI stdio) dengan filter tool sesuai role user. |
| `internal/listquery` | `listquery.go` | Engine generik pencarian (`q`), sort, filter kolom (`f.<kolom>`), facet, dan paginasi untuk seluruh endpoint `/table`. |
| `internal/metrics` & `internal/system` | `recorder.go`, `system.go`, `sample.go`, `settings.go`, `storage_*.go` | Pengambilan sampel metrik host (CPU, RAM, Disk, Network, Suhu, Workload) dan penyimpanan riwayat metrik. |
| `internal/updater`, `internal/docsync`, `internal/users` | `updater.go`, `releases.go`, `docsync.go`, `users.go` | Self-updater dari GitHub Releases, sinkronisasi artikel `docs/articles/` ke DB, dan pembacaan daftar user OS. |

---

## 3. Peta Endpoint Utama (`internal/httpserver/routes.go`)
- **Public & SEO**: `GET /healthz`, `GET /api/v1/frontend/revision`, `GET /api/v1/mcp-catalog`, `GET /api/v1/public/{site,demo,hosting,contributors,docs}`, `POST /api/v1/public/hosting/{quote,orders}`, `GET /api/v1/public/hosting/orders/{publicId}/invoice`.
- **Auth & Setup**: `GET /api/v1/setup/status`, `POST /api/v1/setup/initialize`, `POST /api/v1/auth/{login,logout}`, `GET /api/v1/me`, `/api/v1/me/api-tokens`.
- **MCP**: `/mcp`, `/sse`, `/api/v1/mcp`.
- **Users & Profile**: `/api/v1/users`, `/api/v1/users/table`, `/api/v1/users/summary`, `/api/v1/users/{id}/{suspend,activate,usage,password,quota,plan}`, `/api/v1/me/{usage,password,widgets,toolchain}`.
- **Docker**: `/api/v1/containers`, `/api/v1/containers/table`, `/api/v1/containers/deploy-{image,compose}`, `/api/v1/containers/{id}/{start,stop,restart,update,config,logs,logs/ws}`, `/api/v1/docker/{version,networks,volumes,images,templates}`.
- **Databases**: `/api/v1/databases`, `/api/v1/databases/engines`, `/api/v1/databases/{id}/{credentials,start,stop,tables,query,users,access,password}`, `/adminer/`, `/dbx/`.
- **Projects**: `/api/v1/projects`, `/api/v1/projects/{id}/{start,stop,rebuild,logs,upload-static}`.
- **Cloudflare & Tunnels**: `/api/v1/me/cloudflare`, `/api/v1/cloudflare/domains/{zoneId}/{dns,redirects}`, `/api/v1/cloudflare/tunnel-profiles`, `/api/v1/tunnels`, `/api/v1/me/{subdomains,custom-domains}`.
- **Public Proxy & Firewall**: `/api/v1/public-proxy`, `/api/v1/public-proxy/{engines,routes,firewall,detect}`, `/api/v1/firewall/{enable,disable,reload,default,logging,rules}`.
- **Hosting, Payment, & Notify**: `/api/v1/hosting/{plans,domains,subdomains,vouchers,orders,custom-domains}`, `/api/v1/settings/payment`, `/api/v1/notification-devices`, `/api/v1/captured-notifications/ws`, `/api/v1/notify/{overview,templates,waha,outbox,thresholds}`, `/api/v1/me/{telegram,whatsapp}`, `/api/v1/webhooks/notifications`, `/api/v1/public/notify/{whatsapp-cloud,waha}/webhook`.
- **Files, Terminal, System, Speedtest**: `/api/v1/files/{read,write,upload,delete,rename,move,copy,mkdir,touch,chmod,compress,extract,root-access/*}`, `/api/v1/terminal/{sessions,exec,presets}`, `/api/v1/system/{summary,history,logs,changelog,update,stats/ws,live/ws}`, `/api/v1/speedtest/{download,upload,ping,servers,server,cli/install}`.

