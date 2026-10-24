# Reneo

> Pembaruan kendali. Kesini aja. (sebelumnya YPanel; filosofi di [docs/FILOSOFI-RENEO.md](docs/FILOSOFI-RENEO.md))

![Halaman utama Reneo: hero, perintah pasang, dan pratinjau desktop](docs/images/landing-page.png)

**Reneo** adalah panel kontrol server Linux dengan antarmuka bergaya desktop. Frontend React 19 dan agent Go menyatukan Docker, project, database, file, terminal, Cloudflare, pengguna, dan agen AI (lewat MCP) dalam satu workspace visual, dengan tampilan desktop dan tampilan ponsel.

Cocok untuk homeserver, VPS pribadi, dan server kecil-menengah yang membutuhkan panel ringan, self-hosted, dan nyaman dipakai.

## Pasang

Di server Linux (Ubuntu, Debian, RHEL dan turunannya; amd64 atau arm64):

```bash
curl -fsSL https://panel.reneo.my.id/install | sudo bash
```

Lalu buka `http://IP-SERVER:8787` dan selesaikan penyiapan pertama untuk membuat akun superadmin.

| Perintah | Fungsi |
| :--- | :--- |
| `systemctl status reneo` | Status service |
| `journalctl -u reneo -f` | Log langsung |
| `sudo reneo` | Menu pengelolaan (password, port, origin) |
| `sudo reneo status` / `start` / `stop` / `restart` | Ringkasan dan kendali service (`status` keluar 3 bila tidak sehat) |
| `sudo reneo logs -f` | Log langsung (`-n N` jumlah baris) |
| `sudo reneo doctor` | Periksa service, port, kesehatan, database, Docker, dan disk |
| `sudo reneo info` / `config [KEY]` / `version` | Alamat dan lokasi berkas, isi konfigurasi (rahasia disamarkan), versi |
| `sudo reneo seed-plans` | Pasang paket hosting contoh (Starter, Pro, Bisnis); tanpa `--force` hanya menambah yang belum ada, `--force` menimpa yang berbeda setelah konfirmasi, `--dry-run` hanya menampilkan |
| `sudo reneo help` | Semua perintah |

CLI `reneo` hanya untuk root dan superadmin panel lewat sudo: berkasnya `root:root` mode 750, akun admin dan user panel tidak punya sudo, dan akun `panel-*` tanpa izin sudo superadmin ditolak. Perintah pemeliharaan agent (`reset-primary-password`, `migrate`, `seed-plans`) juga menolak pengguna selain root. Perintah yang mengubah data dicatat di journal (`journalctl -t reneo-cli`).
| `sudo reneo check-update` / `sudo reneo update` | Cek dan terapkan pembaruan |
| `sudo bash /opt/reneo/installer/uninstall.sh` | Mencopot |

Opsi installer: `--bind ADDR`, `--yes`, `--skip-start`. Detail: [Installer Architecture](docs/installer-architecture.md).

## Fitur

### Desktop dan ponsel

- taskbar, dock, window manager, widget (jam, sistem, jaringan, grafik CPU, sticky note, ping), palet perintah
- layout ponsel otomatis di bawah 768px (`?ui=mobile` / `?ui=desktop` memaksa sekali muat): satu aplikasi layar penuh, navigasi bawah, notifikasi, urutan dan kunci widget terpisah dari desktop
- tema terang/gelap, bahasa Indonesia dan Inggris

### Docker

- container, image, network, template compose, deploy dari image atau compose
- log realtime, start/stop/restart/hapus, audit runtime

### Project

Tipe yang dapat dijalankan: `static` (SPA fallback), `nodejs`, `python`, `php`, `custom` (`start.sh`). Direktori kerja dikunci ke home pemilik, proses hanya menerima environment minimal, port dialokasi dari blok per akun. Detail: [artikel resmi](docs/articles/project-dan-runtime.md).

### Database

Window **Database** membuat database milik user sebagai container terpisah (PostgreSQL, MySQL, MariaDB, MongoDB, Redis), terikat ke `127.0.0.1`, dengan kuota per akun. Tombol **Kelola database** menyediakan, tanpa memasang phpMyAdmin atau aplikasi lain:

- tabel: daftar, isi per halaman, form pembuat tabel, hapus tabel
- konsol SQL (Redis: konsol perintah)
- user dan izin (baca saja, baca-tulis, penuh) untuk PostgreSQL, MySQL, MariaDB
- ganti atau buat password

Container database juga tampil di window Docker dengan lencana "Database" (hapus hanya dari window Database), dan pengelola penuh dapat dibuka di tab sendiri pada `/database/{id}` (tetap di balik login panel).

Info database internal Reneo dan log sistem hanya untuk superadmin di Settings.

### Cloudflare

Token per user, tunnel, DNS, aturan redirect, dan publikasi project lewat tunnel.

### Pengguna dan akses

- role `superadmin`, `admin`, `user`; admin hanya mengelola user biasa, hanya superadmin memberi role admin
- kuota project, tunnel, database, disk, CPU, memori, dengan tampilan pemakaian
- reset password oleh admin, ganti password sendiri, suspend/hapus menghentikan beban kerja akun
- **akun demo hanya-baca** (lihat di bawah)

### Docs dan artikel publik

- window Docs menulis artikel dengan markdown dan pratinjau
- artikel berstatus terbit dan "terbuka untuk umum" dibaca tanpa login di `/articles` dan `/articles/{slug}`
- **artikel resmi tersinkron**: panel membaca [docs/articles](docs/articles) dari repository ini lewat GitHub (cache 1 jam), sehingga instalasi di mana pun, dengan database berbeda, menampilkan dokumentasi yang sama. Artikel buatan sendiri tetap milik panel itu. Matikan dengan `RENEO_DOCS_SYNC=false`.

### Changelog

Mengikuti GitHub Releases proyek (cache 1 jam, fallback ke entri lokal bila offline).

### MCP untuk agen AI

Server MCP di `/mcp` dengan token API, tool mengikuti role. Panduan publik di `/docs/mcp`. Lihat [docs/mcp.md](docs/mcp.md).

### Terminal, file, sistem

Terminal host (Xterm.js), file manager dan editor Monaco, monitoring host, update panel dari UI atau CLI.

## Mudah ditemukan mesin pencari dan AI

Halaman publik (`/`, `/articles`, `/docs/mcp`) memuat meta tag, Open Graph, JSON-LD, dan konten cadangan tanpa JavaScript. Agent juga menyajikan:

- `/robots.txt` (mengizinkan crawler dan bot AI utama, menutup `/api/`, `/home`, `/login`)
- `/sitemap.xml` (landing, MCP, daftar artikel, setiap artikel publik)
- `/llms.txt` (ringkasan produk dan daftar artikel untuk model bahasa)
- `/articles/{slug}.md` (markdown mentah tiap artikel publik)

Atur `RENEO_PUBLIC_URL=https://panel.domain-anda.com` agar tautan kanonik dan sitemap memakai alamat publik yang benar.

## Akun demo

Isi `RENEO_DEMO_PASSWORD` di environment agent (opsional `RENEO_DEMO_USERNAME`, bawaan `demo`) lalu restart. Akun hanya membaca: desktop, widget, ringkasan sistem, dan daftar project/container miliknya. Terminal, file, pengaturan, user, database, log, Cloudflare, dan semua aksi tulis ditolak; endpoint baru ditolak secara bawaan. Username dan password tampil di landing page, jadi pakai password yang tidak dipakai di tempat lain. Detail: [Security Hardening](docs/security-hardening.md).

## Konfigurasi environment

Nama `RENEO_*` diterima di mana pun `PANEL_*` dipakai.

| Variabel | Fungsi |
| :--- | :--- |
| `PANEL_BIND_ADDR` | Alamat dan port panel (bawaan `0.0.0.0:8787`) |
| `PANEL_DATABASE_DSN`, `PANEL_SESSION_SECRET` | Database panel dan rahasia sesi (diisi installer) |
| `PANEL_ENCRYPTION_KEY` | Kunci enkripsi token Cloudflare dan kredensial database user |
| `RENEO_PUBLIC_URL` | Alamat publik untuk sitemap dan tautan kanonik |
| `RENEO_DEMO_PASSWORD`, `RENEO_DEMO_USERNAME` | Mengaktifkan akun demo hanya-baca |
| `RENEO_UPDATE_CHECK=false` | Mematikan cek pembaruan dan changelog GitHub |
| `RENEO_UPDATE_REPO` | Repository GitHub sumber rilis |
| `RENEO_DOCS_SYNC=false`, `RENEO_DOCS_REPO` | Mematikan atau mengganti sumber artikel resmi |
| `PANEL_TERMINAL_ENABLED`, `PANEL_TERMINAL_ALLOW_REMOTE`, `PANEL_ADMIN_FILE_ROOT_ACCESS` | Pengerasan terminal dan file |

## Stack

- Frontend: React 19, Vite, TypeScript, Zustand, TanStack Query, Framer Motion, Tailwind v4 dan SCSS modul, Xterm.js, Monaco
- Backend: Go, PostgreSQL, Docker CLI, systemd/journalctl, Cloudflare API, migrasi SQL berversi

## Struktur repository

```txt
.
├── cmd/panel-agent/     # entrypoint agent Go
├── internal/            # paket backend
├── installer/           # installer Linux dan template service
├── deploy/              # script build dan deploy
├── docs/                # dokumentasi teknis, filosofi, dan artikel resmi (docs/articles)
├── public/              # aset statis frontend
├── src/                 # frontend React
├── scripts/             # release, validasi UI, ikon merek
├── CHANGELOG.md
└── README.md
```

Paket backend utama:

```txt
internal/
  auth/        session dan role/capability
  cloudflare/  API, tunnel, daemon cloudflared
  config/      konfigurasi runtime
  database/    PostgreSQL dan migrasi
  docker/      container, image, network, deploy, log
  docsync/     artikel resmi dari GitHub
  httpserver/  API, middleware, SEO, penyajian frontend
  mcp/         server MCP dan katalog tool
  metrics/     riwayat metrik host
  osuser/      akun Linux per user
  projects/    proses project, direktori kerja, environment
  runtimepath/ nama dan path runtime (reneo/ypanel)
  system/      statistik, log, pengaturan
  terminal/    sesi terminal
  updater/     cek dan terapkan pembaruan, GitHub Releases
  userdb/      database milik user (container) dan administrasinya
  users/       aturan akun dan kuota
```

## Pengembangan

Prasyarat: Go sesuai `go.mod`, Bun atau Node.js, Docker (untuk fitur Docker dan database), PostgreSQL.

```bash
bun install
bun run dev            # agent + UI
go run ./cmd/panel-agent
```

Validasi sebelum commit:

```bash
bun run lint
bun run check:ui       # aturan UI, harus 0 error
bun run build          # harus tanpa warning
go test ./...
```

Aturan UI ada di [DESIGN.md](DESIGN.md) dan `.agents/rules/`. Ikon `Sparkles`/`WandSparkles` dilarang dan diperiksa oleh `check:ui`.

Rilis: `bun run release:patch|minor|major` (memvalidasi, memperbarui CHANGELOG, membuat tag, push; workflow GitHub membangun installer).

## Deployment

```powershell
.\deploy\build.ps1 -HostName <host> -SshUsername <user> -SshPassword <password>
```

Skrip membangun frontend, membuat installer `.run`, mengunggah, memasang service, menjalankan migrasi, dan melakukan healthcheck.

## Migrasi database

```bash
reneo-agent migrate create <nama>
reneo-agent migrate up
reneo-agent migrate status
reneo-agent migrate rollback
```

Panduan: [Database Migrations](docs/database-migrations.md).

## Keamanan

Panduan lengkap: [Security Hardening](docs/security-hardening.md). Poin penting:

- aksi sensitif dilindungi role dan capability di backend, dengan audit
- proses project tidak mewarisi environment agent dan terkunci pada direktori home pemiliknya
- kredensial database user dienkripsi dan hanya dibuka untuk pemiliknya
- log sistem, database internal, dan runtime Reneo hanya untuk superadmin

## Dokumentasi

- [Artikel resmi](docs/articles) (disinkronkan ke setiap panel)
- [Installer Architecture](docs/installer-architecture.md)
- [MCP](docs/mcp.md)
- [Database Migrations](docs/database-migrations.md)
- [Security Hardening](docs/security-hardening.md)
- [Repository Structure](docs/architecture/repository-structure.md)
- [Backend Go Structure](docs/architecture/backend-go-structure.md)
- [Frontend Structure](docs/architecture/frontend-structure.md)

## Lisensi

Reneo menggunakan **Reneo Public Use License**.

Daftar kontributor ada di [halaman contributors GitHub](https://github.com/friskipradana/y-panel/graphs/contributors).

Semua orang boleh mengakses, mengunduh, memasang, menjalankan, dan memakai Reneo. Namun perubahan pada repository resmi, push commit, merge, release, atau tindakan maintainer hanya boleh dilakukan oleh owner atau contributor yang memiliki izin.

Detail lengkap tersedia di [LICENSE](LICENSE).
