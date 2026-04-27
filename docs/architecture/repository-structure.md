# Repository Structure

Dokumen ini menjelaskan struktur repository YPanel Desktop UI dan aturan penempatan file baru.
Tujuannya agar frontend React, backend Go, deployment script, dan dokumentasi tidak bercampur tanpa batas yang jelas.

## Struktur Saat Ini

```txt
.
├── cmd/                 # entrypoint binary Go
├── deploy/              # script build/deploy dari development machine ke server
├── docs/                # dokumentasi teknis dan operasional
├── installer/           # aset/script installer Linux
├── internal/            # source backend Go non-public package
├── public/              # static asset Vite
├── src/                 # source frontend React/Vite
├── README.md
├── CHANGELOG.md
├── go.mod
├── package.json
└── vite.config.ts
```

## Aturan Root Directory

Root directory sebaiknya hanya berisi file konfigurasi project dan folder top-level yang jelas.

### Boleh di Root

- `README.md`
- `CHANGELOG.md`
- `go.mod`, `go.sum`
- `package.json`, lockfile package manager
- `vite.config.ts`, `tsconfig*.json`
- `.env.example`, `.env.*.example`
- folder utama seperti `cmd`, `internal`, `src`, `docs`, `deploy`, `installer`, `public`

### Jangan Menaruh di Root

- scratch script sementara
- hasil eksperimen
- implementation plan lama
- file build/generated
- output installer sementara

Gunakan folder berikut:

```txt
docs/plans/       # plan teknis yang ingin disimpan
.tmp/ atau tmp/   # file sementara lokal, tidak dikomit
```

## Generated dan Local Artifacts

File/folder berikut adalah generated/local dan harus masuk `.gitignore`:

```txt
node_modules/
dist/
dist-ssr/
*.tsbuildinfo
tmp/
deploy/tmp/
deploy/productions/
*.gz
.env
*.local
```

## Backend Go

Backend Go berada di:

```txt
cmd/
internal/
```

`cmd/panel-agent/main.go` hanya untuk bootstrap proses aplikasi.
Logic aplikasi harus berada di `internal/`.

Panduan detail backend ada di:

- [backend-go-structure.md](backend-go-structure.md)

## Frontend React

Frontend berada di:

```txt
src/
```

Panduan detail frontend ada di:

- [frontend-structure.md](frontend-structure.md)

## Deployment

Deployment script berada di:

```txt
deploy/
```

Aturan:

- script deploy harus dapat dijalankan dari root project
- jangan menyimpan secret di script
- gunakan parameter atau environment variable
- output sementara deploy masuk `deploy/tmp/` atau `deploy/productions/`

## Dokumentasi

Dokumentasi teknis berada di:

```txt
docs/
├── architecture/
├── operations/
└── plans/
```

Rekomendasi:

- `docs/architecture/` untuk struktur dan rancangan sistem
- `docs/operations/` untuk panduan deploy, backup, troubleshooting
- `docs/plans/` untuk rencana refactor/fitur yang ingin disimpan

## Prinsip Perubahan Struktur

1. Refactor struktur dilakukan bertahap.
2. Hindari big-bang rename package tanpa test.
3. Split file dalam package yang sama dulu sebelum pindah package.
4. Setelah setiap tahap wajib jalankan:

```powershell
gofmt -w internal\...
go test ./...
bun run build
```
