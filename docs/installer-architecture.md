# UI Panel Installer Architecture

## Goal

Membangun produk panel server **Linux-first** yang dapat diinstal seperti aaPanel:

1. User download installer `.sh`
2. Installer cek environment dan dependency
3. Installer install Docker + Portainer + panel service
4. Installer meminta credential awal
5. Installer mendaftarkan service agar auto-start
6. User membuka panel web dan login dengan kredensial hasil instalasi

---

## Arsitektur Tingkat Tinggi

```text
+-------------------------+
|   install.sh            |
|  (Bootstrap Installer)  |
+-----------+-------------+
            |
            v
+-------------------------+
|  Linux Host             |
|  - Docker Engine        |
|  - Docker Compose       |
|  - systemd              |
+-----------+-------------+
            |
            +------------------------------+
            |                              |
            v                              v
+-------------------------+
| ui-panel-agent          |      | Portainer              |
| (Go systemd service)    |      | (Docker container)     |
|                         |      |                         |
| - HTTP API              |      | - container insights    |
| - Auth                  |      | - optional integration  |
| - Install status        |      +-------------------------+
| - Docker orchestration  |
| - Config management     |
| - MariaDB persistence   |
+-----------+-------------+
            |
            v
+-------------------------+
| Web Panel               |
| React/Vite frontend     |
| served by agent/nginx   |
+-------------------------+
```

---

## Komponen Utama

### 1. Bootstrap Installer (`installer/linux/install.sh`)

Tanggung jawab:
- validasi root privilege
- deteksi distro/package manager
- install dependency minimum (`curl`, `ca-certificates`, `tar`, `systemd`)
- install Docker jika belum ada
- install Go jika belum ada atau versi terlalu lama
- install MariaDB jika belum ada
- meminta input credential awal panel
- generate file konfigurasi `/etc/ui-panel/agent.env`
- build binary Go agent dari source lokal
- install binary ke `/usr/local/bin/ui-panel-agent`
- register dan start `systemd` service
- deploy Portainer sebagai container Docker
- membuat database/user MariaDB runtime untuk panel
- menampilkan URL dan credential setelah instalasi selesai

### 2. Panel Agent (`cmd/panel-agent`)

Tanggung jawab:
- menjadi **backend inti** milik produk
- expose HTTP API lokal/public
- melakukan autentikasi panel
- menyimpan bootstrap state
- expose status service yang diinstal
- mengelola persistence MariaDB untuk runtime logs, changelog, dan audit trail settings
- di masa depan mengelola:
  - app templates
  - backup
  - domain dan reverse proxy
  - SSL automation
  - update orchestration

### 3. Portainer (opsional tapi terintegrasi)

Posisi Portainer:
- **bukan core product**, tapi service pendukung
- dipakai untuk observability dan operasi container tertentu
- agent dapat melakukan health check Portainer
- panel utama tetap login ke **ui-panel-agent**, bukan login langsung ke Portainer

### 4. Web Panel

Frontend React saat ini diposisikan sebagai:
- panel UI utama
- client untuk API `ui-panel-agent`
- onboarding wizard
- dashboard status host/container

---

## Struktur Direktori yang Disarankan

```text
cmd/
  panel-agent/
    main.go

internal/
  auth/
  config/
  docker/
  httpserver/
  system/

installer/
  linux/
    install.sh
    ui-panel.service.tpl

web/
  (opsional: frontend build output atau source terpisah)

docs/
  installer-architecture.md
```

---

## Kontrak Runtime Linux

### File System
- Binary: `/usr/local/bin/ui-panel-agent`
- Config: `/etc/ui-panel/agent.env`
- State dir: `/var/lib/ui-panel`
- Logs: via `journalctl -u ui-panel`
- MariaDB data: default service data directory milik distro (`/var/lib/mysql` atau setara)

### Network
- Panel Agent default bind: `0.0.0.0:8787`
- Portainer default bind: `9443` dan/atau `9000`
- Future reverse proxy: `80/443`

### Process Management
- `ui-panel.service` via `systemd`
- `docker.service` wajib aktif
- Portainer dijalankan sebagai Docker container dengan restart policy `unless-stopped`

---

## Flow Instalasi

### Phase 1 — Bootstrap
1. User download source/bundle
2. User run `sudo ./installer/linux/install.sh`
3. Installer cek root access
4. Installer cek dan install Docker
5. Installer cek dan install Go
6. Installer cek dan install MariaDB
7. Installer meminta:
   - host bind panel
   - port panel
   - admin username
   - admin password (boleh auto-generate)
8. Installer build agent
9. Installer buat database/user MariaDB runtime
10. Installer tulis env file
11. Installer install systemd service
12. Installer deploy Portainer container
13. Installer start service
14. Installer print hasil akhir

### Phase 2 — First Login
1. User membuka `http://SERVER_IP:8787`
2. User login memakai credential bootstrap
3. Frontend memanggil API agent
4. Agent menampilkan setup summary dan health status

### Phase 3 — Post-install Wizard
Nanti ditambahkan:
- domain setup
- reverse proxy setup
- SSL setup
- app marketplace/template install
- backup destination
- monitoring integration

---

## Model Konfigurasi

`/etc/ui-panel/agent.env`

```env
PANEL_BIND_ADDR=0.0.0.0:8787
PANEL_ADMIN_USERNAME=admin
PANEL_ADMIN_PASSWORD=generated-secret
PANEL_SESSION_SECRET=random-secret
PANEL_STATE_DIR=/var/lib/ui-panel
PANEL_PORTAINER_URL=http://127.0.0.1:9000
PANEL_INSTALL_CHANNEL=stable
PANEL_DB_ENABLED=true
PANEL_DB_HOST=127.0.0.1
PANEL_DB_PORT=3306
PANEL_DB_USER=ui_panel
PANEL_DB_PASSWORD=generated-db-secret
PANEL_DB_NAME=ui_panel
```

> [!WARNING]
> Untuk MVP installer ini, password admin masih disimpan di env file root-owned. Tahap berikutnya perlu migrasi ke password hash dan penyimpanan credential yang lebih aman.

---

## API Awal Agent

### Public
- `GET /healthz`
- `GET /api/v1/bootstrap/status`
- `POST /api/v1/auth/login`

### Protected
- `GET /api/v1/me`
- `GET /api/v1/system/summary`
- `GET /api/v1/system/changelog`
- `GET /api/v1/database/status`

### Future
- `GET /api/v1/docker/containers`
- `POST /api/v1/docker/containers/:id/start`
- `POST /api/v1/docker/containers/:id/stop`
- `GET /api/v1/apps`
- `POST /api/v1/apps/install`

---

## Security Boundary

### Installer
- wajib dijalankan sebagai root
- env file dibuat dengan permission `600`
- service file dibuat dengan permission `644`

### Agent
- jangan expose password kembali lewat API
- gunakan cookie/token session untuk login panel
- implement constant-time compare untuk credential check
- batasi permission file system hanya ke direktori yang dibutuhkan

### Future hardening
- hash password admin (`bcrypt`/`argon2id`)
- hash/rotate database credential through a managed secret workflow
- CSRF protection
- TLS termination
- audit log
- lockout/rate limit login

---

## Roadmap Implementasi

### MVP sekarang
- installer `.sh`
- Go agent service
- bootstrap auth
- Portainer deployment
- health endpoints

### Milestone berikutnya
1. frontend onboarding login
2. Docker runtime API milik agent
3. reverse proxy management
4. SSL automation
5. app template marketplace
6. self-update flow

---

## Catatan Penting

- Proyek React saat ini tetap berguna sebagai basis UI.
- Portainer dipertahankan sebagai integrasi pendukung, bukan jantung sistem.
- Core control plane harus berada di **Go agent** agar flow installer, service background, dan orkestrasi server tetap sepenuhnya milik produk ini.
