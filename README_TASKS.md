# UI Panel Task Log

## Tujuan
Dokumen ini menjadi task tracker utama untuk setiap perbaikan dan penambahan fitur pada UI Panel. Setiap perubahan baru harus ditambahkan ke bagian **Task Updates** dan diringkas kembali pada bagian **Project Changelog**.

## Cara Update
1. Tambahkan entri baru di bagian **Task Updates** dengan tanggal, area, status, dan deskripsi singkat.
2. Jika perubahan berdampak ke user-facing feature, tambahkan juga ke **Project Changelog**.
3. Gunakan bahasa yang jelas agar riwayat pekerjaan mudah dilacak saat deploy atau troubleshooting.

## Task Updates

### 2026-04-05
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
