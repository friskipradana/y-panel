# Security Hardening

## Runtime Flags

Gunakan environment variable berikut untuk mengurangi blast radius panel di production:

- `PANEL_TERMINAL_ENABLED=true|false`
  - default: `true`
  - set `false` untuk mematikan host terminal sepenuhnya

- `PANEL_TERMINAL_ALLOW_REMOTE=true|false`
  - default: `false`
  - mengizinkan terminal SSH remote dari panel

- `PANEL_ADMIN_FILE_ROOT_ACCESS=true|false`
  - default: `false`
  - jika `true`, admin dapat browse root filesystem host

## Perubahan Perilaku Default

Mulai hardening ini:

- admin **tidak lagi** otomatis punya akses file manager ke `/`
- file manager memblokir path sistem sensitif seperti:
  - `/proc`
  - `/sys`
  - `/dev`
  - `/boot`
  - `/run`
  - `/etc/shadow`
  - `/root/.ssh`
- terminal SSH remote dimatikan secara default
- terminal lokal **tidak** membuat root shell langsung; session berjalan sebagai user OS yang dipetakan dari akun panel
- untuk role `superadmin`, agent membuat sudoers drop-in `NOPASSWD` untuk mapped OS user sehingga `sudo su` / `sudo -i` tidak meminta password OS terpisah
- eskalasi root tetap dilakukan manual dari dalam shell memakai `sudo`, mengikuti policy `/etc/sudoers` host

## Capability-Based Authorization

Selain role, backend sekarang juga memakai capability explicit untuk aksi sensitif.

### Default capability map

#### `superadmin`
- `terminal.access`
- `terminal.remote`
- `files.write`
- `files.delete`
- `files.chmod`
- `files.extract`
- `docker.deploy`
- `docker.lifecycle`
- `docker.network.manage`
- `docker.image.manage`
- `docker.template.manage`
- `system.settings.write`
- `database.truncate`
- `panel.primary.reset_password`

#### `admin`
- `terminal.access`
- `files.write`
- `files.delete`
- `files.chmod`
- `files.extract`
- `docker.deploy`
- `docker.lifecycle`
- `docker.network.manage`
- `docker.image.manage`
- `docker.template.manage`
- `system.settings.write`

#### `user`
- belum diberikan capability sensitif secara default

> [!NOTE]
> Pada fase ini capability masih **diturunkan dari role di backend**, belum editable dari UI.

## Reconciliation & Drift Detection

Project API sekarang mulai mengekspos runtime reconciliation ringan:

- `running`: status cepat untuk kompatibilitas existing response
- `runtime.known`: apakah process runtime dikenal oleh agent saat ini
- `runtime.status`: status runtime hasil observasi (`active` / `stopped`)
- `runtime.drift`: apakah status DB berbeda dengan runtime aktual
- `runtime.driftReason`: alasan drift jika terdeteksi

Contoh kasus drift:
- DB bilang `active`, tetapi agent restart dan process tidak lagi dikenal
- DB bilang `stopped`, tetapi process ternyata masih berjalan

> [!WARNING]
> Untuk project non-Docker, runtime state masih bergantung pada state in-memory agent. Setelah restart agent, state runtime lama tidak dianggap source of truth penuh dan akan ditandai sebagai drift bila bertentangan dengan status DB.

## Background Reconcile Tick

Agent sekarang menjalankan reconcile tick periodik untuk project status.

Aturan sinkronisasi saat ini konservatif:
- `active` + runtime tidak berjalan → `degraded`
- `stopped` + runtime berjalan → `active`
- `error` / `degraded` + runtime berjalan → `active`

Arti `degraded`:
- panel mengharapkan workload aktif
- tetapi runtime aktual tidak sehat / tidak terkonfirmasi
- agent **tidak** otomatis melakukan restart pada fase ini

> [!IMPORTANT]
> Loop ini fokus pada observability dan status sync, bukan auto-healing agresif.

## Operator Remediation Flow

Panel sekarang menyediakan alur observability → remediation untuk project drift/degraded:

1. **Taskbar/Profile attention badge** menampilkan jumlah workload yang butuh perhatian.
2. **System Overview** menampilkan kartu health project dan recent reconcile incidents.
3. Klik incident akan membuka **Projects** dengan:
   - `attentionOnly=true`
   - filter typed `all` / `drift` / `degraded`
   - project target di-highlight dan otomatis di-scroll ke viewport
   - konteks incident asli: message, timestamp, dan metadata
4. Banner **Focused remediation target** menyediakan aksi cepat:
   - refresh reconcile
   - start / stop project
   - open working directory di File Manager
   - open filtered System Logs
   - copy working directory path
   - copy inspect command untuk handoff ke terminal

> [!NOTE]
> Aksi quick remediation tetap melewati authorization/capability backend yang sama dengan aksi manual di Projects, File Manager, Terminal, dan System Logs.

## Rekomendasi Production

Rekomendasi minimum:

```env
PANEL_TERMINAL_ENABLED=false
PANEL_TERMINAL_ALLOW_REMOTE=false
PANEL_ADMIN_FILE_ROOT_ACCESS=false
```

Jika terminal tetap dibutuhkan di production:

```env
PANEL_TERMINAL_ENABLED=true
PANEL_TERMINAL_ALLOW_REMOTE=false
PANEL_ADMIN_FILE_ROOT_ACCESS=false
```

## Audit Logging

Aksi sensitif berikut sekarang tercatat ke `runtime_logs` dengan service `security`:

- `terminal.start`
- `terminal.close`
- `file.write`
- `file.delete`
- `file.rename`
- `file.move`
- `file.chmod`
- `file.extract`

## Akun Demo (opsional)

Instance publik dapat membuka satu akun demo yang hanya bisa melihat. Aktifkan dengan environment berikut lalu restart agent:

```bash
RENEO_DEMO_PASSWORD=ganti-dengan-password-demo   # minimal 8 karakter; kosong = demo mati
RENEO_DEMO_USERNAME=demo                          # opsional, default "demo"
```

Perilaku:

- Akun dibuat otomatis dengan role `user`, kuota nol, tanpa akun OS. Password dari env diterapkan ulang tiap agent start.
- Tiga proyek contoh (status `stopped`, tanpa direktori dan port) diisi sekali agar jendela Projects tidak kosong; akun demo tidak dapat menjalankannya.
- Hanya endpoint pada allowlist (`internal/httpserver/handlers_demo.go`) yang bisa dipanggil; endpoint baru otomatis ditolak dengan 403. Tidak ada data bersama atau global di daftar itu (docs, image, network, changelog, pengaturan).
- Terminal, file, pengaturan, user, database, log sistem, Cloudflare, token API, dan semua aksi tulis ditolak, termasuk menyimpan tata letak widget (tata letak demo hanya tersimpan di peramban pengunjung, jadi satu pengunjung tidak meninggalkan isi untuk pengunjung lain).
- Ringkasan sistem menyembunyikan hostname, kernel, path state, dan detail database.
- Username dan password tampil di landing page (`GET /api/v1/public/demo`). Pakai password yang tidak dipakai di tempat lain.

## Situs Publik dan Mode Hosting

Tiga saklar superadmin (Settings > General dan Settings > Hosting) disimpan di `site-settings.json` pada state directory:

- **Landing page mati:** tidak ada halaman publik. `/` mengarah ke `/login` (atau `/home` bila sudah masuk), `/articles`, `/install`, `/docs/mcp`, sitemap dan llms.txt menjawab 404, dan data publik (`/api/v1/public/docs`, `doc-images`, `contributors`) ikut 404. Yang tetap terbuka: `/login`, `/robots.txt` (menutup semua crawler), endpoint MCP, dan `GET /api/v1/public/site`.
- **Indeksing mati:** `robots.txt` berisi `Disallow: /`, sitemap dan llms.txt 404, setiap halaman berheader `X-Robots-Tag: noindex, nofollow`.
- **Mode hosting mati:** tidak ada akun demo (dimatikan dan ditangguhkan saat saklar dimatikan; menyalakan demo lebih dulu ditolak 409). Instalasi lama yang demonya sudah menyala otomatis memakai mode hosting aktif.

## Paket Hosting

- Hanya superadmin yang mengelola paket dan menetapkannya ke akun; semua endpoint ubah menjawab 409 selama mode hosting mati. Superadmin sendiri tidak bisa diberi paket.
- Data publik (`/api/v1/public/hosting`) hanya memuat isi paket yang tampil (tanpa id, jumlah akun, atau batas CPU) dan kosong bila mode hosting atau landing page mati.
- Tautan pemesanan hanya menerima `https://`, `http://`, dan `mailto:`; skema lain (`javascript:`, `data:`) ditolak.
- Penangguhan karena masa berlaku ditandai (`suspended_for_expiry`): perpanjangan hanya mengaktifkan akun yang ditangguhkan oleh pemeriksa, tidak yang ditangguhkan manual. Pemeriksa tidak berjalan saat mode hosting mati.

## Isolasi Akun (gaya hosting)

Setiap akun bekerja di areanya sendiri. Yang membedakan hanya cakupannya:

| Peran | Cakupan | Jendela |
| :--- | :--- | :--- |
| `superadmin` | Seluruh mesin dan semua akun | Semua, termasuk log sistem, info host, database runtime, pengaturan host |
| `admin` | Dirinya dan akun yang ia buat (kolom `users.parent_id`, turunan bertingkat) | Semua kecuali yang khusus superadmin; mengelola user turunannya |
| `user` / demo | Hanya dirinya | Docker, terminal, file, database, project, Cloudflare, widget, pengaturan pribadi |

Aturan yang diterapkan agent:

- Terminal berjalan sebagai akun OS milik akun itu (`runuser`), tanpa sudo. Sudo hanya untuk superadmin.
- File manager dibatasi ke home dan folder project akun. Folder state panel (kredensial semua akun) hanya untuk superadmin.
- Container, image, network, template, project, database, dan token Cloudflare dipisah per pemilik; admin juga melihat milik turunannya.
- Info host (hostname, OS, kernel, uptime, IP, NIC, riwayat metrik, Docker/Portainer) hanya untuk superadmin. Akun lain melihat CPU, RAM, dan storage miliknya sendiri terhadap kuota yang ditetapkan (`GET /api/v1/system/summary` dengan `scoped: true`, juga di live socket).
- Pengaturan host (hostname, DNS, port, origin, update, payment), log sistem, dan database runtime hanya untuk superadmin.
- Akun yang sudah ada sebelum migrasi `000014` menjadi turunan superadmin; superadmin dapat memindahkannya.
- Batas CPU dan memori dari kuota dipaksa pada container dan pada shell: terminal dan `POST /api/v1/terminal/exec` berjalan di dalam slice systemd `reneo-<akun>.slice` dengan `CPUQuota`, `MemoryMax`, dan `TasksMax`. Tanpa systemd (atau bukan Linux) batas shell tidak dapat dipaksa dan perintah berjalan tanpa slice; angka pemakaian tetap tampil.
- Tool MCP mengikuti matriks yang sama: tool yang menyentuh mesin langsung (terminal root, file seluruh server, Docker penuh, firewall, disk, PostgreSQL panel, log sistem, pengaturan) hanya untuk superadmin. Admin dan user mendapat tool setara yang memanggil REST API dengan token mereka (`terminal_exec` sebagai akun OS sendiri, file di home dan project, container milik sendiri).
- Superadmin memindahkan akun ke admin lain lewat window Users (ikon jaringan) atau `PATCH /api/v1/users/{id}` dengan `parentId`; siklus ditolak.

## Alamat database dan probe jaringan

- Alamat publik sebuah database (halaman penuh `/database/<kunci>`, pintu masuk Adminer `/api/v1/db-open/<kunci>`, dan proxy `/adminer/<kunci>/`) memakai kunci buram, bukan ID numerik. Kunci adalah HMAC-SHA256 dari ID dengan `PANEL_ENCRYPTION_KEY`, tidak bisa ditebak atau dihitung dari ID tanpa rahasia itu. Setiap pemakaian tetap diperiksa terhadap pemilik yang sedang login.
- Proxy Adminer hanya menerima login ke server database yang terikat pada kunci itu, tidak ke database lain milik akun yang sama.
- Widget dan alat ping terbuka untuk semua akun kecuali demo. Selain superadmin, target di-resolve dan hanya alamat publik yang diizinkan (bukan loopback, privat, link-local, CGNAT, atau alamat khusus); probe dikirim ke alamat yang sudah diperiksa, sehingga jawaban DNS tidak dapat berubah di antara pemeriksaan dan pemakaian.
