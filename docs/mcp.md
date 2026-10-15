# Panduan Lengkap Reneo MCP Server & Akses Sistem

Dokumen ini menjelaskan secara menyeluruh cara kerja, arsitektur koneksi, hak akses, serta panduan konfigurasi integrasi **Model Context Protocol (MCP)** pada **Reneo**.

---

## 1. Apa Itu MCP Reneo & Ke Mana Saja Aksesnya?

MCP (*Model Context Protocol*) adalah standar terbuka yang memungkinkan AI assistant (seperti Claude Desktop, Cursor, VS Code Cline/Roo Code, Windsurf) terhubung langsung ke sistem eksternal dengan aman.

Di Reneo, MCP server tersedia lewat dua transport: **Streamable HTTP** di endpoint `/mcp` milik agent (cukup URL dan token), dan **stdio subprocess** bawaan binary `panel-agent mcp` (lokal atau lewat SSH). Ketika AI client memanggil tool, perintah dieksekusi secara lokal atau diteruskan ke REST API agent dengan token milik akun tersebut.

```
 ┌────────────────────────────────────────────────────────┐
 │            AI Client (Laptop / Workstation)            │
 │     Claude Desktop  •  Cursor IDE  •  VS Code Cline     │
 └───────────────────────────┬────────────────────────────┘
                             │
                  Transport: HTTP /mcp  atau  stdio / SSH
                             │
 ┌───────────────────────────▼────────────────────────────┐
 │              Reneo Binary (panel-agent mcp)           │
 │       Otentikasi & Validasi Role (ypat_<token>)        │
 └──────┬────────────────────┬────────────────────┬───────┘
        │                    │                    │
        ▼                    ▼                    ▼
 ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐
 │ Linux Host   │    │ Docker Engine│    │ Panel HTTP API  │
 │ OS & Kernel  │    │ Unix Socket  │    │ localhost:8787  │
 ├──────────────┤    ├──────────────┤    ├─────────────────┤
 │ • journalctl │    │ • ps / list  │    │ • Projects CRUD │
 │ • df / free  │    │ • logs tail  │    │ • Users RBAC    │
 │ • CPU / Mem  │    │ • start/stop │    │ • Cloudflare    │
 │ • File System│    │ • restart    │    │ • Quotas        │
 │ • Terminal   │    │ • rm         │    │ • Database      │
 └──────────────┘    └──────────────┘    └─────────────────┘
```

### Rincian Akses Resource & Endpoint

| Komponen yang Diakses | Jalur / Endpoint | Kegunaan |
|---|---|---|
| **Host Operating System** | Direct Kernel / Syscall / `/proc`, `/sys` | Memantau penggunaan CPU, RAM, disk storage, IP addresses, dan uptime. |
| **Systemd Services** | `journalctl -u <service> -n <limit>` | Membaca log layanan sistem (`reneo`, `nginx`, `docker`, dsb). |
| **Filesystem Server** | Path absolut di storage (contoh: `/home`, `/var/www`, `/opt`) | Membaca (`file_read`), menulis file (`file_write`), direktori (`file_list`), dan hapus file. Path sensitif seperti `/etc/shadow`, `/root/.ssh`, `/proc` diblokir otomatis. |
| **Terminal Host PTY** | Exec shell `/bin/sh -c` | Eksekusi perintah command-line langsung sebagai user daemon dengan timeout 60 detik (*Khusus Admin*). |
| **Docker Daemon** | `/var/run/docker.sock` via Docker Engine | Memeriksa seluruh container, start/stop/restart container, streaming log, dan inspect resource. |
| **Reneo REST API** | `http://localhost:8787` (atau `PANEL_MCP_URL`) | Operasi tingkat tinggi: pembuatan dan lifecycle project web, routing DNS & tunnel Cloudflare, kuota akun, dan manajemen user. |
| **Cloudflare Daemon** | Cloudflare API via Panel Agent | Monitoring status tunnel cloudflared, daftar domain/zone aktif, dan sinkronisasi DNS records. |

---

## 2. Model Hak Akses Berbasis Akun (RBAC)

MCP server Reneo **tidak memberikan akses bebas tanpa kontrol**. Ketersediaan tools disesuaikan secara ketat dengan role akun pemilik token API (`ypat_...`):

| Role Akun | Jumlah Tools | Izin Akses | Risiko & Pembatasan |
|---|:---:|---|---|
| **`superadmin` / `admin`** | **133 Tools** | Akses Penuh: Terminal root host, Docker full lifecycle (start/stop/restart/delete), File Read/Write/Delete, Project Management, User Accounts, Cloudflare. | Digunakan oleh pemilik server atau lead sysadmin. |
| **`user` (Developer Biasa)** | **91 Tools** | Kelola miliknya sendiri: project, tunnel dan DNS Cloudflare, database, container dan image Docker, file (aturan root-access berlaku), widget, notifikasi, dan token API. | ❌ `terminal_exec`, operasi host (firewall, disk, PostgreSQL panel), dan pengaturan sistem dinonaktifkan.<br>❌ Manajemen user dan dokumentasi tulis dinonaktifkan. |
| **Tanpa Token (Anonim)** | **7 Tools** | Diagnostik: `system_info`, `system_logs`, `docker_list_containers`, `docker_container_logs`, `file_list`, `file_read`, `update_check`. | Hanya pembacaan aman tanpa modifikasi apa pun. |

---

## 3. Langkah Mendapatkan Token API

1. Buka browser dan login ke web panel **Reneo**.
2. Di layar desktop, buka aplikasi **Settings** (Pengaturan).
3. Pilih menu samping **API & Token MCP** (ikon kunci).
4. Masukkan nama deskripsi token (misal: `Claude Laptop`, `Cursor Workstation`).
5. Pilih durasi kedaluwarsa (`7 Hari`, `30 Hari`, `90 Hari`, `1 Tahun`, atau `Tanpa Kedaluwarsa`).
6. Klik tombol **Generate Token**.
7. Salin token berformat **`ypat_...`** (diawali `ypat_`). Simpan baik-baik karena token mentah ini hanya ditampilkan satu kali demi keamanan.

---

## 4. Metode Koneksi: Streamable HTTP vs Stdio / SSH

Reneo mendukung dua arsitektur transport MCP:

### 🌟 Metode 1: Streamable HTTP & SSE (Direkomendasikan ala Hermes Agent / IDCloudHost)
Metode ini **paling praktis** karena Anda tidak memerlukan setup SSH key atau menjalankan binary lokal. Cukup gunakan URL endpoint langsung dari AI agent Anda:

- Token dapat dikirim lewat header `Authorization: Bearer ypat_...` (disarankan, tidak masuk log akses) atau query `?key=` / `?token=`.
- **Format URL Endpoint:**
  ```text
  http://IP_SERVER:8787/mcp?key=ypat_TOKEN_ANDA
  # atau jika menggunakan domain publik:
  https://panel.domainanda.com/mcp?key=ypat_TOKEN_ANDA
  ```

#### A. Integrasi Hermes Agent (CLI)
Hermes Agent mendukung MCP secara native. Cukup jalankan satu baris perintah di terminal Anda:
```bash
hermes mcp add RENEO --url "https://panel.domainanda.com/mcp?key=ypat_PASTE_TOKEN_ANDA"
```

Setelah terhubung, Anda dapat langsung menginstruksikan Hermes:
> *"Hermes, cek penggunaan CPU dan RAM server Reneo saya saat ini."*  
> *"Daftar container Docker dan restart container nginx jika memory melebihi batas."*

#### B. Integrasi OpenClaw (CLI)
```bash
openclaw mcp add RENEO --transport streamable-http --url "https://panel.domainanda.com/mcp?key=ypat_PASTE_TOKEN_ANDA"
```

---

### Metode 2: Stdio Subprocess & SSH Bridge (Claude Desktop & Cursor)

Gunakan metode ini jika AI client yang Anda gunakan hanya mendukung transport `stdio`:

#### Skenario A: AI Client dan Reneo di Server yang Sama (Direct Stdio)
Gunakan perintah binary langsung:
```bash
/opt/reneo/panel-agent mcp --token ypat_PASTE_TOKEN_ANDA
```

#### Skenario B: AI Client di Laptop Pribadi (Windows / Mac), Reneo di VPS Remote (SSH Bridge)
Claude Desktop atau Cursor di komputer kerja terhubung ke binary di server VPS melalui jembatan SSH:

#### Konfigurasi Claude Desktop via SSH Bridge:
File konfigurasi Claude Desktop:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "reneo-remote": {
      "command": "ssh",
      "args": [
        "-o", "StrictHostKeyChecking=no",
        "-i", "C:\\Users\\Username\\.ssh\\id_rsa",
        "root@IP_SERVER_ANDA",
        "/opt/reneo/panel-agent mcp --token ypat_PASTE_TOKEN_ANDA"
      ]
    }
  }
}
```

> **Tips Windows:** Jika menggunakan SSH bawaan Windows, ganti path private key sesuai lokasi kunci SSH Anda, atau gunakan authentication agent seperti Pageant/OpenSSH Authentication Agent.

---

## 5. Konfigurasi pada Berbagai AI Client

### 1. Claude Desktop (Koneksi Langsung di Server / Local Machine)
```json
{
  "mcpServers": {
    "reneo": {
      "command": "/opt/reneo/panel-agent",
      "args": [
        "mcp",
        "--token",
        "ypat_PASTE_TOKEN_ANDA"
      ],
      "env": {
        "PANEL_MCP_URL": "http://localhost:8787"
      }
    }
  }
}
```

### 2. Cursor IDE
Buat atau edit file `.cursor/mcp.json` di root workspace atau melalui **Settings > Features > MCP**:

```json
{
  "mcpServers": {
    "reneo": {
      "command": "/opt/reneo/panel-agent",
      "args": [
        "mcp",
        "--token",
        "ypat_PASTE_TOKEN_ANDA"
      ]
    }
  }
}
```

Jika Reneo ada di VPS remote, gunakan SSH bridge:
```json
{
  "mcpServers": {
    "reneo-vps": {
      "command": "ssh",
      "args": [
        "root@IP_SERVER_ANDA",
        "/opt/reneo/panel-agent mcp --token ypat_PASTE_TOKEN_ANDA"
      ]
    }
  }
}
```

### 3. VS Code (Cline / Roo Code / Continue Extension)
Di ekstensi Cline / Roo Code, buka tab **MCP Servers** dan tambahkan:
```json
{
  "mcpServers": {
    "reneo": {
      "command": "/opt/reneo/panel-agent",
      "args": ["mcp", "--token", "ypat_PASTE_TOKEN_ANDA"]
    }
  }
}
```

---

## 6. Daftar Tool MCP yang Tersedia

Daftar ini dibuat dari registry agent yang sedang berjalan (`BuildServer` per role), jadi sama dengan halaman [Panduan MCP](/docs/mcp). Total **133 tool** untuk admin, **91** untuk user, dan **7** tanpa token. Katalog hidup juga tersedia publik di `GET /api/v1/mcp-catalog`.

Setiap tool membawa *annotations* (`readOnlyHint`, `destructiveHint`, `idempotentHint`) agar klien MCP dapat meminta konfirmasi sebelum aksi yang mengubah atau menghapus. Kolom **Jenis**: baca, ubah, hapus.

### Ringkasan, akun, dan notifikasi (7)

| Tool | Akses | Jenis | Fungsi |
| :--- | :--- | :--- | :--- |
| `api_token_list` | User ke atas | baca | List the account's API tokens (prefix, name, expiry, last use). |
| `api_token_revoke` | User ke atas | hapus | Revoke an API token by ID. |
| `notification_list` | User ke atas | baca | List panel notifications for the current account (deploys, user changes, warnings). |
| `notification_mark_all_read` | User ke atas | ubah | Mark every notification of the current account as read. |
| `notification_mark_read` | User ke atas | ubah | Mark one notification as read. |
| `server_overview` | User ke atas | baca | One-call health snapshot: host facts, CPU/RAM/disk, Docker state, container counts, projects needing attention and unread notifications. |
| `whoami` | User ke atas | baca | Return the account this MCP token acts as (username, role, status). |

### Sistem dan operasi host (29)

| Tool | Akses | Jenis | Fungsi |
| :--- | :--- | :--- | :--- |
| `database_status` | Admin ke atas | baca | Connection state and basic statistics of the panel PostgreSQL database. |
| `disk_cleanup` | Admin ke atas | hapus | Reclaim disk space from safe, regenerable data: unused Docker images and build cache (never volumes or running containers), the APT package cache, and old systemd jour... |
| `disk_usage_breakdown` | Admin ke atas | baca | Find what fills the disk: filesystem usage of the mount holding `path` plus the largest sub-directories (one filesystem only, via du). |
| `firewall_allow` | Admin ke atas | ubah | Open a port in UFW, preferably only for a trusted source (`from` IP or CIDR). |
| `firewall_remove` | Admin ke atas | hapus | Delete a UFW rule by its number from firewall_status. |
| `firewall_status` | Admin ke atas | baca | Show UFW status and numbered rules (use the numbers with firewall_remove). |
| `network_ports_list` | Admin ke atas | baca | Inspect open listening TCP ports on the server and find available free ports for running new apps. |
| `ping_host` | Admin ke atas | baca | Measure reachability and latency from the server. |
| `pm2_list` | Admin ke atas | baca | List all PM2 managed processes and web applications on the server with runtime metrics (status, memory, CPU, port, uptime). |
| `pm2_logs` | Admin ke atas | baca | Retrieve recent stdout and stderr logs for a PM2 application. |
| `pm2_restart` | Admin ke atas | ubah | Restart a PM2 managed process or application by name or ID |
| `postgres_hba_allow` | Admin ke atas | hapus | Allow one role to reach one database from a network over TCP with scram-sha-256 by appending a pg_hba.conf rule and reloading. |
| `postgres_listen_set` | Admin ke atas | hapus | Change PostgreSQL listen_addresses (ALTER SYSTEM) and restart the service so remote clients can connect, e.g. |
| `postgres_listen_status` | Admin ke atas | baca | Inspect how PostgreSQL is exposed: listen_addresses, port, hba file, non-local pg_hba rules and whether the port is listening. |
| `service_manage` | Admin ke atas | ubah | Check status or control system services (cloudflared, docker, nginx, reneo, redis, postgresql). |
| `settings_get` | Admin ke atas | baca | Read host settings the panel manages: hostname, timezone, nameservers. |
| `settings_update` | Admin ke atas | ubah | Change hostname, timezone or nameservers. |
| `system_changelog` | User ke atas | baca | Release notes of the installed Reneo versions. |
| `system_history` | User ke atas | baca | Recorded host metric series for the last hour at 5s resolution: cpu, ram, disk (percent), temp (C), net-rx and net-tx (bytes/s). |
| `system_info` | Tanpa token | baca | Get server system information: hostname, OS, kernel, uptime, CPU usage, memory, storage, network I/O, Docker status, and IP addresses. |
| `system_logs` | Tanpa token | baca | Read systemd service logs via journalctl. |
| `terminal_exec` | Admin ke atas | hapus | Execute a shell command on the server and return its output. |
| `terminal_preset_create` | User ke atas | ubah | Save a command as a terminal preset button for this account. |
| `terminal_preset_delete` | User ke atas | hapus | Delete one of the account's terminal presets. |
| `terminal_presets_list` | User ke atas | baca | List saved terminal command presets of the account. |
| `update_apply` | Admin ke atas | ubah | Start the panel update (superadmin only). |
| `update_check` | Tanpa token | ubah | Check GitHub Releases to see if a newer Reneo version is available. |
| `update_status` | Admin ke atas | baca | State of a running or finished panel update: running, done, failed, with the installer log lines. |
| `usage_get` | User ke atas | baca | What this account consumes against its quota: projects, tunnels, databases and disk. |

### Docker (18)

| Tool | Akses | Jenis | Fungsi |
| :--- | :--- | :--- | :--- |
| `docker_container_logs` | Tanpa token | baca | Fetch recent log output from a Docker container. |
| `docker_create_network` | User ke atas | ubah | Create a bridge network, optionally with subnet and gateway. |
| `docker_create_template` | User ke atas | ubah | Save a Docker Compose template for later reuse. |
| `docker_delete_container` | Admin ke atas | hapus | Force-remove a Docker container. |
| `docker_delete_template` | User ke atas | hapus | Delete a saved template. |
| `docker_deploy_compose` | User ke atas | ubah | Deploy a Docker Compose stack from YAML content. |
| `docker_deploy_image` | User ke atas | ubah | Pull and run a Docker image as a new container (compose-managed). |
| `docker_inspect_container` | User ke atas | baca | Return a container's effective configuration: image, ports, env, volumes, network, restart policy. |
| `docker_list_containers` | Tanpa token | baca | List all Docker containers (running and stopped) with their state, image, ports, networks, and resource info. |
| `docker_list_images` | User ke atas | baca | List local Docker images with size, tags and owners. |
| `docker_list_networks` | User ke atas | baca | List Docker networks with driver, subnet and attached containers. |
| `docker_list_templates` | User ke atas | baca | List saved Docker Compose templates. |
| `docker_pull_image` | User ke atas | ubah | Pull an image from a registry. |
| `docker_remove_image` | User ke atas | hapus | Remove a local image. |
| `docker_remove_network` | User ke atas | hapus | Remove a Docker network. |
| `docker_restart_container` | Admin ke atas | ubah | Restart a Docker container by its ID or name. |
| `docker_start_container` | Admin ke atas | ubah | Start a stopped Docker container by its ID or name. |
| `docker_stop_container` | Admin ke atas | ubah | Stop a running Docker container by its ID or name. |

### File (12)

| Tool | Akses | Jenis | Fungsi |
| :--- | :--- | :--- | :--- |
| `file_chmod` | User ke atas | ubah | Change file mode. |
| `file_compress` | User ke atas | ubah | Compress a file or directory into an archive next to it. |
| `file_copy` | User ke atas | ubah | Copy a file or directory. |
| `file_delete` | Admin ke atas | hapus | Delete a file or empty directory on the server. |
| `file_extract` | User ke atas | ubah | Extract an archive into a directory. |
| `file_list` | Tanpa token | baca | List files and directories at the given path on the server. |
| `file_mkdir` | Admin ke atas | ubah | Create a directory (and all parent directories) on the server. |
| `file_move` | User ke atas | ubah | Move a file or directory to another location. |
| `file_read` | Tanpa token | baca | Read the text content of a file on the server. |
| `file_rename` | User ke atas | ubah | Rename a file or directory. |
| `file_touch` | User ke atas | ubah | Create an empty file or update its timestamp. |
| `file_write` | Admin ke atas | ubah | Write or overwrite a file with the given text content. |

### Project dan tunnel (14)

| Tool | Akses | Jenis | Fungsi |
| :--- | :--- | :--- | :--- |
| `project_attention_summary` | User ke atas | baca | Counts of projects that are degraded, drifted or otherwise need attention. |
| `project_create` | User ke atas | ubah | Create a project record. |
| `project_delete` | User ke atas | hapus | Delete a project and its configuration. |
| `project_get` | User ke atas | baca | Get detailed information about a specific Reneo project. |
| `project_list` | User ke atas | baca | List all Reneo projects (web/app projects managed by the panel) with their status. |
| `project_start` | User ke atas | ubah | Start a Reneo project. |
| `project_stop` | User ke atas | ubah | Stop a running Reneo project. |
| `project_update` | User ke atas | ubah | Replace a project's settings. |
| `quick_deploy_static` | Admin ke atas | ubah | One-click deployment of a static HTML webpage/project. |
| `tunnel_create` | User ke atas | ubah | Expose a local service at subdomain.domain through a Cloudflare tunnel profile. |
| `tunnel_delete` | User ke atas | hapus | Remove a tunnel entry and its public route. |
| `tunnel_get` | User ke atas | baca | Get one tunnel entry. |
| `tunnel_list` | User ke atas | baca | List Cloudflare tunnel ingress entries (hostname to local service) of the account. |
| `tunnel_update` | User ke atas | ubah | Replace a tunnel entry's settings. |

### Database milik user (16)

| Tool | Akses | Jenis | Fungsi |
| :--- | :--- | :--- | :--- |
| `db_browse` | User ke atas | baca | Read a page of rows from one table (SQL engines). |
| `db_create` | User ke atas | ubah | Create a database as a Docker container bound to 127.0.0.1. |
| `db_credentials` | User ke atas | baca | Read the host, port, database, username, password and connection URL of one database. |
| `db_delete` | User ke atas | hapus | Delete a database: the container and its data volume are removed and cannot be recovered. |
| `db_engines` | User ke atas | baca | List the database engines that can be created (PostgreSQL, MySQL, MariaDB, MongoDB, Redis) with their selectable versions and the default version. |
| `db_list` | User ke atas | baca | List the databases of this account: engine, version, host port, status (preparing, ready, failed) and whether the container is running. |
| `db_password_set` | User ke atas | ubah | Change the owner password. |
| `db_query` | User ke atas | ubah | Run one statement as the database owner: SQL for PostgreSQL, MySQL and MariaDB, a command line for Redis. |
| `db_start` | User ke atas | ubah | Start a stopped database container. |
| `db_stop` | User ke atas | ubah | Stop a running database container. |
| `db_table_create` | User ke atas | ubah | Create a table with typed columns (SQL engines). |
| `db_table_drop` | User ke atas | hapus | Drop a table and all of its rows. |
| `db_tables` | User ke atas | baca | List tables (PostgreSQL, MySQL, MariaDB), collections (MongoDB) or a sample of keys (Redis). |
| `db_user_create` | User ke atas | ubah | Create an extra database account with a preset access level: read, write or all. |
| `db_user_delete` | User ke atas | hapus | Remove an extra database account. |
| `db_users` | User ke atas | baca | List the accounts that exist inside the database engine. |

### Cloudflare (17)

| Tool | Akses | Jenis | Fungsi |
| :--- | :--- | :--- | :--- |
| `cloudflare_create_dns` | User ke atas | ubah | Create a DNS record (CNAME, A, AAAA, TXT) in Cloudflare for a domain/zone managed by Reneo. |
| `cloudflare_create_redirect_rule` | User ke atas | ubah | Create a Single Redirect rule: requests to `hostname` (optionally an exact `path`) are redirected to `target_url`. |
| `cloudflare_create_tunnel_profile` | User ke atas | ubah | Register a Cloudflare tunnel profile (mode and tunnel ID) the panel can route through. |
| `cloudflare_create_tunnel_route` | User ke atas | ubah | Create a Cloudflare Tunnel ingress route and automatically configure DNS CNAME in Cloudflare. |
| `cloudflare_delete_dns` | User ke atas | hapus | Delete a DNS record from a Cloudflare zone. |
| `cloudflare_delete_redirect_rule` | User ke atas | hapus | Delete a redirect rule by ID (from cloudflare_list_redirect_rules). |
| `cloudflare_delete_tunnel_profile` | User ke atas | hapus | Delete a tunnel profile. |
| `cloudflare_ensure_dns_cname` | User ke atas | ubah | Automatically create or update a Cloudflare DNS CNAME pointing an ingress hostname |
| `cloudflare_get_config` | User ke atas | baca | Show whether a Cloudflare API token is configured for the account, its status and base domain (the token itself is never returned). |
| `cloudflare_list_dns` | User ke atas | baca | List DNS records for a Cloudflare zone managed by Reneo. |
| `cloudflare_list_domains` | User ke atas | baca | List all Cloudflare domains (zones) connected to Reneo. |
| `cloudflare_list_redirect_rules` | User ke atas | baca | List the zone's Single Redirect rules (Cloudflare Rules > Redirect Rules). |
| `cloudflare_list_tunnel_profiles` | User ke atas | baca | List all Cloudflare tunnel profiles configured in Reneo. |
| `cloudflare_list_tunnel_routes` | User ke atas | baca | List public hostname routes configured on a Cloudflare tunnel profile. |
| `cloudflare_list_zones` | User ke atas | baca | List zones visible to the configured Cloudflare token. |
| `cloudflare_update_dns` | User ke atas | ubah | Replace a DNS record. |
| `cloudflare_verify_token` | User ke atas | ubah | Verify Cloudflare API token status and check required permissions (Zone:Read, DNS:Edit, Cloudflare Tunnel:Edit). |

### Widget desktop (3)

| Tool | Akses | Jenis | Fungsi |
| :--- | :--- | :--- | :--- |
| `widget_add` | User ke atas | ubah | Add a widget to this account's desktop. |
| `widget_remove` | User ke atas | hapus | Remove a widget from this account's desktop by id (see widgets_get). |
| `widgets_get` | User ke atas | baca | Read the desktop widget layout of this account (types, positions, per-widget config such as ping host or note text). |

### User dan dokumentasi (17)

| Tool | Akses | Jenis | Fungsi |
| :--- | :--- | :--- | :--- |
| `docs_create` | Admin ke atas | ubah | Create a documentation page (Markdown content). |
| `docs_delete` | Admin ke atas | hapus | Delete a documentation page. |
| `docs_get` | User ke atas | baca | Read one documentation page. |
| `docs_list` | User ke atas | baca | List documentation pages stored in the panel. |
| `docs_official_list` | User ke atas | baca | List the official articles synced from the Reneo repository (installation, MCP, databases, projects, accounts). |
| `docs_update` | Admin ke atas | ubah | Update a documentation page. |
| `user_activate` | Admin ke atas | ubah | Activate a suspended Reneo user account. |
| `user_create` | Admin ke atas | ubah | Create a panel user. |
| `user_delete` | Admin ke atas | hapus | Permanently delete a user (superadmin only). |
| `user_get` | Admin ke atas | baca | Get a single Reneo user by ID. |
| `user_list` | Admin ke atas | baca | List all Reneo users with their roles, status, and quota info. |
| `user_password_reset` | Admin ke atas | ubah | Set a new password for a user account and sign that user out everywhere. |
| `user_quota_get` | Admin ke atas | baca | Read a user's resource quota (projects, tunnels, disk, CPU, memory). |
| `user_quota_set` | Admin ke atas | ubah | Set a user's resource quota. |
| `user_suspend` | Admin ke atas | ubah | Suspend a Reneo user account (prevent login). |
| `user_update` | Admin ke atas | ubah | Update user fields. |
| `user_usage_get` | Admin ke atas | baca | Read what a user consumes against the quota: projects (total and running), tunnels and disk used in MB. |

### Prompt siap pakai

Tersedia lewat `prompts/list`: `diagnose-server`, `server-health-report`, `troubleshoot-container` (argumen `container`), `monitor-host` (argumen `host`, opsional `port`), `audit-access`, dan `deploy-static-page` (argumen `hostname`, `title`).

### Resource

Lewat `resources/list`: status host dan sumber daya (`system://status`) serta snapshot container (`docker://containers`).

### Catatan keamanan dan perilaku

- Kepemilikan, kuota, dan pemeriksaan role dijalankan di server panel untuk setiap tool yang memanggil REST API, memakai token Anda sendiri.
- `terminal_exec` punya timeout 1-60 detik dan menolak perintah destruktif seperti `rm -rf /`, `mkfs`, `dd of=/dev/sd*`, atau fork bomb.
- Operasi host berbahaya dijaga: port sensitif (SSH, database, Redis, Docker) menolak aturan firewall untuk semua sumber tanpa `confirm_public=true`; `listen_addresses` `*` dan CIDR `/0` juga butuh konfirmasi; perintah dijalankan tanpa shell dengan argumen tervalidasi.
- Path sensitif seperti `/etc/shadow`, `/root/.ssh`, dan `/proc` diblokir oleh tool file; aturan root-access file manager tetap berlaku.
- `db_credentials` dan `db_password_set` mengembalikan rahasia; klien sebaiknya tidak mencatatnya. `db_query` menjalankan satu pernyataan sebagai pemilik database dan dapat mengubah data.
- `update_apply` hanya diterima untuk superadmin dan membutuhkan `confirm=true`; panel restart sebentar, ikuti dengan `update_status`.
- `cloudflare_verify_token` melaporkan `canManageRedirects`; redirect rule butuh izin Single Redirect/Rulesets pada zone dan hostname dengan record DNS yang diproksi (misalnya `AAAA 100::`).
- `widget_add` bekerja pada layout akun yang sudah pernah dibuka di panel; sesi panel yang terbuka menampilkan perubahan setelah dimuat ulang.
- Tool destruktif (`*_delete`, `*_remove`, `*_drop`, `api_token_revoke`, `terminal_exec`) sebaiknya selalu dikonfirmasi ke pengguna.
- Versi server MCP (`serverInfo.version`) mengikuti file `VERSION` yang ditulis installer.

---

## 7. Contoh Prompt Real-World untuk AI

Setelah MCP terhubung, Anda dapat langsung menginstruksikan AI di Claude Desktop atau Cursor dengan bahasa manusiawi biasa:

### Pemeriksaan Server:
> *"Tolong periksa status kesehatan server Reneo saya saat ini. Apakah ada resource CPU, RAM, atau storage yang hampir penuh?"*

### Troubleshooting Docker:
> *"Cek semua container Docker di server. Jika ada container yang statusnya 'Exited' atau error, tolong bacakan 30 baris log terakhirnya lalu restart container tersebut."*

### Inspeksi File & Konfigurasi:
> *"Buka direktori `/var/www/my-api`, baca file `package.json`, lalu beri tahu saya dependensi apa saja yang digunakan."*

### Manajemen Project & Layanan:
> *"Daftar semua project yang ada di Reneo, cek apakah project 'frontend-app' sedang berjalan, jika mati tolong nyalakan."*

### Eksekusi Perintah Administratif (Admin):
> *"Jalankan perintah `uptime` dan `systemctl status reneo` di server untuk memastikan daemon berjalan stabil."*

---

## 8. Panduan Mengakses REST API Langsung

Selain via MCP, token `ypat_...` dapat digunakan oleh curl, skrip bash, Python, atau pipeline CI/CD via HTTP header standar:

```bash
# 1. Cek autentikasi dan role akun
curl -H "Authorization: Bearer ypat_0123456789abcdef..." \
     http://localhost:8787/api/v1/me

# 2. List semua project web
curl -H "Authorization: Bearer ypat_0123456789abcdef..." \
     http://localhost:8787/api/v1/projects

# 3. List status container Docker
curl -H "Authorization: Bearer ypat_0123456789abcdef..." \
     http://localhost:8787/api/v1/containers
```
