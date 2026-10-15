# Design System Rules

Aturan wajib saat menulis atau mengubah UI Reneo. Penjelasan lengkap ada di [DESIGN.md](../../DESIGN.md). Inventaris komponen ada di [component-list.md](component-list.md).

## 1. Sebelum Menulis UI

1. Cari komponen/class yang sudah ada di [component-list.md](component-list.md). Pakai ulang sebelum membuat baru.
2. Window baru wajib: tambah `WindowKind` di `src/types`, `DEFAULTS` di `windowStore`, entri di `WINDOW_CONTENT` ([Desktop.tsx](../../src/components/desktop/Desktop.tsx)), `ICON_MAP` di `AppIcon`, key i18n `id` dan `en`.
3. Komponen window hidup di `src/components/windows/`. Halaman penuh di `src/pages/`. Tidak ada barrel `index.ts` kosong.
4. Satu file maksimal sekitar 400 baris. Window yang lebih besar dipecah menjadi: file shell tipis `<Name>Window.tsx`, hook `windows/<name>/use<Name>Window.ts(x)` untuk state/query/handler, dan satu komponen per bagian (toolbar, modal, tab) yang menerima state hook lewat satu prop. Contoh: `SettingsWindow` + `settings/hooks` + `settings/tabs`.
5. Pola yang berulang (kotak ikon, header seksi, baris pengaturan, toggle, kartu terpilih) memakai kit di `src/components/ui/`, bukan disalin. Aturannya di [ui-components.md](ui-components.md).

## 2. Struktur & Styling

1. Layout ad-hoc: Tailwind. Komponen yang dipakai ulang: class `.panel-*` di SCSS modul. Nilai dinamis saja yang boleh inline style.
2. Class SCSS baru masuk modul pemilik (`_docker`, `_terminal`, `_cloudflare`, dst.) dengan prefix yang sama dan penamaan BEM (`.block__elem--mod`). Modul baru wajib di-`@forward` di `modules/_index.scss`.
3. Komentar SCSS/TS: satu baris `// Judul Bagian`. Tanpa banner `===`/`---`, tanpa mojibake.

## 3. Warna & Token

1. Tidak ada hex/rgba lepas di komponen. Pakai variable dari `_variables.scss`. Butuh warna baru: buat token di **`:root` dan `[data-theme="dark"]`** sekaligus. Satu-satunya pengecualian: permukaan terminal/log yang selalu gelap.
2. Status memakai set semantik: `success`, `warning`, `danger`, `info`, `neutral`, `primary`. Jangan pakai warna mentah untuk status.
3. Aksi utama = `--panel-primary-*` (biru). Hanya satu tombol primary solid per area.
4. Tes dua tema (light default, dark) dan dua ukuran font (`small`, `large`) sebelum selesai.

## 4. Tipografi

1. Teks UI memakai `var(--font-sans)`, jangan hardcode `Outfit`.
2. Data teknis memakai `var(--font-mono)` atau `.panel-mono` / `.panel-input--mono`: IP, port, path, hash, nama container, log, perintah.
3. Jangan menambah ukuran font baru di luar skala yang ada (`0.75rem`, `0.8125rem`, `0.875rem`, `13px` konten).

## 5. Komponen & Interaksi

1. Window controls: ikon garis lucide `strokeWidth 1.75`. Tanpa bulatan warna.
2. Setiap kontrol interaktif punya state: hover, `:focus-visible`, disabled, dan loading bila async.
3. Hover tidak boleh menggeser layout. Pakai perubahan warna/background. Tidak ada `translate` pada baris tabel dan field; pada tombol maksimal `translateY(-1px)`.
4. Setiap daftar/tabel punya empty state (`.panel-empty`), loading state (`.panel-loading`), dan error state (`.panel-error-state`).
5. Aksi destruktif lewat `GlobalAlert`/`InnerAlert` dengan nama objek yang jelas. Tombol memakai `.panel-btn--danger`.
6. Teks UI selalu lewat `t()`. Tidak ada string Indonesia/Inggris langsung di JSX.
7. Ikon aplikasi lewat `<AppIcon kind=... />`. Kotak ikon lewat `IconBadge`. Tidak ada emoji sebagai ikon.

## 6. Layout & Scroll

1. Halaman publik (landing, docs, MCP guide) harus scrollable (`overflow-y-auto`). Jangan `overflow-hidden` di root konten.
2. `overflow-hidden` di root hanya untuk desktop shell, terminal, dan log viewer yang mengelola scroll sendiri.
3. Dialog dan popover harus muat di window terkecil (lebar 500px) tanpa terpotong.

## 7. Performa & State

1. Polling hanya saat window fokus (`useWindowPollingActive`).
2. Tahan double-mount React 19 StrictMode: cleanup untuk socket, interval, listener.
3. Remote data lewat TanStack Query, state UI lewat Zustand. Tidak ada `fetch` langsung di komponen.

## 8. Selesai Berarti

- `bun run build` exit 0 tanpa warning, `bun run lint` bersih, `bun run check:ui` 0 error.
- Light + dark dicek, tidak ada teks tak terbaca.
- Tidak ada pelanggaran di [anti-slop](../skills/anti-slop/SKILL.md).
- Perilaku lama tetap utuh (fidelity 100%) kecuali memang diminta berubah.
