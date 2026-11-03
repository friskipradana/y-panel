# Catatan Sesi & Keputusan Arsitektur Reneo

File ini menyimpan riwayat pembacaan, keputusan arsitektur penting, gotcha teknis, dan log pembaruan memori lintas sesi.

---

## Ringkasan Invarian & Gotcha Penting Codebase

1. **Invarian DOM Desktop Window**:
   - Di `src/components/desktop/Desktop.tsx`, array `windows` **diurutkan berdasarkan `id`** saat di-render, bukan berdasarkan `zIndex`. Urutan tumpukan visual murni diatur oleh properti CSS `z-index` (dari `src/lib/zLayers.ts`). Jangan mengubah urutan array DOM saat fokus berpindah agar iframe atau kanvas xterm di `HostTerminalWindow` tidak mengalami *remount*.
2. **Pemisahan Locale Publik vs Desktop (`vite.config.ts`)**:
   - Kamus bahasa tetap ditulis di satu tempat per bahasa (`src/lib/locales/id.ts` dan `src/lib/locales/en.ts`).
   - Plugin Vite `localeSplit()` otomatis memisahkan key ber-prefix publik (`PUBLIC_LOCALE_PREFIXES`) ke bundel publik. Jika menambah halaman publik baru dengan namespace baru, daftarkan prefix-nya di `PUBLIC_LOCALE_PREFIXES` pada `vite.config.ts`.
3. **Aturan 5 Titik Pendaftaran Window Baru**:
   - Setiap penambahan window wajib mendaftarkan:
     1. `WindowKind` di `src/types/index.ts`
     2. `DEFAULTS` di `src/store/windowStore.ts`
     3. `WINDOW_CONTENT` di `src/components/desktop/windowRegistry.tsx`
     4. `ICON_MAP` di `src/components/common/AppIcon.tsx`
     5. Key terjemahan di `src/lib/locales/id.ts` dan `src/lib/locales/en.ts`
4. **Isolasi Multi-Tenant di Backend**:
   - Container Docker user diberi label `panel.owner.user_id`.
   - Database user (`internal/userdb`) berjalan di rentang port `20000-29999` dan akses jaringan luarnya dikendalikan per container melalui rantai iptables `RENEO-DB-<id>` di dalam `DOCKER-USER`.
   - Proses project (`internal/projects`) dan sesi PTY (`internal/terminal`) dijalankan sebagai akun OS Linux pemilik menggunakan `runuser` dan dibungkus `osuser.WrapCommand` agar `~/.reneo` (toolchain user) masuk ke `PATH`.

---

## Log Sesi Memori

- **[2026-11-03]** Inisialisasi skill `project-memory` dan pemetaan menyeluruh pertama terhadap seluruh codebase Reneo v1.75.4 (20 `WindowKind`, 6 `WidgetType`, 27 komponen UI Kit, 12 Zustand store, 25 modul API client, 23 package Go di `internal/`, dan 43 migrasi SQL).

- **[2026-11-03]** Menyelesaikan audit & perbaikan menyeluruh: check:ui --warnings (0 error, 0 warning), ekstraksi widgetLayout.ts & TunnelInfoModals.tsx, refaktor 13 file >400 baris menjadi <=400 baris, penambahan token CSS di _variables.scss, dan perbaikan hook/unused ESLint warnings.
- **[2026-11-03]** Menangani error Vite WS proxy ECONNABORTED dengan configureProxy di vite.config.ts serta penutupan aman WebSocket saat masih CONNECTING di liveSocket.ts dan hooks WebSocket.
