# Peta Arsitektur Tingkat Atas & Tooling Reneo

## 1. Identitas & Stack Utama
- **Nama Proyek**: Reneo (`package.json` name: `reneo`, Go module: `github.com/friskipradana/panel-desktop-ui`)
- **Konsep**: Panel kontrol server Linux bergaya desktop workstation (menggabungkan pengalaman desktop multi-window dengan pengelolaan container Docker, aplikasi/project, database, Cloudflare tunnel, domain IP publik, firewall, terminal PTY, penjualan hosting, dan server MCP).
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Modular SCSS (`sass-embedded`) + Zustand + Mutative + TanStack Query v5 + Lucide Icons.
- **Backend**: Go 1.22 tunggal (`cmd/panel-agent`) + PostgreSQL (`lib/pq` + `goose` embed migrations) + Gorilla WebSocket + `creack/pty` + AES-256-GCM encryption.
- **Branch Git**:
  - `main-runtime-dev`: Branch pengembangan aktif.
  - `main-runtime`: Branch rilis produksi.

---

## 2. Konfigurasi Build & Dev (`package.json` & `vite.config.ts`)

### Skrip NPM/Bun Utama
- `bun run dev`: Menjalankan Go agent (`go run ./cmd/panel-agent`) dan Vite (`wait-on tcp:8787 && vite`) secara paralel.
- `bun run build`: `tsc -b && vite build` (wajib exit code 0 tanpa warning).
- `bun run lint`: `eslint .`
- `bun run check:ui`: `bun run ./scripts/check-ui.ts` (validator aturan Design System & Anti-Slop).
- `bun run db:migrate`: Wrapper `go run ./cmd/panel-agent migrate ...` (`up`, `down`, `status`, `create`).
- `bun run release`: `bun run ./scripts/release.ts` (`patch`, `minor`, `major`, `dry-run`).

### Mekanisme Khusus di `vite.config.ts`
1. **Alias Path**: `@` diarahkan ke `./src`.
2. **Plugin `localeSplit()`**:
   - Memecah `src/lib/locales/<lang>.ts` menjadi dua modul virtual:
     - `virtual:locale/<lang>/public` (hanya key dengan prefix `PUBLIC_LOCALE_PREFIXES` untuk halaman publik).
     - `virtual:locale/<lang>/rest` (seluruh key sisanya untuk desktop).
   - Menghemat ukuran unduhan awal pada halaman publik (`/`, `/order`, `/articles`, `/docs/mcp`, `/install`).
3. **Plugin `reneo-async-css`**:
   - Mengubah `<link rel="stylesheet">` bundel aplikasi menjadi non-blocking saat build produksi.
   - `src/main.tsx` memanggil `stylesReady()` sebelum merender React dan menghapus `#boot-splash`.
4. **Dev Server & Proxy**:
   - Berjalan di port `8770` (`strictPort: true`).
   - Proxy `/api` (dengan `ws: true`) dan `/agent` ke `http://localhost:8787`.
   - Proxy `/portainer` ke `http://localhost:9000`.

---

## 3. Skrip & Otomasi (`scripts/`, `deploy/`, `installer/`)

### `scripts/`
- `scripts/check-ui.ts`: Memvalidasi kepatuhan UI terhadap aturan Reneo:
  - Larangan bulatan traffic-light macOS, `console.log`, emoji di JSX, dan ikon `Sparkles`.
  - Pengecekan penggunaan komponen UI Kit (`src/components/ui/`) dibanding markup `.panel-btn`/modal manual.
  - Batas panjang file (~400 baris).
  - Larangan warna hex lepas di luar `_variables.scss`.
  - Paritas key terjemahan `t('...')` antara `src/lib/locales/id.ts` dan `src/lib/locales/en.ts`.
- `scripts/release.ts`: Otomasi kenaikan versi, pembuatan changelog, dan tag rilis.
- `scripts/declaude.ts`: Pembersih komentar bising/artefak AI.
- `scripts/make-brand-icons.py`: Generator aset ikon brand di `public/`.
- `scripts/package-installer.ps1`: Pemaket installer `.run`.

### `deploy/` & `installer/linux/`
- `deploy/`: Skrip PowerShell (`build.ps1`, `deploy-frontend.ps1`, `deploy_reneo.ps1`) dan bash (`update-frontend.sh`, `deploy/lib/*.sh`) untuk kompilasi silang dan pengiriman rilis ke server Linux.
- `installer/linux/`: Skrip instalasi produksi (`install.sh`, `uninstall.sh`, `deploy.sh`) beserta template systemd (`reneo.service.tpl`, `ui-panel.service.tpl`).

---

## 4. Aturan & Standar Proyek (`.agents/`)
- **`.agents/AGENTS.md`**, **`AGENTS.md`**, **`GEMINI.md`**: Aturan utama arsitektur, RBAC, token warna, tipografi, dan larangan slop.
- **`.agents/rules/design-system.md`**: Standar ukuran kontrol (`26px`/`28px`/`32px`/`40px`), batas ~400 baris per file, paritas Desktop & Mobile (`?ui=mobile`), dan larangan menebak state server.
- **`.agents/rules/ui-components.md`**: Panduan wajib penggunaan 27 komponen di `src/components/ui/` ("Kit dulu, bukan class").
- **`.agents/rules/component-list.md`**: Inventaris sumber tunggal untuk seluruh window, komponen, class `.panel-*`, store, hook, dan API.
- **`.agents/skills/anti-slop/SKILL.md`**: Checklist anti-macOS, anti-visual-slop, anti-copy-slop, dan anti-code-slop.
- **`.agents/skills/reneo-workflow/SKILL.md`**: SOP pengembangan dan refactoring dengan prinsip *100% Fidelity*.

