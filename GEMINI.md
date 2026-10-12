# YPanel - Agent Customization & Project Rules

Selamat datang di repository **YPanel** (Desktop-style Linux Server Control Panel).
Dokumen ini menjadi aturan wajib dan acuan utama bagi AI Coding Assistant (Antigravity/Gemini) dan tim pengembang.

---

## 1. Arsitektur & Prinsip Sistem

### A. Frontend (React 19 + TypeScript + Vite)
- **Layer & Folder Conventions**:
  - `src/pages/`: Full-page route views (`LoginPage.tsx`, `LandingPage.tsx`, `DesktopPage.tsx`).
  - `src/router/index.tsx`: Single-point consolidated routing (direct explicit imports, no empty barrel files).
  - `src/components/windows/`: Draggable floating desktop apps only (terminal, docker, database, settings, dsb).
  - `src/shell/`: Desktop chrome container & viewport managers (`AppShell`).
  - `src/hooks/`: Reusable custom hooks (`useGlobalShortcuts`, `useRevisionSync`, `useWindowPollingActive`).
  - `src/assets/css/tailwind.css`: Dedicated entrypoint for `@import "tailwindcss";`.
  - `src/assets/scss/`: Modular SCSS styling with `sass-embedded`:
    - `global.scss`: Root stylesheet entry.
    - `_base.scss`: Font imports, element resets.
    - `_variables.scss`: Color tokens (`:root`, `[data-theme="dark"]`).
    - `modules/`: Feature-scoped SCSS partials (`_desktop`, `_taskbar`, `_windows`, `_components`, `_terminal`, `_docker`, `_cloudflare`, `_login`, `_landing`, `_index`).

- **State Management**:
  - **Zustand** untuk UI state (Window management, Theme, preferences).
  - **TanStack Query (`@tanstack/react-query`)** untuk remote server state / API calls. Tidak ada `fetch` langsung di komponen.

- **Strict Mode & Performance**:
  - Tahan terhadap double-mount di React 19 dev mode.
  - Polling data hanya aktif saat window terkait sedang fokus (`useWindowPollingActive`).

### B. Backend (Go Binary Agent)
- **Directory Layout**:
  - `cmd/panel-agent/main.go`: Entry point bootstrap aplikasi dan CLI helper.
  - `internal/`: Business logic, HTTP server, Docker runner, Cloudflare daemon, PTY terminal, Database manager, MCP runtime.
- **Konfigurasi Lingkungan**:
  - Dimuat di `internal/config/config.go` dengan pembacaan otomatis `.env` di lokal dan OS environment di Linux.
- **Keamanan & RBAC**:
  - Validasi sesi HttpOnly cookie (`ypanel_session`).
  - Proteksi endpoint sensitif hanya untuk role `superadmin` / `admin`.

---

## 2. Aturan Wajib UI & Design System

Dokumen referensi visual utama: [DESIGN.md](DESIGN.md) dan inventaris [.agents/rules/component-list.md](.agents/rules/component-list.md).

### 1. Sebelum Menulis UI
- Wajib cek [.agents/rules/component-list.md](.agents/rules/component-list.md). Gunakan kembali komponen dan class yang sudah ada sebelum membuat baru.
- Menambah Window baru wajib mendaftarkan:
  1. `WindowKind` di `src/types`
  2. `DEFAULTS` di `windowStore`
  3. Entri di `WINDOW_CONTENT` (`src/components/desktop/Desktop.tsx`)
  4. `ICON_MAP` di `AppIcon`
  5. Key i18n di `id` dan `en` (`src/lib/i18n.tsx`)
- Komponen window hidup di `src/components/windows/`. Halaman penuh di `src/pages/`. Dilarang membuat barrel `index.ts` kosong.

### 2. Struktur & Styling
- Layout ad-hoc: Gunakan Tailwind utility.
- Komponen yang dipakai ulang: Wajib menggunakan class `.panel-*` di SCSS modul.
- Inline style hanya diizinkan untuk nilai dinamis (koordinat drag, dimensi window, z-index runtime).
- Class SCSS baru wajib masuk modul pemilik (`_docker`, `_terminal`, `_cloudflare`, dst.) dengan penamaan BEM ringan (`.block__elem--mod`) dan di-`@forward` di `modules/_index.scss`.
- Komentar SCSS/TS: satu baris ringkas `// Judul Bagian`. Tanpa banner `===`/`---`, tanpa komentar bising, tanpa mojibake.

### 3. Warna & Token
- DILARANG menggunakan nilai `hex` atau `rgba` lepas di komponen. Wajib menggunakan token CSS dari `_variables.scss`.
- Setiap token warna baru WAJIB didefinisikan serentak di `:root` (light) dan `[data-theme="dark"]`.
- Indikator status wajib menggunakan token semantik: `success`, `warning`, `danger`, `info`, `neutral`, `primary`.
- Aksen aksi utama fungsional adalah biru (`--panel-primary-*`). Maksimal 1 tombol solid primary per area tampilan.
- Uji keterbacaan di kedua tema (`light` default dan `dark`) serta dua skala font (`small`, `large`).

### 4. Tipografi
- Teks UI memakai `var(--font-sans)`, dilarang hardcode font family di CSS inline.
- Data teknis WAJIB memakai font mono (`var(--font-mono)` / `.panel-mono` / `.panel-input--mono`): IP, port, path, hash, nama container, log, cron, dan perintah terminal.
- Jangan menambah skala font di luar yang sudah ada (`0.75rem`, `0.8125rem`, `0.875rem`, konten 13px).

### 5. Komponen & Interaksi
- Window controls: Ikon garis Lucide `strokeWidth 1.75` (`Minus`, `Square`/`Copy`, `Maximize`, `X`). **DILARANG KERAS** menggunakan bulatan warna traffic light gaya macOS.
- Setiap kontrol interaktif wajib memiliki state lengkap: `:hover`, `:focus-visible`, `disabled`, dan loading jika async.
- Efek hover DILARANG menggeser layout (hindari `translateY` pada baris tabel dan field input padat).
- Setiap daftar dan tabel wajib menyediakan: empty state (`.panel-empty`), loading state (`.panel-loading`), dan error state (`.panel-error-state`).
- Aksi destruktif wajib melalui `GlobalAlert` / `InnerAlert` dengan nama objek yang jelas dan tombol `.panel-btn--danger`.
- Teks UI selalu melalui fungsi `t()`. Dilarang ada teks Indonesia/Inggris mentah di JSX.
- Ikon aplikasi selalu melalui `<AppIcon kind=... />`. Dilarang emoji sebagai ikon UI.

### 6. Layout & Scroll
- Halaman publik (landing, docs, panduan MCP) wajib scrollable (`overflow-y-auto`). Dilarang mengunci `overflow-hidden` di root konten halaman publik.
- `overflow-hidden` di root hanya untuk desktop shell, terminal, dan log viewer.
- Dialog dan popover harus muat pada window terkecil (lebar 500px) tanpa terpotong.
- Kerapatan informasi tinggi ala workstation operator Linux (Cloudflare Zero Trust, Grafana, Linear), bukan brosur marketing dengan padding membengkak.

---

## 3. Larangan Slop (Anti-Slop Guidelines)

1. **Anti-macOS**: Dilarang tiga bulatan merah/kuning/hijau di window, dialog, modal, landing, maupun mockup.
2. **Anti-Visual Slop**:
   - Dilarang kartu melayang yang menumpuk di atas screenshot/hero tanpa fungsi.
   - Dilarang ilustrasi AI generik (orb, mesh abstrak, 3D blob, karakter kartun). Gunakan UI nyata.
   - Dilarang lencana kepercayaan palsu ("Enterprise-grade", centang perisai, sertifikasi fiktif).
   - Dilarang gradient dekoratif multi-warna pada teks, tombol, atau kartu. Gradient hanya untuk visualisasi data/grafik atau wallpaper pilihan user.
   - Dilarang glow/blur berlebihan di luar batas window/taskbar.
   - Dilarang kartu bersarang (card di dalam card di dalam card).
3. **Anti-Copy Slop**:
   - Dilarang kata-kata marketing kosong ("seamless", "cutting-edge", "revolutionary", "all-in-one").
   - Gunakan kata kerja konkret pada tombol dan label ("Restart container", "Buat rute tunnel").
   - Pesan error wajib menjelaskan objek yang gagal dan solusi perbaikan konkret.
4. **Anti-Code Slop**:
   - Dilarang membuat barrel `index.ts` kosong atau wrapper untuk satu pemakai.
   - Dilarang `!important` dan dilarang membuat `z-index` acak di luar tangga z-index YPanel (normal 100, max 500, taskbar 60000, focus 50000, fullscreen 120000).
   - Dilarang menyisakan `console.log` dan kode mati.
   - 100% Fidelity: Dilarang mengubah perilaku atau merusak fitur lama saat refactoring visual.

---

## 4. Checklist Review Wajib Sebelum Menyatakan Selesai

- [ ] Tidak ada bulatan macOS di window / modal / chrome.
- [ ] Tidak ada kartu melayang, lencana palsu, atau ilustrasi generik baru.
- [ ] Tidak ada gradient dekoratif liar dan tidak ada emoji sebagai ikon UI.
- [ ] Semua warna menggunakan token CSS; token baru ada di `:root` dan `[data-theme="dark"]`.
- [ ] Data teknis (IP, port, hash, log, container) memakai font mono.
- [ ] State interaktif lengkap: hover, fokus, disabled, loading, empty, error.
- [ ] Semua string UI melalui `t()`, kunci `id` dan `en` terisi.
- [ ] Komponen yang ada digunakan ulang; `component-list.md` diperbarui jika ada komponen baru.
- [ ] Mode `light` dan `dark` dicek; kontras teks terbaca jelas.
- [ ] `bun run build` exit code 0 tanpa warning, `bun run lint` bersih, `go test ./...` lulus.

---

## 5. Git & Branching Guidelines

- **Branch `main-runtime`**: Branch rilis server.
- **Branch `main-runtime-dev`**: Branch pengembangan aktif fitur & perbaikan baru.
- Selalu uji build sebelum push:
  ```powershell
  bun run build
  go test ./...
  ```
