# Panduan Lengkap YPanel MCP Server & Akses Sistem

Dokumen ini menjelaskan secara menyeluruh cara kerja, arsitektur koneksi, hak akses, serta panduan konfigurasi integrasi **Model Context Protocol (MCP)** pada **YPanel**.

---

## 1. Apa Itu MCP YPanel & Ke Mana Saja Aksesnya?

MCP (*Model Context Protocol*) adalah standar terbuka yang memungkinkan AI assistant (seperti Claude Desktop, Cursor, VS Code Cline/Roo Code, Windsurf) terhubung langsung ke sistem eksternal dengan aman.

Di YPanel, MCP server berjalan sebagai **stdio subprocess** bawaan di dalam binary `panel-agent`. Ketika AI client memanggil tool, perintah dieksekusi secara lokal atau diteruskan ke agent runtime.

```
 ┌────────────────────────────────────────────────────────┐
 │            AI Client (Laptop / Workstation)            │
 │     Claude Desktop  •  Cursor IDE  •  VS Code Cline     │
 └───────────────────────────┬────────────────────────────┘
                             │
                  Transport: stdio / SSH
                             │
 ┌───────────────────────────▼────────────────────────────┐
 │              YPanel Binary (panel-agent mcp)           │
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
| **Systemd Services** | `journalctl -u <service> -n <limit>` | Membaca log layanan sistem (`ypanel`, `nginx`, `docker`, dsb). |
| **Filesystem Server** | Path absolut di storage (contoh: `/home`, `/var/www`, `/opt`) | Membaca (`file_read`), menulis file (`file_write`), direktori (`file_list`), dan hapus file. Path sensitif seperti `/etc/shadow`, `/root/.ssh`, `/proc` diblokir otomatis. |
| **Terminal Host PTY** | Exec shell `/bin/sh -c` | Eksekusi perintah command-line langsung sebagai user daemon dengan timeout 60 detik (*Khusus Admin*). |
| **Docker Daemon** | `/var/run/docker.sock` via Docker Engine | Memeriksa seluruh container, start/stop/restart container, streaming log, dan inspect resource. |
| **YPanel REST API** | `http://localhost:8787` (atau `PANEL_MCP_URL`) | Operasi tingkat tinggi: pembuatan dan lifecycle project web, routing DNS & tunnel Cloudflare, kuota akun, dan manajemen user. |
| **Cloudflare Daemon** | Cloudflare API via Panel Agent | Monitoring status tunnel cloudflared, daftar domain/zone aktif, dan sinkronisasi DNS records. |

---

## 2. Model Hak Akses Berbasis Akun (RBAC)

MCP server YPanel **tidak memberikan akses bebas tanpa kontrol**. Ketersediaan tools disesuaikan secara ketat dengan role akun pemilik token API (`ypat_...`):

| Role Akun | Jumlah Tools | Izin Akses | Risiko & Pembatasan |
|---|:---:|---|---|
| **`superadmin` / `admin`** | **22 Tools** | Akses Penuh: Terminal root host, Docker full lifecycle (start/stop/restart/delete), File Read/Write/Delete, Project Management, User Accounts, Cloudflare. | Digunakan oleh pemilik server atau lead sysadmin. |
| **`user` (Developer Biasa)** | **9 Tools** | Sandbox Pengembang: Kelola project miliknya sendiri, pantau status Cloudflare, baca file projek (read-only), baca logs & status Docker (read-only), info kesehatan sistem. | ❌ Terminal exec dinonaktifkan.<br>❌ User management dinonaktifkan.<br>❌ File write & penghapusan container dinonaktifkan. |
| **Tanpa Token (Anonim)** | **6 Tools** | Diagnostik Publik: Info resource server, log dasar, list container, baca file. | Hanya pembacaan aman tanpa modifikasi apa pun. |

---

## 3. Langkah Mendapatkan Token API

1. Buka browser dan login ke web panel **YPanel**.
2. Di layar desktop, buka aplikasi **Settings** (Pengaturan).
3. Pilih menu samping **API & Token MCP** (ikon kunci).
4. Masukkan nama deskripsi token (misal: `Claude Laptop`, `Cursor Workstation`).
5. Pilih durasi kedaluwarsa (`7 Hari`, `30 Hari`, `90 Hari`, `1 Tahun`, atau `Tanpa Kedaluwarsa`).
6. Klik tombol **Generate Token**.
7. Salin token berformat **`ypat_<40_karakter_hex>`**. Simpan baik-baik karena token mentah ini hanya ditampilkan satu kali demi keamanan.

---

## 4. Metode Koneksi: Streamable HTTP vs Stdio / SSH

YPanel mendukung dua arsitektur transport MCP:

### 🌟 Metode 1: Streamable HTTP & SSE (Direkomendasikan ala Hermes Agent / IDCloudHost)
Metode ini **paling praktis** karena Anda tidak memerlukan setup SSH key atau menjalankan binary lokal. Cukup gunakan URL endpoint langsung dari AI agent Anda:

- **Format URL Endpoint:**
  ```text
  http://IP_SERVER:8787/mcp?key=ypat_TOKEN_ANDA
  # atau jika menggunakan domain publik:
  https://panel.domainanda.com/mcp?key=ypat_TOKEN_ANDA
  ```

#### A. Integrasi Hermes Agent (CLI)
Hermes Agent mendukung MCP secara native. Cukup jalankan satu baris perintah di terminal Anda:
```bash
hermes mcp add YPANEL --url "https://panel.domainanda.com/mcp?key=ypat_PASTE_TOKEN_ANDA"
```

Setelah terhubung, Anda dapat langsung menginstruksikan Hermes:
> *"Hermes, cek penggunaan CPU dan RAM server YPanel saya saat ini."*  
> *"Daftar container Docker dan restart container nginx jika memory melebihi batas."*

#### B. Integrasi OpenClaw (CLI)
```bash
openclaw mcp add YPANEL --transport streamable-http --url "https://panel.domainanda.com/mcp?key=ypat_PASTE_TOKEN_ANDA"
```

---

### Metode 2: Stdio Subprocess & SSH Bridge (Claude Desktop & Cursor)

Gunakan metode ini jika AI client yang Anda gunakan hanya mendukung transport `stdio`:

#### Skenario A: AI Client dan YPanel di Server yang Sama (Direct Stdio)
Gunakan perintah binary langsung:
```bash
/opt/ypanel/panel-agent mcp --token ypat_PASTE_TOKEN_ANDA
```

#### Skenario B: AI Client di Laptop Pribadi (Windows / Mac), YPanel di VPS Remote (SSH Bridge)
Claude Desktop atau Cursor di komputer kerja terhubung ke binary di server VPS melalui jembatan SSH:

#### Konfigurasi Claude Desktop via SSH Bridge:
File konfigurasi Claude Desktop:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ypanel-remote": {
      "command": "ssh",
      "args": [
        "-o", "StrictHostKeyChecking=no",
        "-i", "C:\\Users\\Username\\.ssh\\id_rsa",
        "root@IP_SERVER_ANDA",
        "/opt/ypanel/panel-agent mcp --token ypat_PASTE_TOKEN_ANDA"
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
    "ypanel": {
      "command": "/opt/ypanel/panel-agent",
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
    "ypanel": {
      "command": "/opt/ypanel/panel-agent",
      "args": [
        "mcp",
        "--token",
        "ypat_PASTE_TOKEN_ANDA"
      ]
    }
  }
}
```

Jika YPanel ada di VPS remote, gunakan SSH bridge:
```json
{
  "mcpServers": {
    "ypanel-vps": {
      "command": "ssh",
      "args": [
        "root@IP_SERVER_ANDA",
        "/opt/ypanel/panel-agent mcp --token ypat_PASTE_TOKEN_ANDA"
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
    "ypanel": {
      "command": "/opt/ypanel/panel-agent",
      "args": ["mcp", "--token", "ypat_PASTE_TOKEN_ANDA"]
    }
  }
}
```

---

## 6. Daftar Lengkap 22 Tools MCP yang Tersedia

### Kategori 1: System Diagnostics
1. **`system_info`**: Mengambil statistik hardware server: hostname, OS kernel, uptime, persentase CPU, RAM usage, penggunaan partisi disk, Docker daemon status, dan IP interface.
2. **`system_logs`**: Membaca log journalctl service systemd (contoh argumen: `{"service": "ypanel", "limit": 100}`).

### Kategori 2: Docker Management
3. **`docker_list_containers`**: List seluruh container (status running, exited, ports yang dipublish, image, dan network).
4. **`docker_container_logs`**: Mengambil log container tertentu (contoh argumen: `{"id": "nginx_prod", "tail": 50}`).
5. **`docker_start_container`**: Menjalankan container yang sedang stop (`{"id": "<container_id>"}`). *(Admin)*
6. **`docker_stop_container`**: Menghentikan container yang sedang running (`{"id": "<container_id>"}`). *(Admin)*
7. **`docker_restart_container`**: Merestart container (`{"id": "<container_id>"}`). *(Admin)*
8. **`docker_delete_container`**: Menghapus container beserta volume/image opsional (`{"id": "<container_id>"}`). *(Admin)*

### Kategori 3: File System
9. **`file_list`**: Menampilkan daftar file dan folder di path tertentu (`{"path": "/var/www"}`).
10. **`file_read`**: Membaca isi file teks hingga batas aman 512 KB (`{"path": "/opt/ypanel/.env"}`).
11. **`file_write`**: Menulis atau mengedit file teks (`{"path": "/var/www/index.html", "content": "<h1>Hello</h1>"}`). *(Admin)*
12. **`file_delete`**: Menghapus file atau folder kosong (`{"path": "/tmp/test.txt"}`). *(Admin)*
13. **`file_mkdir`**: Membuat direktori baru secara rekursif (`{"path": "/var/www/new-app"}`). *(Admin)*

### Kategori 4: Terminal Command Execution
14. **`terminal_exec`**: Menjalankan perintah shell langsung pada host Linux (contoh: `{"command": "df -h", "timeout_seconds": 30}`). *(Admin Only)*
    - Dilengkapi timeout otomatis (maksimal 60 detik).
    - Memiliki guardrail pengaman yang otomatis menolak perintah destruktif seperti `rm -rf /`, `mkfs`, `dd of=/dev/sd*`, atau fork bomb.

### Kategori 5: YPanel Projects (Aplikasi Web)
15. **`project_list`**: Menampilkan semua project aplikasi web yang dikelola YPanel (Node.js, PHP, Python, Static, Docker).
16. **`project_get`**: Mengambil detail konfigurasi, status runtime, port, dan domain satu project (`{"id": "1"}`).
17. **`project_start`**: Menjalankan service project (`{"id": "1"}`).
18. **`project_stop`**: Menghentikan service project (`{"id": "1"}`).

### Kategori 6: User Accounts Management *(Admin Only)*
19. **`user_list`**: Menampilkan daftar semua pengguna terdaftar, peran (role), dan kuota resource.
20. **`user_get`**: Melihat profil lengkap satu pengguna (`{"id": "2"}`).
21. **`user_suspend`**: Menonaktifkan akun pengguna (`{"id": "2"}`).
22. **`user_activate`**: Mengaktifkan kembali akun pengguna (`{"id": "2"}`).

### Kategori 7: Cloudflare Tunnels & Domains
23. **`cloudflare_list_domains`**: Menampilkan daftar domain/zone Cloudflare yang terhubung ke YPanel.
24. **`cloudflare_list_dns`**: Menampilkan DNS record pada zone tertentu (`{"zone_id": "<zone_id>"}`).
25. **`cloudflare_list_tunnel_profiles`**: Menampilkan profil tunnel Cloudflared yang aktif untuk public ingress.
26. **`cloudflare_verify_token`**: Memeriksa validitas token API Cloudflare dan menganalisis cakupan izin (`Zone:Read`, `DNS:Edit`, `Cloudflare Tunnel:Edit`).
27. **`cloudflare_create_dns`**: Membuat DNS record (CNAME, A, AAAA, TXT) di Cloudflare untuk domain yang dikelola.
28. **`cloudflare_ensure_dns_cname`**: Otomatis membuat atau memperbarui DNS CNAME Cloudflare untuk mengarahkan hostname ingress (misal `antrian.aknalre.my.id`) ke Cloudflare Tunnel secara instan.

### Kategori 8: High-Level Workflow & PM2 Apps *(Admin Only)*
29. **`quick_deploy_static`**: **1-Click Deployment Halaman Statis**. Membuat file HTML, menjalankan web server (PM2/Python), dan otomatis menghubungkan Cloudflare Ingress serta membuat CNAME DNS dalam satu kali panggil!
30. **`pm2_list`**: Menampilkan semua aplikasi dan proses Node.js / PM2 di server (status, memory, CPU, port, uptime).
31. **`pm2_restart`**: Merestart proses PM2 berdasarkan nama atau ID (`{"name": "antrian-app"}`).
32. **`pm2_logs`**: Mengambil baris log terbaru aplikasi PM2 (`{"name": "antrian-app", "lines": 50}`).
33. **`service_manage`**: Mengontrol status service sistem (`cloudflared`, `docker`, `nginx`, `ypanel`).
34. **`network_ports_list`**: Memeriksa port TCP yang sedang listening dan otomatis menemukan port bebas untuk aplikasi baru.

### Kategori 9: Katalog Tambahan (REST-backed)

YPanel menyediakan hampir 100 tool. Tool di kategori ini memanggil REST API panel dengan token Anda sendiri, sehingga kepemilikan, kuota, dan pemeriksaan role tetap dijalankan di server. Setiap tool membawa **annotations** (`readOnlyHint`, `destructiveHint`, `idempotentHint`) agar klien MCP dapat meminta konfirmasi sebelum aksi destruktif.

| Area | Tool | Akses |
| :--- | :--- | :--- |
| Ringkasan | `server_overview` (status host, resource, Docker, project, notifikasi dalam satu panggilan), `whoami` | Semua |
| Monitoring | `system_history` (CPU/RAM/disk/suhu/network 1 jam @ 5 dtk), `ping_host` (ICMP atau TCP), `system_changelog`, `database_status` | `ping_host`, `database_status`: Admin |
| Widget desktop | `widgets_get`, `widget_add` (clock, vitals, network, cpu-graph, ping, quick-note), `widget_remove` | Semua |
| Notifikasi | `notification_list`, `notification_mark_read`, `notification_mark_all_read` | Semua |
| Project | `project_create`, `project_update`, `project_delete`, `project_attention_summary` | Semua |
| Tunnel | `tunnel_list`, `tunnel_get`, `tunnel_create`, `tunnel_update`, `tunnel_delete` | Semua |
| Cloudflare | `cloudflare_get_config`, `cloudflare_list_zones`, `cloudflare_update_dns`, `cloudflare_list_tunnel_routes`, `cloudflare_create_tunnel_profile`, `cloudflare_delete_tunnel_profile` | Semua |
| Docker | `docker_inspect_container`, `docker_deploy_image`, `docker_deploy_compose`, `docker_list_images`, `docker_pull_image`, `docker_remove_image`, `docker_list_networks`, `docker_create_network`, `docker_remove_network`, `docker_list_templates`, `docker_create_template`, `docker_delete_template` | Semua (sesuai kepemilikan) |
| File | `file_rename`, `file_move`, `file_copy`, `file_touch`, `file_chmod` (mode oktal, mis. `"755"`), `file_compress`, `file_extract` | Semua (aturan root-access berlaku) |
| Dokumentasi | `docs_list`, `docs_get`; `docs_create`, `docs_update`, `docs_delete` | Tulis: Admin |
| Terminal | `terminal_presets_list` | Semua |
| Pengguna | `user_create`, `user_update`, `user_delete`, `user_quota_get`, `user_quota_set` | Admin |
| Token API | `api_token_list`, `api_token_revoke` | Semua |
| Pengaturan | `settings_get`, `settings_update` | Admin |

**Prompt siap pakai** (`prompts/list`): `diagnose-server`, `server-health-report`, `troubleshoot-container`, `monitor-host`, `audit-access`, `deploy-static-page`.

Catatan:

- Gunakan `server_overview` sebagai langkah pertama untuk mendiagnosis atau melaporkan status.
- `widget_add` bekerja pada layout akun yang sudah pernah dibuka di panel (layout tersimpan di server). Sesi panel yang terbuka menampilkan perubahan setelah dimuat ulang.
- Tool destruktif (`*_delete`, `*_remove`, `api_token_revoke`, `terminal_exec`) sebaiknya selalu dikonfirmasi ke pengguna.
- Versi server MCP (`serverInfo.version`) mengikuti `/opt/ypanel/VERSION` yang ditulis installer.

---

## 7. Contoh Prompt Real-World untuk AI

Setelah MCP terhubung, Anda dapat langsung menginstruksikan AI di Claude Desktop atau Cursor dengan bahasa manusiawi biasa:

### Pemeriksaan Server:
> *"Tolong periksa status kesehatan server YPanel saya saat ini. Apakah ada resource CPU, RAM, atau storage yang hampir penuh?"*

### Troubleshooting Docker:
> *"Cek semua container Docker di server. Jika ada container yang statusnya 'Exited' atau error, tolong bacakan 30 baris log terakhirnya lalu restart container tersebut."*

### Inspeksi File & Konfigurasi:
> *"Buka direktori `/var/www/my-api`, baca file `package.json`, lalu beri tahu saya dependensi apa saja yang digunakan."*

### Manajemen Project & Layanan:
> *"Daftar semua project yang ada di YPanel, cek apakah project 'frontend-app' sedang berjalan, jika mati tolong nyalakan."*

### Eksekusi Perintah Administratif (Admin):
> *"Jalankan perintah `uptime` dan `systemctl status ypanel` di server untuk memastikan daemon berjalan stabil."*

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
     http://localhost:8787/api/v1/docker/containers
```
