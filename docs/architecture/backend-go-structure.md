# Backend Go Structure

Dokumen ini menjelaskan struktur backend Go dan arah refactor bertahap.

## Tujuan

- Handler HTTP tidak memuat business logic berat.
- Logic domain/runtime ditempatkan di service package.
- Integrasi eksternal seperti Docker CLI dan Cloudflare API memiliki batas jelas.
- File besar dipecah agar mudah diaudit.

## Struktur Saat Ini

```txt
cmd/
  panel-agent/
    main.go

internal/
  auth/
  cloudflare/
  config/
  crypto/
  database/
  docker/
  httpserver/
  osuser/
  projects/
  system/
  terminal/
  users/
```

Struktur ini sudah memakai `internal/`, namun beberapa package masih memegang banyak tanggung jawab.

Contoh yang perlu dirapikan:

- `internal/docker/docker.go`
  - container lifecycle
  - inspect config
  - deploy image/compose
  - compose builder
  - error formatter
  - log reader
- `internal/httpserver/server.go`
  - server wiring
  - route registration
  - handler logic
  - response helper

## Target Struktur Bertahap

Target jangka menengah:

```txt
internal/
  app/
    bootstrap.go
    routes.go

  httpserver/
    server.go
    middleware.go
    response.go
    handlers/
      docker.go
      users.go
      projects.go
      cloudflare.go
      system.go
      files.go

  services/
    docker/
      service.go
      deploy.go
      inspect.go
      logs.go
      compose_errors.go
    users/
      service.go
    projects/
      service.go
    cloudflare/
      service.go
    system/
      service.go

  integrations/
    dockercli/
      client.go
      compose.go
      inspect.go
    cloudflareapi/
      client.go

  repositories/
    users/
    projects/
```

Namun perpindahan langsung ke struktur ini berisiko besar.
Karena itu tahap awal adalah split file dalam package yang sama.

## Tahap Aman Saat Ini

Untuk `internal/docker`, package tetap sama:

```txt
internal/docker/
  types.go
  containers.go
  inspect.go
  deploy.go
  compose.go
  compose_errors.go
  logs.go
  images.go
  networks.go
```

Dengan cara ini import path tetap:

```go
import "github.com/friskipradana/panel-desktop-ui/internal/docker"
```

Tidak ada perubahan di handler.

## Boundary Package

### `httpserver`

Tanggung jawab:

- route registration
- auth middleware
- request decode
- response encode
- mapping error ke HTTP status

Tidak boleh:

- menjalankan Docker CLI langsung
- menyusun compose YAML langsung
- melakukan business validation berat

### `docker` / future `services/docker`

Tanggung jawab:

- validasi input deploy Docker
- container lifecycle orchestration
- compose generation
- inspect data mapping untuk frontend
- formatting error Docker menjadi pesan user-friendly

### `cloudflare` / future `integrations/cloudflareapi`

Tanggung jawab:

- komunikasi API Cloudflare
- DTO Cloudflare
- normalisasi response Cloudflare

### `database` dan repositories

Tanggung jawab:

- koneksi database
- migration
- query persistence

## Naming Rules

- File Go kecil berdasarkan domain operasi, bukan berdasarkan tipe teknis saja.
- Gunakan nama jelas:
  - `deploy.go`
  - `inspect.go`
  - `compose_errors.go`
  - `containers.go`
- Hindari file besar generik seperti `utils.go` kecuali benar-benar kecil.

## Error Handling

- Service mengembalikan error bermakna domain/user.
- Handler menentukan HTTP status.
- Error Docker raw harus dinormalisasi sebelum sampai frontend jika terkait aksi user.

## Validasi Setelah Refactor

Wajib jalankan:

```powershell
gofmt -w internal\docker\*.go
go test ./...
bun run build
```

Jika ada perubahan handler:

```powershell
gofmt -w internal\httpserver\*.go
go test ./...
```
