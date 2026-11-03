---
name: project-memory
description: >-
  Persistent codebase memory and architectural knowledge base for the Reneo project.
  Use this skill at the beginning of a task to recall the mapped architecture
  (frontend, backend Go, routes, stores, windows, and tooling) without re-scanning
  the entire repository, and after structural changes to update and persist memory
  across sessions.
---

# Reneo Project Memory Skill

Skill ini berfungsi sebagai **memori jangka panjang (persistent knowledge base)** untuk codebase **Reneo**. Gunakan skill ini untuk membaca peta arsitektur secara instan, mencari lokasi simbol/fitur, memverifikasi sinkronisasi memori dengan kondisi riil repository, dan memperbarui catatan setiap kali ada perubahan arsitektur.

---

## 1. Struktur Basis Memori

Seluruh pengetahuan hasil pemetaan disimpan secara modular di folder `references/` agar hemat konteks (*progressive disclosure*):

- [architecture-overview.md](./references/architecture-overview.md) — Gambaran sistem tingkat atas, konfigurasi build (`package.json`, `vite.config.ts`, `go.mod`), skrip tooling (`scripts/`), deployment (`deploy/`, `installer/`), dan aturan proyek.
- [frontend-map.md](./references/frontend-map.md) — Peta lengkap `src/`: entrypoint, router, semua halaman (`src/pages/`), desktop shell, 20 `WindowKind` beserta file pendampingnya, 6 widget, 27 komponen UI Kit (`src/components/ui/`), 12 Zustand store, custom hooks, 25 modul API client, dan arsitektur SCSS.
- [backend-map.md](./references/backend-map.md) — Peta lengkap `cmd/panel-agent/` dan seluruh package di `internal/` (HTTP server, auth/RBAC, PostgreSQL + migrasi goose, Docker runner, userdb, projects supervisor, Cloudflare, public proxy, UFW, PTY terminal, toolchain, notify engine, MCP server), serta daftar endpoint `/api/v1/*`.
- [session-notes.md](./references/session-notes.md) — Catatan lintas sesi berisi riwayat pemetaan, keputusan teknis penting, temuan bug/gotcha, dan log pembaruan memori.

---

## 2. Cara Membaca & Mencari Memori (Read & Recall)

1. **Baca selektif sesuai domain tugas**:
   - Tugas UI / Window / Store / SCSS -> baca [frontend-map.md](./references/frontend-map.md).
   - Tugas Go / API / Database / Docker / MCP -> baca [backend-map.md](./references/backend-map.md).
   - Tugas Build / Vite / Script / Konteks umum -> baca [architecture-overview.md](./references/architecture-overview.md) dan [session-notes.md](./references/session-notes.md).
2. **Gunakan CLI Helper Memori** ([memory.mjs](./scripts/memory.mjs)):
   - Cek ringkasan & status sinkronisasi memori terhadap codebase saat ini:
     ```powershell
     bun .agents/skills/project-memory/scripts/memory.mjs status
     ```
   - Cari kata kunci di seluruh basis memori:
     ```powershell
     bun .agents/skills/project-memory/scripts/memory.mjs search "<kata-kunci>"
     ```
   - Verifikasi apakah ada file window, store, package Go, atau migrasi baru yang belum tercatat di memori:
     ```powershell
     bun .agents/skills/project-memory/scripts/memory.mjs verify
     ```

---

## 3. Prosedur Memperbarui Memori (Write & Update)

Wajib perbarui file referensi terkait setiap kali menyelesaikan tugas yang mengubah struktur berikut:

1. **Menambah / mengubah Window, Page, Widget, Store, Hook, atau Modul API Frontend**:
   - Edit [frontend-map.md](./references/frontend-map.md) (dan pastikan `.agents/rules/component-list.md` juga diperbarui sesuai aturan proyek).
2. **Menambah / mengubah Package Go, Migrasi Database, atau Endpoint HTTP/MCP**:
   - Edit [backend-map.md](./references/backend-map.md).
3. **Menambah catatan temuan penting atau keputusan arsitektur**:
   - Tambahkan entri baru di [session-notes.md](./references/session-notes.md) secara manual atau melalui CLI:
     ```powershell
     bun .agents/skills/project-memory/scripts/memory.mjs log "<ringkasan perubahan atau temuan>"
     ```
4. **Verifikasi akhir**:
   - Jalankan `bun .agents/skills/project-memory/scripts/memory.mjs verify` untuk memastikan memori tetap sinkron dengan isi direktori proyek.

