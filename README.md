# YPanel

![YPanel social preview](public/ChatGPT%20Image%20Apr%2027%2C%202026%2C%2011_04_38%20AM.png)

**YPanel** adalah panel kontrol server Linux dengan pengalaman antarmuka bergaya Desktop OS. Proyek ini menggabungkan frontend React modern dan backend Go agent agar administrator dapat mengelola server, Docker, file, terminal, user, project, Cloudflare, database, dan observability dari satu workspace visual.

YPanel dibuat untuk kebutuhan homeserver, VPS pribadi, dan server kecil-menengah yang membutuhkan panel ringan, self-hosted, dan tetap nyaman digunakan seperti desktop environment.

## Tujuan Proyek

YPanel bertujuan menjadi control center yang:

- mudah dipakai dari browser tanpa kehilangan rasa desktop native
- aman untuk multi-user dengan pembatasan akses berbasis role/capability
- mampu mengelola Docker container, image, network, template, dan log realtime
- menyediakan workflow project, file manager, terminal, dan system monitoring dalam satu UI
- tetap transparan untuk operator Linux melalui service, log, migration, dan deploy script yang jelas

## Style dan Arah Desain

YPanel menggunakan gaya **Desktop OS Panel**:

- taskbar, dock, window manager, minimize/maximize, dan multi-window workflow
- panel/window dengan visual modern, rapi, dan tidak terlalu banyak dekorasi berlebihan
- warna netral-premium dengan aksen biru/indigo yang konsisten
- komponen interaktif seperti custom dropdown, modal scoped ke window, toast, dan alert kontekstual
- fokus pada density yang nyaman untuk operator server: banyak data tetap terbaca tanpa terasa penuh

Prinsip desain saat menambah fitur baru:

1. Ikuti style window/panel yang sudah ada.
2. Hindari card/bubble berlebihan.
3. Gunakan komponen shared seperti select/menu/button yang sudah dipakai window lain.
4. Modal harus menghormati ukuran window aplikasi.
5. Polling data harus aktif hanya saat window fokus/aktif jika memungkinkan.

## Fitur Utama

### Desktop Workspace

- taskbar dan dock
- window management
- shortcut aplikasi internal
- wallpaper/theme runtime
- attention badge untuk incident atau status penting

### Docker Workspace

- list container, image, network, template
- deploy dari image atau compose
- edit/redeploy container
- start, stop, restart, delete container
- cleanup image/volume dengan validasi
- log container realtime dengan auto-scroll
- runtime audit untuk restart count, health, exit code, dan status container

### Project Management

- registrasi project user
- metadata runtime dan drift/degraded status
- quick action untuk inspect log, file manager, terminal, start/stop, dan reconcile

### Cloudflare Integration

- konfigurasi Cloudflare per user
- tunnel management
- DNS/route integration
- validasi token dan account/zone context

### User dan Access Control

- multi-user dengan role/capability
- reset password akun utama YPanel
- pembatasan akses file, terminal, Docker, dan project berdasarkan user/context

### File Manager dan Editor

- browse file server dari browser
- upload/download
- drag/drop internal
- editor file berbasis Monaco
- akses root/admin dikontrol melalui setting keamanan

### Terminal

- terminal host berbasis Xterm.js
- guard akses untuk user biasa
- integrasi quick inspect command dari window lain

### System dan Database Monitoring

- healthcheck runtime agent
- log systemd/journal
- database status
- runtime audit log
- migration status
- system settings dan hardening controls

## Stack Teknologi

### Frontend

- React 19
- Vite
- TypeScript
- Zustand
- TanStack Query
- Framer Motion
- Xterm.js
- Monaco Editor
- Lucide React
- Sonner dan SweetAlert2
- CSS utama berbasis vanilla/global stylesheet dengan beberapa integrasi Tailwind tooling

### Backend

- Go
- PostgreSQL
- Docker CLI / Docker Compose
- systemd/journalctl integration
- Cloudflare API integration
- versioned SQL migrations

## Struktur Repository

```txt
.
├── cmd/                 # entrypoint binary Go agent
├── deploy/              # script build/deploy ke server
├── docs/                # dokumentasi teknis dan arsitektur
├── installer/           # installer Linux dan template service
├── internal/            # backend Go packages
├── public/              # static assets frontend
├── src/                 # frontend React/Vite
├── README.md
├── CHANGELOG.md
├── go.mod
├── package.json
└── vite.config.ts
```

Dokumentasi struktur lebih detail:

- [Repository Structure](docs/architecture/repository-structure.md)
- [Backend Go Structure](docs/architecture/backend-go-structure.md)
- [Frontend Structure](docs/architecture/frontend-structure.md)

## Backend Go Layout

Backend berada di `cmd/` dan `internal/`.

Package penting:

```txt
internal/
  auth/          # session/auth manager
  cloudflare/    # Cloudflare API/domain logic
  config/        # runtime config/env loading
  database/      # PostgreSQL persistence dan migrations
  docker/        # Docker container/image/network/deploy/log service
  httpserver/    # HTTP API, handler, middleware, static frontend serving
  osuser/        # Linux user provisioning/helper
  projects/      # project runtime metadata/reconciliation
  system/        # system stats, logs, settings
  terminal/      # terminal session guard/runtime
  users/         # user domain logic
```

`internal/docker` sudah dipecah menjadi file fokus:

```txt
internal/docker/
  types.go
  containers.go
  inspect.go
  deploy.go
  compose.go
  compose_errors.go
  logs.go
  images.go
  networks.go
  utils.go
```

## Development

### Prasyarat

- Go sesuai `go.mod`
- Bun atau Node.js modern
- Docker dan Docker Compose untuk fitur Docker
- PostgreSQL untuk mode runtime penuh

### Install dependency frontend

```bash
bun install
```

atau:

```bash
npm install
```

### Jalankan frontend

```bash
bun run dev
```

### Jalankan backend agent

```bash
go run ./cmd/panel-agent
```

Konfigurasi runtime dibaca dari environment atau file env agent.
Runtime production sekarang memakai nama teknis baru `ypanel-agent`, CLI `ypanel`, service `ypanel`, dan path `/etc/ypanel`, `/opt/ypanel`, `/var/lib/ypanel`. Alias legacy `ui-panel` dan `ui-panel-agent` tetap disediakan sementara untuk kompatibilitas.

## Build dan Validasi

```bash
go test ./...
bun run build
```

Untuk formatting Go package tertentu:

```powershell
Get-ChildItem internal\docker -Filter *.go | ForEach-Object { gofmt -w $_.FullName }
```

## Deployment

Deploy utama menggunakan PowerShell script:

```powershell
.\deploy\build.ps1 -HostName <host> -SshUsername <user> -SshPassword <password>
```

Script akan:

1. build frontend
2. menyiapkan bundle production
3. membuat installer Linux `.run`
4. upload ke server
5. install/update service
6. konfigurasi environment
7. menjalankan migration
8. restart service
9. healthcheck runtime

<!-- > [!NOTE]
> Rebranding public sudah menggunakan nama YPanel. Namun service/path/binary production masih dipertahankan untuk compatibility dan akan direbrand bertahap melalui migration plan khusus. -->

## Database Migrations

Schema PostgreSQL dikelola menggunakan versioned migrations.

Panduan lengkap:

- [Database Migrations](docs/database-migrations.md)

Command utama runtime saat ini:

```bash
ypanel-agent migrate create <nama>
ypanel-agent migrate up
ypanel-agent migrate status
ypanel-agent migrate rollback
```

## Security Hardening

Panduan lengkap:

- [Security Hardening](docs/security-hardening.md)

Flag penting:

```env
PANEL_TERMINAL_ENABLED=false
PANEL_TERMINAL_ALLOW_REMOTE=false
PANEL_ADMIN_FILE_ROOT_ACCESS=false
```

Aksi sensitif dilindungi oleh role dan capability-based authorization di backend.

## Dokumentasi Tambahan

- [Installer Architecture](docs/installer-architecture.md)
- [Database Migrations](docs/database-migrations.md)
- [Security Hardening](docs/security-hardening.md)
- [Repository Structure](docs/architecture/repository-structure.md)
- [Backend Go Structure](docs/architecture/backend-go-structure.md)
- [Frontend Structure](docs/architecture/frontend-structure.md)

<!-- ## Roadmap Rebrand Runtime

Tahap saat ini:

- public/product name: **YPanel**
- service/binary/path utama: `ypanel` / `ypanel-agent`, dengan alias legacy `ui-panel` / `ui-panel-agent` selama fase transisi

Tahap berikutnya dilakukan terpisah dan bertahap:

1. siapkan migration script untuk systemd service, binary, path, env, dan state directory
2. support alias command lama selama masa transisi
3. update deploy script agar bisa detect instalasi lama dan migrasi otomatis
4. validasi rollback jika service baru gagal start -->

## Lisensi

Private / Proprietary - Renaldi
