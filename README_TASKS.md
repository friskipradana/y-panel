# UI Panel Task Log

## Tujuan
Dokumen ini menjadi task tracker utama untuk setiap perbaikan dan penambahan fitur pada UI Panel. Setiap perubahan baru harus ditambahkan ke bagian **Task Updates** dan diringkas kembali pada bagian **Project Changelog**.

## Cara Update
1. Tambahkan entri baru di bagian **Task Updates** dengan tanggal, area, status, dan deskripsi singkat.
2. Jika perubahan berdampak ke user-facing feature, tambahkan juga ke **Project Changelog**.
3. Gunakan bahasa yang jelas agar riwayat pekerjaan mudah dilacak saat deploy atau troubleshooting.

## Task Updates

### 2026-04-05
- **[done] Backend / MariaDB persistence**  
  Menambahkan database manager MariaDB untuk bootstrap schema, penyimpanan runtime log, penyimpanan changelog, dan audit perubahan settings host.
- **[done] Frontend / Database observability**  
  Menambahkan window **Database** premium untuk memantau konektivitas MariaDB, jumlah row persistensi, dan preview runtime logs terbaru.
- **[done] Frontend / API-backed changelog**  
  Mengganti changelog hardcoded di desktop shell menjadi window khusus yang membaca data changelog dari backend runtime API.
- **[done] Installer / MariaDB provisioning**  
  Memperbarui installer Linux agar dapat memastikan MariaDB tersedia, membuat database/user otomatis, dan menuliskan env `PANEL_DB_*` ke runtime service.
- **[done] Admin CLI / Database password rotation**  
  Menambahkan command `ui-panel reset-db-password` untuk mengganti password user database runtime dan restart service otomatis.
- **[done] Frontend / Settings responsiveness**  
  Memperbaiki layout window **Settings** agar lebih responsif pada ukuran window sempit, termasuk hero header yang lebih adaptif dan grid section yang tidak saling bertabrakan.
- **[done] Frontend / Settings quick launch**  
  Menambahkan shortcut **Settings** pada quick launch taskbar agar konfigurasi host dapat dibuka lebih cepat dari desktop shell.
- **[done] Frontend / Settings window**  
  Menambahkan window **Settings** baru dengan form premium untuk mengubah hostname, timezone, dan nameserver terkelola langsung dari panel.
- **[done] Backend / Settings API**  
  Menambahkan endpoint `GET/POST /api/v1/settings/system` untuk membaca dan menerapkan perubahan hostname, timezone, serta DNS nameserver host Linux.
- **[done] Backend / Host settings runtime**  
  Menambahkan helper backend untuk membaca snapshot settings host dan menulis konfigurasi DNS terkelola pada `systemd-resolved`.
- **[done] Runtime / Terminal**  
  Memperbaiki rendering output terminal host agar prompt, command echo, dan hasil respon tetap berurutan tanpa duplikasi saat reconnect.
- **[done] Backend / HTTP middleware**  
  Memperbaiki wrapper access log di `internal/httpserver/server.go` agar tetap meneruskan interface `Hijacker`, `Flusher`, dan `Pusher`, sehingga websocket terminal tetap bisa upgrade normal.
- **[done] Frontend / Observability**  
  Menambahkan runtime logger pada alur autentikasi, lifecycle aplikasi, dan terminal untuk membantu analisis error dari sisi browser.
- **[done] Admin CLI**  
  Menambahkan command `ui-panel reset-password` pada installer Linux untuk memperbarui `PANEL_ADMIN_PASSWORD` dan restart service otomatis.
- **[done] Desktop UI / Taskbar**  
  Menambahkan shortcut taskbar untuk membuka changelog dan viewer system logs secara terpisah.
- **[done] Backend / System logs API**  
  Menambahkan endpoint `GET /api/v1/system/logs` yang membaca `journalctl` service host secara aman melalui backend.
- **[done] Frontend / System logs viewer**  
  Menambahkan window `System Logs` dengan auto-refresh 5 detik, filter service, dan pilihan jumlah baris log.
- **[done] Documentation**  
  Menambahkan task tracker ini dan memastikan changelog in-app ikut diperbarui sesuai perubahan terbaru.

## Project Changelog

### [0.7.0] - 2026-04-05
### Added
- Dedicated **Database** desktop window untuk memantau health MariaDB, runtime logs, changelog rows, dan audit settings.
- Backend persistence layer MariaDB untuk runtime logs, changelog entries, dan audit trail perubahan settings.
- Installer Linux otomatis untuk provisioning MariaDB serta penulisan env `PANEL_DB_*`.
- CLI `reset-db-password` untuk rotasi password MariaDB runtime dengan restart service otomatis.
- Window **Changelog** baru yang mengambil data dari backend runtime API.

### Changed
- Window **System** sekarang menampilkan ringkasan health MariaDB.
- Changelog in-app tidak lagi hardcoded dan kini mengikuti data runtime backend.
- Server backend menutup koneksi database dengan rapi saat shutdown.

### [0.6.0] - 2026-04-05
### Added
- **Settings** quick-launch entry on the taskbar for opening runtime configuration faster.
- Dedicated **Settings** window for editing hostname, timezone, and managed nameserver values.
- Backend endpoint pair `GET /api/v1/settings/system` and `POST /api/v1/settings/system` for authenticated host settings management.
- Linux host settings runtime helper for reading settings snapshots and writing managed DNS configuration for `systemd-resolved` hosts.

### Changed
- Improved the **Settings** window layout so the hero panel, cards, and action area stay readable on narrower window sizes.
- Increased the default **Settings** window size so the responsive layout starts in a more usable state.
- In-app changelog entries now include the new Settings and host configuration work.
- Desktop shell now routes the `settings` window kind to a dedicated settings editor instead of reusing system summary content.

### v0.5.0 — 2026-04-05
- Added dedicated **System Logs** window backed by backend `journalctl` access.
- Fixed websocket upgrade regression caused by access-log middleware response wrapping.
- Added taskbar shortcuts for **System Logs** and **Changelog**.
- Added CLI `reset-password` flow for rotating admin credentials safely.
- Expanded runtime observability across frontend auth and terminal flows.

### v0.4.0 — 2026-04-05
- Simplified login screen UX.
- Stabilized host terminal execution through Go agent.
- Improved deployment workflow safety.
