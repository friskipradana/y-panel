# YPanel - Agent Customization & Project Rules

Selamat datang di repository **YPanel** (Desktop-style Linux Server Control Panel).
Dokumen ini menjadi acuan utama bagi AI Coding Assistant (Antigravity) dan tim pengembang.

---

## 1. Arsitektur & Prinsip Sistem

### A. Frontend (React 19 + TypeScript + Vite)
- **State Management**: Gunakan **Zustand** untuk UI state (Window management, Theme, preferences) dan **TanStack Query (`@tanstack/react-query`)** untuk remote server state / API calls.
- **Window Management**: Semua fitur server dikemas sebagai desktop windows di `src/components/windows/`.
- **Desain & Estetika**:
  - Terapkan gaya **Modern Corporate & Clean Developer Infrastructure** (Deep slate/navy, subtle borders, glassmorphism, tipografi tajam, density tinggi yang nyaman dibaca operator server).
  - Hindari card berlebihan atau visual "AI slop" yang tidak memiliki fungsi nyata.
  - Komponen harus konsisten dengan design system global di `src/index.css` dan `src/components/system/`.
- **Strict Mode & Performance**:
  - Gunakan TanStack Query untuk data fetching agar tahan terhadap double-mount di React 19 dev mode.
  - Polling data hanya boleh aktif saat window terkait sedang fokus (`useWindowPollingActive`).

### B. Backend (Go Binary Agent)
- **Directory Layout**:
  - `cmd/panel-agent/main.go`: Entry point bootstrap aplikasi dan CLI helper.
  - `internal/`: Seluruh business logic, HTTP server, Docker runner, Cloudflare daemon, PTY terminal, dan Database manager.
- **Konfigurasi Lingkungan**:
  - Konfigurasi dimuat di `internal/config/config.go` dengan pembacaan otomatis file `.env` di development lokal dan OS environment di server Linux.
- **Keamanan & RBAC**:
  - Validasi sesi berbasis HttpOnly cookie (`ypanel_session`).
  - Proteksi endpoint sensitif (Host Terminal, User Management, Root File Access) hanya untuk role `superadmin` / `admin`.

---

## 2. Git & Branching Guidelines

- **Branch `main-runtime`**: Branch rilis server.
- **Branch `main-runtime-dev`**: Branch pengembangan aktif fitur & perbaikan baru.
- Selalu uji build sebelum push:
  ```powershell
  bun run build
  go test ./...
  ```
