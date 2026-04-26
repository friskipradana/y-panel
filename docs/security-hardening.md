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
