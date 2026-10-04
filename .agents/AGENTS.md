# YPanel - Agent Customization & Project Rules

Selamat datang di repository **YPanel** (Desktop-style Linux Server Control Panel).
Dokumen ini menjadi acuan utama bagi AI Coding Assistant (Antigravity) dan tim pengembang.

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
  - **TanStack Query (`@tanstack/react-query`)** untuk remote server state / API calls.

- **Strict Mode & Performance**:
  - Tahan terhadap double-mount di React 19 dev mode.
  - Polling data hanya aktif saat window terkait sedang fokus (`useWindowPollingActive`).

### B. Backend (Go Binary Agent)
- **Directory Layout**:
  - `cmd/panel-agent/main.go`: Entry point bootstrap aplikasi dan CLI helper.
  - `internal/`: Business logic, HTTP server, Docker runner, Cloudflare daemon, PTY terminal, Database manager.
- **Konfigurasi Lingkungan**:
  - Dimuat di `internal/config/config.go` dengan pembacaan otomatis `.env` di lokal dan OS environment di Linux.
- **Keamanan & RBAC**:
  - Validasi sesi HttpOnly cookie (`ypanel_session`).
  - Proteksi endpoint sensitif hanya untuk role `superadmin` / `admin`.

---

## 2. Developer Style & Quality Guidelines (Anti-Slop)

1. **Zero Over-Engineering & Direct Imports**:
   - Gunakan import langsung ke file tujuan. Hindari pembuatan barrel `index.ts` kosong atau abstraction layers yang berlebihan.
2. **100% Fidelity & Zero Breaking Changes**:
   - Setiap modifikasi atau refactoring WAJIB mempertahankan 100% fungsionalitas, state lifecycle, styling visual, dan kontrak API.
3. **Clean Code & Comment Aesthetics**:
   - Gunakan komentar modern yang ringkas: `// Section Title`.
   - DILARANG menggunakan banner pemisah tebal (`===`, `---` berkepanjangan) atau karakter encoding aneh/mojibake.
4. **Clean Builds**:
   - Output build harus selalu bebas dari warning dan error (`bun run build` exit code 0).

---

## 3. Git & Branching Guidelines

- **Branch `main-runtime`**: Branch rilis server.
- **Branch `main-runtime-dev`**: Branch pengembangan aktif fitur & perbaikan baru.
- Selalu uji build sebelum push:
  ```powershell
  bun run build
  go test ./...
  ```
