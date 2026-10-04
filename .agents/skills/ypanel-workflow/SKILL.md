---
name: ypanel-workflow
description: Standard operating procedure and engineering workflow for developing, refactoring, and maintaining the YPanel desktop Linux server control panel codebase.
---

# YPanel Workflow & Engineering Standards

Skill ini memandu AI Assistant dan developer dalam mengembangkan fitur, merapikan kode, dan menjaga stabilitas proyek **YPanel**.

---

## 1. Arsitektur Folder & Layering

Saat menambahkan atau memodifikasi fitur di frontend:

| Folder | Tanggung Jawab | Aturan |
| :--- | :--- | :--- |
| `src/pages/` | Full-page views | Halaman rute mandiri (`LoginPage`, `LandingPage`, `DesktopPage`). Gunakan import langsung ke file tujuan. |
| `src/router/` | Single-point router | Terpusat di `src/router/index.tsx`. Jangan membuat file barrel/indirection kosong. |
| `src/components/windows/` | Floating desktop windows | Hanya untuk draggable server app windows (Terminal, Docker, Databases, Users, Logs, etc). |
| `src/shell/` | Desktop layout shell | Container `AppShell` full-height (`h-screen`). |
| `src/hooks/` | Custom business logic hooks | Pisahkan keyboard shortcuts, revision sync, dan event polling ke hooks mandiri. |
| `src/assets/css/` | Tailwind CSS entrypoint | `tailwind.css` murni berisi `@import "tailwindcss";`. |
| `src/assets/scss/` | Modular SCSS system | `global.scss` mengimpor `_base`, `_variables`, dan `@use "./modules"`. |

---

## 2. Aturan Mutlak Refactoring (*100% Fidelity*)

1. **Zero Logic Changes**:
   - Kontrak API backend, request/response payload, state lifecycle TanStack Query, dan Zustand store tidak boleh diubah saat melakukan refactor struktur folder.
2. **Zero Visual Regressions**:
   - Desain visual, transisi animasi, class hierarchy, dan layout responsiveness harus tetap terjaga 100%.
3. **Clean Comments (*No Noise*)**:
   - Selalu gunakan komentar single-line ringkas: `// Section Title`.
   - Dilarang membuat banner ASCII ganda atau garis pemisah tebal (`===` / `---` panjang).

---

## 3. Standard Verification Checklist

Sebelum mengakhiri task atau mengonfirmasi ke user, selalu jalankan pengujian:

```powershell
# 1. Frontend compilation & typecheck
bun run build

# 2. Backend Go test suites
go test ./...
```
Keduanya harus menghasilkan **Exit Code 0** tanpa error atau warning.
