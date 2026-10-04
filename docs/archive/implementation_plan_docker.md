# Docker Registry Authentication & Pull Image Flow

Menambahkan dukungan autentikasi registry Docker menggunakan **username/email + password** untuk dua area:
- **Deploy from Image** di DockerWindow
- **Pull Image** dari tab Images

Fitur ini akan bersifat opsional melalui toggle/checkbox autentikasi agar UI tetap sederhana untuk image public.

## User Review Required

> [!IMPORTANT]
> Saya akan menerapkan autentikasi sebagai **opsional**. Jika tidak dicentang, sistem tetap menggunakan flow public image seperti sekarang.

> [!IMPORTANT]
> Kredensial registry **tidak akan dipersist** ke database/frontend state jangka panjang. Kredensial hanya dikirim saat aksi deploy/pull lalu dipakai backend untuk login sementara ke registry sebelum pull dijalankan.

> [!WARNING]
> Secara default saya akan memakai pendekatan `docker login` → `docker pull` / `docker compose up`, lalu best-effort `docker logout` untuk registry terkait setelah proses selesai. Ini paling kompatibel dengan CLI Docker yang sudah dipakai codebase saat ini.

## Open Questions

> [!NOTE]
> Saya akan lanjut dengan asumsi berikut kecuali Anda minta lain:
> - Toggle bernama **Gunakan autentikasi registry**
> - Field auth: `registry`, `usernameOrEmail`, `password`
> - Jika registry kosong saat auth aktif, backend default ke **Docker Hub**
> - Fitur pull image baru berada di tab **Images** sebagai tombol **Pull Image** yang membuka modal kecil

## Proposed Changes

---

### Frontend types & API

#### [MODIFY] [index.ts](file:///e:/Pekerjaan/Programing/React/homeserver-desktop/src/types/index.ts)
- Tambahkan type reusable untuk registry auth payload
- Perluas payload deploy image dengan field auth opsional
- Tambahkan payload baru untuk pull image

#### [MODIFY] [agent.ts](file:///e:/Pekerjaan/Programing/React/homeserver-desktop/src/api/agent.ts)
- Tambahkan method API untuk pull image
- Update typing deploy image agar menerima auth opsional

---

### DockerWindow UI/UX

#### [MODIFY] [DockerWindow.tsx](file:///e:/Pekerjaan/Programing/React/homeserver-desktop/src/components/windows/DockerWindow.tsx)
- Tambahkan checkbox/toggle autentikasi di modal deploy image
- Render field:
  - registry (opsional)
  - username/email
  - password
- Pastikan auth hanya dikirim saat toggle aktif
- Tambahkan tombol **Pull Image** di tab Images
- Tambahkan modal pull image dengan field image + auth opsional
- Setelah pull sukses:
  - refresh image list
  - tampilkan feedback sukses/error yang jelas

---

### Styling

#### [MODIFY] [index.css](file:///e:/Pekerjaan/Programing/React/homeserver-desktop/src/index.css)
- Tambahkan style ringan untuk blok auth registry dan modal pull image
- Menjaga tampilan tetap konsisten dan tidak terlalu mencolok

---

### Backend HTTP layer

#### [MODIFY] [server.go](file:///e:/Pekerjaan/Programing/React/homeserver-desktop/internal/httpserver/server.go)
- Perluas request deploy image untuk menerima auth opsional
- Tambahkan endpoint handler baru untuk pull image
- Validasi basic request body untuk auth aktif

---

### Docker backend logic

#### [MODIFY] [docker.go](file:///e:/Pekerjaan/Programing/React/homeserver-desktop/internal/docker/docker.go)
- Tambahkan struct registry auth reusable
- Tambahkan logic helper:
  - normalize registry server
  - docker login via `--password-stdin`
  - best-effort logout
- Integrasikan auth ke flow deploy image sebelum compose up
- Tambahkan function baru untuk `PullImage`
- Pastikan error message dari Docker CLI diteruskan dengan cukup jelas

## Verification Plan

### Automated Tests
- `npm run build`
- `go test ./internal/docker ./internal/httpserver`

### Manual Verification
- Deploy public image tanpa auth
- Deploy private image dengan auth aktif
- Pull public image dari tab Images
- Pull private image dari tab Images dengan auth aktif
- Coba auth aktif dengan password salah dan pastikan error tampil jelas
