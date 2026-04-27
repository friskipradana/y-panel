# Frontend Structure

Dokumen ini menjelaskan struktur frontend React/Vite dan aturan penempatan komponen.

## Struktur Saat Ini

```txt
src/
  api/
  assets/
  components/
    alert/
    common/
    debug/
    desktop/
    dock/
    system/
    taskbar/
    windows/
  hooks/
  lib/
  store/
  types/
  App.tsx
  main.tsx
  index.css
```

## Tanggung Jawab Folder

### `src/api/`

Berisi client API ke agent backend.

Aturan:

- fungsi API tidak boleh menyimpan state React
- parsing error umum boleh dilakukan di interceptor
- type payload/response sebaiknya berasal dari `src/types`

### `src/components/common/`

Komponen reusable lintas window.

Contoh:

- date/time display
- empty state
- loading state
- small UI primitive yang bukan spesifik desktop/window

### `src/components/system/`

Komponen system UI yang dipakai banyak window.

Contoh:

- custom select/dropdown
- panel control
- shared menu

### `src/components/windows/`

Komponen window level.

Aturan:

- file window boleh mengatur layout utama dan tab-level state
- logic besar harus dipindah ke hook atau subcomponent
- modal besar sebaiknya komponen terpisah

### `src/hooks/`

Hook shared lintas fitur.

Contoh:

- polling active berdasarkan fokus window
- query hooks runtime umum

### `src/lib/`

Utility murni tanpa React state.

Contoh:

- date formatting
- alert helper
- string formatting
- runtime logger

### `src/store/`

State global aplikasi.

Contoh:

- window manager state
- session/global UI state jika ada

### `src/types/`

TypeScript contracts yang dipakai lintas API/UI.

## Masalah Saat Ini

### `DockerWindow.tsx` terlalu besar

Saat ini Docker window memuat:

- tab containers/images/networks/templates
- deploy image/compose modal
- edit/redeploy mapping
- realtime log modal
- runtime audit logic
- list rendering
- banyak state form

Target jangka menengah:

```txt
src/features/docker/
  DockerWindow.tsx
  components/
    ContainerList.tsx
    ContainerRow.tsx
    DeployModal.tsx
    LogModal.tsx
    ImageList.tsx
    NetworkList.tsx
    TemplateList.tsx
  hooks/
    useDockerDeployForm.ts
    useDockerRuntimeAudit.ts
  utils/
    ports.ts
    env.ts
    runtimeAudit.ts
```

Tahap aman awal:

- jangan pindah semua sekaligus
- extract util murni dulu
- lalu extract modal
- lalu extract row/list

### `index.css` terlalu besar

`src/index.css` saat ini menjadi global style monolith.

Target bertahap:

```txt
src/styles/
  base.css
  layout.css
  panel.css
  docker.css
  windows.css
```

Namun pemisahan CSS perlu hati-hati agar visual tidak berubah.

## Aturan Komponen Baru

1. Jika hanya dipakai di satu window, letakkan dekat fitur/window.
2. Jika dipakai banyak window, letakkan di `components/common` atau `components/system`.
3. Jika komponen punya state API/polling sendiri, pertimbangkan hook khusus.
4. Hindari menambah logic baru ke file window yang sudah terlalu besar.

## Aturan Hook

Hook query/polling harus memperhatikan active window:

```ts
const pollingActive = useWindowPollingActive(win)
```

Interval polling harus bisa berhenti saat window tidak fokus/minimized.

## Validasi Frontend

Wajib jalankan:

```powershell
bun run build
```

Jika mengubah UI besar, lakukan manual check:

- Docker window
- Users window
- Projects window
- Tunnels/Cloudflare window
- modal yang terkait perubahan
