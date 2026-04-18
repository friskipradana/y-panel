# ServerPanel Pro — Task Tracker

## Phase 1: DB Migration ke PostgreSQL + Schema Baru
- [x] Tambah dependency `lib/pq` dan `golang.org/x/crypto` ke `go.mod`
- [x] Rewrite `internal/database/database.go` ke PostgreSQL (18 tabel)
- [x] Schema 18 tabel baru di `ensureSchema()`
- [x] Update `internal/config/config.go` (hapus ENV admin, PostgreSQL DSN, enkripsi key, base domain)
- [x] Update `.env.example` dengan config baru

## Phase 2: Multi-User Auth (DB-backed, bcrypt, RBAC)
- [x] Rewrite `internal/auth/auth.go` (multi-user, bcrypt, DB sessions)
- [x] Seed superadmin via PANEL_BOOTSTRAP_* ENV pada first start
- [x] Middleware `requireRole` + `requireAuthV2` di HTTP server
- [x] Update `server.go` untuk pakai auth baru, inject user ke context
- [x] Sinkronisasi user panel ke user OS Linux untuk isolasi terminal & proses project lokal

## Phase 3: New Modules Backend
- [x] `internal/users/users.go` (validasi, suspend/activate)
- [x] `internal/crypto/crypto.go` (AES-256-GCM encryption)
- [x] `internal/cloudflare/api.go` (CF API client per-user)
- [x] `internal/cloudflare/daemon.go` (cloudflared process manager)
- [x] `internal/cloudflare/config.go` (config.yml generator)
- [x] `internal/projects/projects.go` (port alloc, process manager)
- [x] `internal/httpserver/handlers_v2.go` (semua handler baru)
- [x] `internal/httpserver/server.go` (struct + routes update)

## Phase 4: Frontend — User Management Window
- [x] `src/api/agent.ts` extend: users, CF, projects, tunnels, notifications API
- [x] `src/components/windows/UsersWindow.tsx`
- [x] `src/components/windows/ProfileWindow.tsx` (CF config per-user)
- [x] `src/components/windows/ProjectsWindow.tsx`
- [x] `src/components/windows/TunnelsWindow.tsx`
- [x] Register semua window baru di `windowStore` / `App.tsx`
- [x] Update Login screen untuk UX baru (tidak hanya single admin)

## Phase 7: Frontend — App.tsx Update
- [ ] Role-based routing dan window visibility
- [ ] Notification bell di taskbar
- [x] Update dock untuk show Projects, Tunnels windows

## Phase 8: Testing + go mod tidy
- [ ] Jalankan `go mod tidy && go build ./...` untuk validasi
- [ ] Update installer Linux
- [ ] Update docs
