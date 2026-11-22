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

Tiga saklar superadmin (Settings > General dan jendela Hosting) disimpan di `site-settings.json` pada state directory:

- **Landing page mati:** tidak ada halaman publik. `/` mengarah ke `/login` (atau `/home` bila sudah masuk), `/articles`, `/install`, `/docs/mcp`, sitemap dan llms.txt menjawab 404, dan data publik (`/api/v1/public/docs`, `doc-images`, `contributors`) ikut 404. Yang tetap terbuka: `/login`, `/robots.txt` (menutup semua crawler), endpoint MCP, dan `GET /api/v1/public/site`.
- **Indeksing mati:** `robots.txt` berisi `Disallow: /`, sitemap dan llms.txt 404, setiap halaman berheader `X-Robots-Tag: noindex, nofollow`.
- **Mode hosting mati:** tidak ada akun demo (dimatikan dan ditangguhkan saat saklar dimatikan; menyalakan demo lebih dulu ditolak 409). Instalasi lama yang demonya sudah menyala otomatis memakai mode hosting aktif.

## Paket Hosting

- Hanya superadmin yang mengelola paket dan menetapkannya ke akun; semua endpoint ubah menjawab 409 selama mode hosting mati. Superadmin sendiri tidak bisa diberi paket.
- Data publik (`/api/v1/public/hosting`) hanya memuat isi paket yang tampil (tanpa id, jumlah akun, atau batas CPU) dan kosong bila mode hosting atau landing page mati.
- Tautan pemesanan hanya menerima `https://`, `http://`, dan `mailto:`; skema lain (`javascript:`, `data:`) ditolak.
- Penangguhan karena masa berlaku ditandai (`suspended_for_expiry`): perpanjangan hanya mengaktifkan akun yang ditangguhkan oleh pemeriksa, tidak yang ditangguhkan manual. Pemeriksa tidak berjalan saat mode hosting mati.

## Subdomain Pembeli (alamat panel)

Subdomain yang dijual adalah alamat panel Reneo milik pembeli. Tunnel `reneo-hosting` mengarahkan semua subdomain ke panel itu sendiri (`http://localhost:<port panel>`), bukan ke project. Setelah masuk, pembeli menghubungkan Cloudflare miliknya sendiri untuk project-nya.

- Nama dibatasi 3 sampai 32 karakter (huruf kecil, angka, tanda hubung tunggal di dalam), tanpa `--` (nama internasional dan tiruan), dan daftar kata dicadangkan (`www`, `mail`, `admin`, `api`, `panel`, `reneo`, dan sejenisnya) ditolak.
- Nama yang sudah punya record DNS apa pun di zona itu (A, MX, TXT, CNAME) tidak bisa diambil, sehingga situs atau surel yang ada tidak bisa dibajak. Hanya CNAME ke tunnel `reneo-hosting` yang dianggap milik sistem.
- Hanya domain dari akun Cloudflare superadmin yang dipilih superadmin (daftar zona dari Cloudflare, bukan dari input) yang ditawarkan.
- Di alamat panel milik pembeli hanya akun pemiliknya yang bisa masuk atau memakai sesi: login akun lain ditolak dengan jawaban yang sama seperti kata sandi salah (sesi yang sempat dibuat langsung dicabut), dan API di host itu menolak akun lain dengan 403. Host subdomain dikenali dari tabel `hosting_subdomains` (cache 15 detik). Kuota mengikuti paket (`maxSubdomains`); tanpa paket tidak bisa membuat.
- Tunnel `reneo-hosting` dipisah dari tunnel superadmin sendiri; token Cloudflare superadmin tidak pernah dikirim ke pembeli. Pengecekan nama dibatasi 30 permintaan per menit per akun agar jatah API Cloudflare tidak habis.
- Akun yang ditangguhkan (paket berakhir setelah masa tenggang, atau manual), subdomain yang ditangguhkan superadmin, dan mode hosting mati menghentikan penyajian dan menghapus record DNS-nya; semuanya kembali saat akun diaktifkan lagi. Sinkronisasi berjalan ulang tiap 15 menit untuk memperbaiki panggilan yang gagal.

## Manajemen Akun dan Paket

- Akun yang dibuat atau di-reset password-nya oleh admin diberi tanda `users.must_change_password` (bawaan nyala, bisa dimatikan di formulir). Selama tanda itu ada, sesi akun hanya bisa memanggil `GET /api/v1/me`, `POST /api/v1/me/password`, dan `POST /api/v1/auth/logout`; yang lain dijawab 403 `password_change_required`, dan antarmuka menampilkan layar ganti password (`PasswordGate`) sebagai pengganti desktop. Tanda dicabut saat akun mengganti passwordnya sendiri (yang baru harus berbeda dari yang lama).
- Setelah membuat akun atau reset password, dialog `AccessShareModal` menyusun pesan akses (alamat panel, username, password sementara) untuk disalin atau dikirim lewat WhatsApp/email. Password hanya terlihat pada dialog itu. Superadmin bisa sekaligus membuat alamat panel akun (`POST /api/v1/hosting/subdomains`, kuota paket tidak berlaku).

- Data paket pada daftar akun (`hosting` per akun, hitungan di `/api/v1/users/summary`, dan filter `plan`/`planState`) hanya diberikan kepada superadmin dengan mode hosting aktif; admin hanya melihat akun di bawahnya tanpa data paket. Nilai filter yang tidak dikenal diabaikan dan tidak pernah sampai ke SQL (semuanya parameter).
- Memberi paket saat membuat akun hanya boleh superadmin dan diperiksa sebelum akunnya dibuat, sehingga paket yang salah tidak meninggalkan akun setengah jadi.
- Menghapus akun melepas DNS subdomainnya lebih dulu; menangguhkan, mengaktifkan, atau menghapus akun menjalankan sinkronisasi subdomain segera, tidak menunggu pemeriksa 15 menit.

## Mesin Speed Test

- **Google (M-Lab NDT7):** agent memakai protokol terbuka NDT7 langsung (Locate API M-Lab memberi server dan token bertanda tangan). Hasil tes dipublikasikan M-Lab secara terbuka beserta alamat IP server; antarmuka menyebutnya sebelum dipilih.
- **Speedtest.net dan CBN (Ookla):** hanya lewat klien resmi `speedtest` (bukan skrip tidak resmi, yang diblokir Ookla). Lisensi klien itu untuk pemakaian pribadi nonkomersial, jadi agent tidak menyetujuinya sendiri: flag `--accept-license` baru dipakai setelah superadmin menekan persetujuan (`ooklaLicenseAccepted` di `site-settings.json`, tercatat di audit). Ookla menyimpan hasil dan membuat tautan publik.
- Klien dicari berurutan: `RENEO_SPEEDTEST_BIN`, salinan milik agent di `<state>/bin/speedtest`, lalu `speedtest` di PATH. Yang dipakai hanya yang menyebut "by Ookla" di `--version` (klien Python `speedtest-cli` ditolak). Installer dan tombol "Pasang klien Ookla" (hanya superadmin, `POST /api/v1/speedtest/cli/install`) memasang dari arsip resmi `install.speedtest.net` ke folder state, bukan lewat paket apt `speedtest` yang bentrok dengan `speedtest-cli` di `/usr/bin/speedtest`. Arsip dicek terhadap sha256 yang dipatok per arsitektur sebelum dibuka, hanya berkas `speedtest` yang diekstrak, dan hasilnya harus berjalan sebagai klien Ookla sebelum dipindahkan ke tempatnya. Memasang klien tidak menyetujui lisensinya. Id server hanya angka (1 sampai 9 digit) dan dipassing sebagai argumen tanpa shell. Satu tes berjalan sekali waktu; proses dihentikan bila permintaan ditutup.

## Isolasi Akun (gaya hosting)

Setiap akun bekerja di areanya sendiri. Yang membedakan hanya cakupannya:

| Peran | Cakupan | Jendela |
| :--- | :--- | :--- |
| `superadmin` | Seluruh mesin dan semua akun | Semua, termasuk log sistem, info host, database runtime, pengaturan host |
| `admin` | Dirinya dan akun yang ia buat (kolom `users.parent_id`, turunan bertingkat) | Semua kecuali yang khusus superadmin; mengelola user turunannya |
| `user` / demo | Hanya dirinya | Docker, terminal, file, database, project, Cloudflare, widget, pengaturan pribadi |

Aturan yang diterapkan agent:

- Terminal berjalan sebagai akun OS milik akun itu (`runuser`), tanpa sudo. Sudo hanya untuk superadmin.
- Lingkungan shell bersih: tidak mewarisi apa pun dari agent (session secret, DSN database, kunci enkripsi). Hanya `PATH` sistem, `LANG`, `SHELL`, `TERM`, `COLORTERM`, serta `HOME`, `USER`, `LOGNAME` akun itu. Hal yang sama berlaku untuk `POST /api/v1/terminal/exec` dan proses project.
- Sesi terminal milik akun yang membuatnya: WebSocket dan penutupan sesi memeriksa pemilik, dan id milik orang lain dijawab sama dengan id yang tidak ada (404). Sesi ditutup saat akun disuspend (manual atau karena paket berakhir), dihapus, atau role/statusnya diubah. Batas 8 sesi per akun dan 64 sesi total (429 bila terlampaui); ukuran jendela dibatasi 500x200.
- Target SSH remote hanya `[user@]host` (huruf, angka, titik, minus, garis bawah; tidak boleh diawali minus) dan diberikan setelah `--`, sehingga tidak bisa dibaca sebagai opsi ssh (`-oProxyCommand=...`). ssh berjalan sebagai akun OS pemakai, bukan sebagai agent, jadi kunci SSH root tidak terpakai.
- Folder awal terminal adalah home akun. Selain superadmin, folder yang diminta harus ada di dalam home setelah symlink diselesaikan. Home akun diberi mode 0700 agar akun lain tidak bisa membaca berkasnya. Menutup sesi membunuh seluruh grup proses shell, bukan hanya shell-nya.
- File manager dibatasi ke home dan folder project akun. Folder state panel (kredensial semua akun) hanya untuk superadmin.
- Container, image, network, template, project, database, dan token Cloudflare dipisah per pemilik; admin juga melihat milik turunannya.
- Info host (hostname, OS, kernel, uptime, IP, NIC, riwayat metrik, Docker) hanya untuk superadmin. Akun lain melihat CPU, RAM, dan storage miliknya sendiri terhadap kuota yang ditetapkan (`GET /api/v1/system/summary` dengan `scoped: true`, juga di live socket).
- Pengaturan host (hostname, DNS, port, origin, update, payment), log sistem, dan database runtime hanya untuk superadmin.
- Akun yang sudah ada sebelum migrasi `000014` menjadi turunan superadmin; superadmin dapat memindahkannya.
- Batas CPU dan memori dari kuota dipaksa pada container dan pada shell: terminal dan `POST /api/v1/terminal/exec` berjalan di dalam slice systemd `reneo-<akun>.slice` dengan `CPUQuota`, `MemoryMax`, dan `TasksMax`. Tanpa systemd (atau bukan Linux) batas shell tidak dapat dipaksa dan perintah berjalan tanpa slice; angka pemakaian tetap tampil.
- Tool MCP mengikuti matriks yang sama: tool yang menyentuh mesin langsung (terminal root, file seluruh server, Docker penuh, firewall, disk, PostgreSQL panel, log sistem, pengaturan) hanya untuk superadmin. Admin dan user mendapat tool setara yang memanggil REST API dengan token mereka (`terminal_exec` sebagai akun OS sendiri, file di home dan project, container milik sendiri).
- Superadmin memindahkan akun ke admin lain lewat window Users (ikon jaringan) atau `PATCH /api/v1/users/{id}` dengan `parentId`; siklus ditolak.

## Alamat database dan probe jaringan

- Alamat publik sebuah database (halaman penuh `/database/<kunci>`, pintu masuk Adminer `/api/v1/db-open/<kunci>`, dan proxy `/adminer/<kunci>/`) memakai kunci buram, bukan ID numerik. Kunci adalah HMAC-SHA256 dari ID dengan `PANEL_ENCRYPTION_KEY`, tidak bisa ditebak atau dihitung dari ID tanpa rahasia itu. Setiap pemakaian tetap diperiksa terhadap pemilik yang sedang login.
- Proxy Adminer hanya menerima login ke server database yang terikat pada kunci itu, tidak ke database lain milik akun yang sama.
- Widget dan alat ping terbuka untuk semua akun kecuali demo. Selain superadmin, target di-resolve dan hanya alamat publik yang diizinkan (bukan loopback, privat, link-local, CGNAT, atau alamat khusus); probe dikirim ke alamat yang sudah diperiksa, sehingga jawaban DNS tidak dapat berubah di antara pemeriksaan dan pemakaian.

## Container akun hosting tidak boleh menjangkau host

Portainer dan alat sejenisnya (Yacht, Dockge, Komodo, Lazydocker, Watchtower, dan lain-lain) mengendalikan Docker daemon. Container yang bisa menjangkau daemon, namespace, perangkat, atau folder host dapat melihat dan mengubah semua container akun lain, jadi **hanya superadmin** yang boleh menjalankannya. Aturannya ada di `internal/docker/policy.go`:

- **Ditolak saat deploy** (image maupun compose, termasuk template): image manajemen container, `docker.sock` atau `containerd.sock`, `privileged`, namespace `host` (`pid`, `ipc`, `uts`, `userns_mode`, `network_mode`), capability berbahaya (`SYS_ADMIN`, `SYS_PTRACE`, `SYS_MODULE`, `ALL`, dan sejenisnya), `security_opt` unconfined, `devices`, dan bind mount di luar folder pemilik. Jalur volume yang berupa symlink ke luar folder pemilik juga ditolak.
- **Diperiksa lagi setelah naik:** compose yang nilainya dibentuk dari variabel atau `.env` tidak terlihat dari teksnya, jadi container yang benar-benar berjalan diperiksa lewat `docker inspect`. Bila melanggar, project diturunkan dan deploy dibatalkan.
- **Disapu berkala:** tiap sekitar 2 menit agent memeriksa semua container berlabel pemilik. Container milik akun non-superadmin yang melanggar dihentikan, restart otomatisnya dimatikan, dan pemiliknya diberi notifikasi. Container tanpa pemilik (dibuat di luar panel) tidak disentuh.
