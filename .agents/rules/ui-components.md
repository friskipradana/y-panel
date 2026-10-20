# UI Kit: Komponen Umum & Aturan

Komponen dasar yang wajib dipakai di seluruh Reneo. Lokasi: `src/components/ui/`. Import langsung per file (tanpa barrel):

```tsx
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
```

Aturan umum: [design-system.md](design-system.md). Validasi otomatis: `bun run check:ui` (pelanggaran kategori **error** menggagalkan review).

## 0. Prinsip

1. **Kit dulu, bukan class.** Class `.panel-*` hanyalah detail implementasi kit. Kode fitur tidak menulis `className="panel-btn ..."`, kotak ikon, toggle, modal, atau baris daftar sendiri.
2. **Tidak ada pengecualian tanpa dukungan kit.** Jika kebutuhan tidak muat di komponen (mis. sheet penuh-window, baris kaya), perluas komponen kit-nya, jangan menyalin markup di fitur.
3. **Satu keputusan di satu tempat.** Ukuran, radius, warna, jarak, dan perilaku fokus ditentukan di `ui/`. Fitur hanya memilih `size`/`tone`/`variant`.
4. **Semantik dulu, tampilan kedua.** Pilih komponen berdasarkan arti (aksi destruktif, status, daftar data), bukan warna yang diinginkan.

## 1. Katalog

| Komponen | File | Pakai untuk | Props utama |
| :--- | :--- | :--- | :--- |
| `IconBadge` | `IconBadge.tsx` | Satu-satunya kotak ikon | `children`, `size` sm/md/lg, `tone` |
| `SectionHeader` | `SectionHeader.tsx` | Ikon + judul + subjudul (+ aksi) | `icon`, `title`, `subtitle?`, `tone?`, `size?`, `actions?` |
| `SettingRow` | `SettingRow.tsx` | Baris pengaturan | `title`, `description?`, `control`, `icon?`, `children?` |
| `Button` | `Button.tsx` | Tombol teks | `variant` default/primary/primary-soft/ghost/outline/danger/danger-soft, `size` sm/md/lg, `block`, `loading`, `icon` |
| `IconButton` | `IconButton.tsx` | Tombol hanya ikon | `label` (wajib), `tone` |
| `Badge` | `Badge.tsx` | Status singkat | `tone`, `dot` |
| `ToggleSwitch` | `ToggleSwitch.tsx` | Saklar on/off | `checked`, `onChange`, `label?`, `disabled?` |
| `Checkbox` | `Checkbox.tsx` | Kotak centang (opsi form, pilih baris) | `checked`, `onChange(checked)`, `label?`, `description?`, `tone?`, `indeterminate?` |
| `SelectableCard` | `SelectableCard.tsx` | Pilihan tunggal berbentuk kartu | `selected`, `onClick`, `className` |
| `Field`, `TextInput`, `Textarea` | `Field.tsx` | Label + kontrol + hint/error | `label`, `hint?`, `error?`; `mono`, `invalid` |
| `PasswordInput` | `PasswordInput.tsx` | Kolom kata sandi akun dengan tombol lihat/sembunyikan (`aria-label` dari `ui.showPassword`/`ui.hidePassword`); pakai ini, bukan `TextInput type="password"`, untuk kata sandi yang diketik orang | semua prop `TextInput` kecuali `type` |
| `Select` | `Select.tsx` | Dropdown (pencarian opsional); daftarnya digambar lewat portal di atas halaman, jadi tidak terpotong dialog atau window, dan berpindah ke atas tombol bila ruang di bawah sempit; tampilannya sama dengan menu dropdown tab Docker | `value`, `onChange`, `options`, `searchable`, `clearable`, `size` (`sm` = tinggi tombol toolbar 32px, sama dengan menu tab) |
| `SearchInput` | `SearchInput.tsx` | Kolom pencarian | `value`, `onChange`, `onSubmit?`, `placeholder`, `action?` |
| `Tabs` | `Tabs.tsx` | Tab horizontal | `items`, `value`, `onChange`, `label` |
| `DataTable` | `DataTable.tsx` | Data berkolom | `columns`, `rows`, `getRowKey`, `label`, `loading`, `emptyText` |
| `ListRow` | `ListRow.tsx` | Daftar dua tingkat ringkas | `title`, `tag?`, `actions?`, `details?` |
| `EntityRow` | `EntityRow.tsx` | Baris entitas kaya (user, project, container) | `leading?`, `title`, `badges?`, `subtitle?`, `meta?`, `actions?`, `description?`, `expanded?` |
| `Pagination` | `Pagination.tsx` | Sebelumnya / berikutnya | `page`, `totalPages`, `onChange` |
| `Modal` | `Modal.tsx` | Semua dialog dan sheet | `open`, `onClose`, `title`, `subtitle?`, `icon?`, `size`, `footer?`, `busyOverlay?`, `className?` (lapisan luar; window bertema sendiri seperti terminal menimpa token warna lewat kelas ini, mis. `.ht-modal`) |
| `ListTable`, `ListRowIcon`, `ListState` | `ListTable.tsx` | Tabel jendela daftar (Docker, Proyek): header kolom, baris datar bergaya container, dan state memuat/gagal/kosong; kolom diatur varian di `_docker.scss` | `variant`, `columns`, `empty`; `loading`, `error`, `empty`, `emptyTitle` |
| `ColumnMenu` | `ColumnMenu.tsx` | Header kolom bergaya spreadsheet: urut naik/turun dan centang nilai kolom (cari, pilih semua, hapus filter). Dipasang `ListTable` lewat `ListColumn.sort/filter`; jangan dipakai terpisah | `label`, `sort`, `filter` |
| `useListQuery` | `hooks/useListQuery.ts` | State pencarian, urutan, dan filter kolom satu tabel; `column(key, label, facets)` membuat header. Sort dan filter selalu di backend (`internal/listquery`, query `q`, `sort`, `order`, `f.<kolom>`; jawaban `items,total,all,facets`) | – |
| `FilterMenu` | `FilterMenu.tsx` | Menu pilihan dari satu tombol (pengganti tab atau filter), gaya dropdown tab Docker | `label`, `items` (`key`, `label`, `count?`), `value`, `onChange` |
| `Stepper` | `Stepper.tsx` | Langkah berurutan (centang untuk yang lewat, nama langkah aktif saja di layar sempit) | `items`, `value`, `onChange`, `canSelect?`, `label` |
| `KpiCard` | `KpiCard.tsx` | Kartu metrik + progres | `title`, `value`, `subtitle?`, `percent?`, `icon?` |
| `EmptyState`, `LoadingState`, `ErrorState` | `states.tsx` | Tiga state standar | `icon?`/`children`; `title` + `hint?` |

`tone`: `neutral` (default), `primary`, `success`, `warning`, `danger`, `info`; semuanya dari token `--panel-*`.

## 2. Memilih komponen

| Kebutuhan | Pakai |
| :--- | :--- |
| Tabel dengan kolom sejajar dan header | `DataTable` |
| Daftar item: nama + tag + aksi + detail satu blok | `ListRow` |
| Daftar item: avatar/ikon, badge inline, subjudul, meta, aksi banyak, panel yang bisa dibuka | `EntityRow` |
| Dialog kecil/form (hingga 980px, isi menyesuaikan) | `Modal size="sm"/"md"/"lg"/"xl"` |
| Lembar penuh tinggi window (log, pull image, editor panjang) | `Modal size="sheet"` |
| Proses panjang di dalam modal (deploy, pull) | `Modal busyOverlay={...}` |
| Konfirmasi singkat ya/tidak | `alertLib.confirm` (bukan Modal) |
| Pengaturan on/off | `SettingRow` + `ToggleSwitch` |
| Opsi centang dalam form atau pilih baris | `Checkbox` (bukan `<input type="checkbox">`) |
| Pilih satu dari beberapa kartu | `SelectableCard` |
| Pilih dari daftar panjang | `Select searchable` |

## 3. Ukuran dan bentuk (tidak diubah per pemakaian)

| Elemen | `size` | Kotak | Radius | Glyph |
| :--- | :--- | :--- | :--- | :--- |
| `IconBadge` | `sm` / `md` (default) / `lg` | 28 / 36 / 44px | lg / xl / 2xl | 14 / 16 / 20px |
| `Modal` | `sm` / `md` (default) / `lg` / `xl` / `sheet` | 420 / 520 / 720 / 980 / 840px penuh tinggi | 20px (sheet 18px) | – |

Stroke ikon selalu 1.75. Ukuran glyph diatur komponen; jangan memberi `size` atau warna pada ikon di dalam `IconBadge`.

## 4. Aturan wajib

### Umum
1. Dilarang menulis kotak ikon, toggle, kartu terpilih, overlay modal, atau baris daftar dengan class sendiri. Pakai komponen di atas.
2. Teks selalu lewat `t()` untuk `title`, `subtitle`, `description`, `label`, `placeholder`.
3. Satu `variant="primary"` per area. Aksi destruktif memakai `danger`/`danger-soft` dan lewat konfirmasi.
4. Warna menandakan arti (success = aktif, danger = destruktif), bukan dekorasi.
5. Simetri: tinggi blok teks sama dengan tinggi ikon; jangan menambah `mt-*` untuk menyejajarkan.

### Interaksi
6. Tombol ikon wajib `label` (menjadi `aria-label` dan tooltip).
7. Mutasi async memakai `loading={mutation.isPending}`, bukan mengganti teks sendiri.
8. `ToggleSwitch` tanpa label teks di dekatnya wajib punya `label`.
9. Daftar/tabel selalu menangani tiga kondisi dengan `LoadingState`, `EmptyState`, `ErrorState`.
10. `Tabs` wajib `label`; state tab yang harus bertahan diangkat ke hook window.

### Form
11. Bungkus kontrol dengan `Field`; error di `error`, bukan teks merah buatan. IP, port, path, token memakai `TextInput mono`.
12. Dropdown selalu `Select` (bukan `<select>`); opsi lebih dari 8 diberi `searchable`.

### Modal
13. Semua dialog memakai `Modal`; jangan membuat overlay sendiri. Esc, klik latar, animasi, dan semantik dialog sudah ditangani.
14. Tombol batal di kiri, aksi utama di kanan lewat `footer`. State form di-reset di `onClose`.
15. Berikan `open={state}` ke `Modal` agar animasi keluar berjalan; jangan membungkusnya dengan `{state && ...}`. Komponen modal yang membutuhkan data yang belum ada boleh `return null` lebih dulu.

### Daftar
16. `DataTable` wajib `label`, `getRowKey` stabil (id, bukan index), `emptyText`, `loading`. Aksi per baris di kolom terakhir `align="right"` memakai `IconButton`.
17. `ListRow`/`EntityRow` tidak memuat tabel di dalamnya; pecah ke `DataTable` bila butuh kolom.

## 5. Contoh

```tsx
<SectionHeader
  icon={<Cloud />}
  title={t('settings.cloudflare.cardTitle')}
  subtitle={t('settings.cloudflare.cardSubtitle')}
  tone="primary"
  actions={<Badge tone="success" dot>{t('common.active')}</Badge>}
/>

<Modal
  open={showCreate}
  onClose={closeCreate}
  title={t('users.createNewUser')}
  icon={<UserPlus />}
  footer={
    <>
      <Button variant="ghost" onClick={closeCreate}>{t('common.cancel')}</Button>
      <Button variant="primary" loading={createMut.isPending} onClick={submit}>{t('users.createUser')}</Button>
    </>
  }
>
  <Field label={t('users.username')} error={errors.username}>
    <TextInput value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
  </Field>
</Modal>

<Modal open={!!logTarget} onClose={closeLogs} title={t('docker.realtimeLogs')} subtitle={name} size="sheet" width={1040}>
  <LogViewer />
</Modal>

<EntityRow
  leading={<div className="panel-avatar">{user.username[0]}</div>}
  title={user.username}
  badges={<Badge tone="info">{user.role}</Badge>}
  subtitle={user.email}
  actions={<IconButton label={t('common.delete')} tone="danger" onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>}
  expanded={showQuota ? <QuotaForm /> : null}
/>
```

## 6. Menambah komponen ke kit

1. Dipakai di 3 tempat atau lebih, atau sudah muncul sebagai markup yang disalin.
2. Hanya menerima `size`/`tone`/`variant`; tidak menerima warna atau ukuran mentah.
3. Memakai token (`--panel-*`, `--win-*`), mendukung light dan dark, punya state fokus dan disabled.
4. Tambahkan ke tabel katalog di atas, ke [component-list.md](component-list.md), dan bila ada pola yang kini terlarang, ke aturan `check:ui`.

## 7. Validasi

```bash
bun run check:ui              # error = gagal, warning = informasi
bun run check:ui --warnings   # daftar lengkap
```

**Error**: bulatan macOS, `console.log`, emoji di TSX, ikon `Sparkles`/`Sparkle`/`WandSparkles`, kotak ikon/toggle/kartu terpilih tulisan sendiri, overlay modal tulisan sendiri, baris daftar tulisan sendiri (`panel-table-row` di luar `ui/`), kunci `t('...')` yang tidak ada di `id.ts` atau `en.ts` (`missing-i18n`).
**Warning**: class mentah `panel-btn`/`panel-badge`/`panel-input`, ukuran file di atas 400 baris, hex di TSX, hex di SCSS selain `_variables.scss` (`scss-hex`), atribut teks hardcoded, `<button>` ber-`title` tanpa `aria-label` (`icon-button-label`), `outline: none` tanpa gaya fokus.

Daftar pengecualian bangunan khusus (ikon desktop, dock, lock screen, logo merek) ada di `ALLOW` dalam [scripts/check-ui.ts](../../scripts/check-ui.ts); entri baru butuh alasan di PR.
