# Reneo Design System (`DESIGN.md`)

Sumber kebenaran visual untuk **Reneo**, panel server Linux bergaya desktop (React 19 + Go agent).
Dokumen ini mencerminkan kode yang berjalan. Jika kode berubah, perbarui dokumen ini.

Dokumen terkait:

- [.agents/rules/design-system.md](.agents/rules/design-system.md): aturan wajib saat menulis UI
- [.agents/rules/component-list.md](.agents/rules/component-list.md): inventaris komponen & class
- [.agents/rules/ui-components.md](.agents/rules/ui-components.md): kit komponen umum (`IconBadge`, `SectionHeader`, `SettingRow`, ...)
- [.agents/skills/anti-slop/SKILL.md](.agents/skills/anti-slop/SKILL.md): larangan slop & checklist review

---

## 1. Alur Aplikasi

```text
/            LandingPage      publik, scrollable
/docs/mcp    McpGuidePage     publik, scrollable
/login       LoginPage        redirect ke /home jika sudah login (path dari VITE_LOGIN_PATH)
/home        DesktopPage      wajib login, satu-satunya tempat "desktop"
*            FrontendNotFoundPage
```

Lapisan runtime ([src/shell/index.tsx](src/shell/index.tsx), [src/router/index.tsx](src/router/index.tsx)):

```text
main.tsx -> App -> AppShell (cek sesi, shortcut global, revision sync)
                     -> AppRouter (AnimatePresence, transisi 200-250ms)
                          -> Desktop
                               Taskbar (atas, 44px)
                               DesktopIcon[] + DesktopWidgetLayer
                               Window[]  (floating, drag, resize, minimize/maximize/fullscreen)
                               Dock (bawah, auto-hide)
                               LockScreen, CommandPalette, GlobalAlert
```

Alur data:

- Remote state: TanStack Query lewat `src/api/*` (axios client, cookie sesi HttpOnly `reneo_session`).
- UI state: Zustand (`windowStore`, `themeStore`, `authStore`, `widgetStore`, `commandStore`, `alertStore`, `editorStore`).
- Window baru: `openWindow(kind)` di `windowStore`. Konten dipetakan lewat `WINDOW_CONTENT` di [Desktop.tsx](src/components/desktop/Desktop.tsx). Semua window singleton.
- Polling hanya jalan saat window fokus (`useWindowPollingActive`).
- Bahasa: `id` dan `en` ([src/lib/i18n.tsx](src/lib/i18n.tsx)). Semua teks UI lewat `t('key')`.

---

## 2. Filosofi Visual

1. **Desktop OS di browser.** Window chrome presisi, taskbar, dock, widget. Rasanya workstation Linux, bukan macOS.
2. **Alat operator, bukan brosur.** Kerapatan informasi yang nyaman dibaca sysadmin. Terinspirasi Cloudflare Zero Trust, Grafana, Linear, Supabase.
3. **Data nyata dulu.** Angka, nama container, port, log. Dekorasi hanya jika membawa informasi.
4. **Satu sistem token.** Warna, bayangan, dan radius datang dari CSS variable, bukan nilai lepas.

---

## 3. Tema & Token

Tema ditentukan `data-theme="light|dark"` pada `<html>` (diatur [themeStore.ts](src/store/themeStore.ts), **default `light`**). Token hidup di [src/assets/scss/_variables.scss](src/assets/scss/_variables.scss): blok `:root` untuk light, `[data-theme="dark"]` menimpa untuk dark. Setiap token baru **wajib** didefinisikan di kedua blok.

### Token inti

| Peran | Token | Light | Dark |
| :--- | :--- | :--- | :--- |
| Latar window | `--win-bg` | `rgba(255,255,255,.95)` | `rgba(15,23,42,.96)` |
| Isi window | `--win-content-bg` | `#ffffff` | slate gelap |
| Border | `--win-border` | `rgba(203,213,225,.88)` | putih transparan rendah |
| Teks utama | `--win-text` | `#1e293b` | `#f8fafc` |
| Teks sekunder | `--text-secondary` | `#4b5563` | slate-400 |
| Surface | `--panel-surface`, `-strong`, `-hover` | tint gelap 3-7% | tint terang |
| Field | `--panel-field-bg`, `--panel-field-focus` | | |
| Primary | `--panel-primary-solid` / `-text` / `-bg` / `-hover` | `#2563eb` / `#1d4ed8` | `#3b82f6` / `#93c5fd` |
| Danger | `--panel-danger-solid` / `-text` / `-bg` | `#b91c1c` | |
| Success / Warning / Info / Neutral | `--panel-{name}-bg`, `--panel-{name}-text` | | |
| Fokus | `--focus-ring`, `--focus-ring-offset` | `#1d4ed8` | |
| Status titik | `--status-online`, `--status-offline`, `--status-error` | | |
| Kode / log | `--panel-code-bg`, `--panel-code-text` | `#0f172a` / `#dbeafe` | |
| Aksen brand | `--accent` | `#f76707` | |

Token per komponen (`--dock-*`, `--tb-*`, `--widget-*`, `--menu-*`, `--status-page-*`) hanya dipakai oleh komponen pemiliknya.

### Wallpaper

14 preset di `WALLPAPERS` (gradient CSS variable `--wallpaper-*-{light,dark}` atau gambar `/wallpapers/*.jpg`) plus `custom`. Overlay `--app-wallpaper-overlay-bg` menjaga keterbacaan.

### Catatan konsistensi

- Aksen UI fungsional adalah **biru** (`--panel-primary-*`). Oranye `--accent` hanya untuk brand/seleksi (`::selection`) dan Cloudflare.
- Warna ikon aplikasi didefinisikan satu tempat: `ICON_MAP` di [AppIcon.tsx](src/components/common/AppIcon.tsx).

---

## 4. Tipografi

| Peran | Variable | Default |
| :--- | :--- | :--- |
| UI | `--font-sans` | `Outfit` (pilihan user: Inter, Plus Jakarta Sans, Geist, Roboto via `data-font`) |
| Mono | `--font-mono` | `JetBrains Mono` |
| Skala dasar | `data-font-size` | small 14.5px, medium 16px, large 17.5px |

Pakai mono untuk: terminal, log, IP, port, path, hash, nama container, cron, perintah. Judul window `0.8125rem / 600 / tracking -0.01em`. Konten window `13px / 1.5`.

---

## 5. Bentuk, Jarak, Elevasi

| Elemen | Nilai |
| :--- | :--- |
| Taskbar | tinggi 44px, `z-index: 60000`, `blur(20px)`, border bawah |
| Window header | min-height 40px, padding `6px 14px`, tombol kontrol 28x28, radius 6 |
| Window body | padding `12px 14px`, stack gap 12 |
| Kontrol (tombol, field, select, pencarian) | satu ukuran dari token `--control-h` 32px (`-sm` 28, `-lg` 40), radius `--control-radius` 8px, teks `--control-font` 0.75rem; sama dengan bar window Docker. Tombol `.panel-btn` font 600; field `.panel-input` tidak berubah ukuran saat fokus (hanya border dan latar). Di ponsel (`.layout-mobile`) field dan select 40px, tombol 36px |
| Card / table container | radius 14, border 1px `--win-border`, surface `--panel-surface` |
| KPI card | radius 18, padding 14 |
| Modal card | radius 24, padding 24, lebar maks 460, `--panel-card-shadow` |
| Badge | pill, min 28px, `0.75rem/600` |
| Status dot | 7px, halo 4px `color-mix` 18% |
| Motion | 120-160ms ease untuk hover; 200-250ms `[0.25,1,0.5,1]` untuk transisi halaman |

Z-index window: normal 100, maximized 500, fokus 50000, fullscreen 120000. Taskbar 60000 berada di atas window biasa, di bawah fullscreen.

---

## 6. Window Chrome

- Header kiri: `AppIcon` 16px + judul (`windowTitleKey`). Kanan: Minimize (`Minus`), Maximize/Restore (`Square`/`Copy`), Fullscreen (`Maximize`), Close (`X`), semua ikon garis `strokeWidth 1.75`.
- Hover close memakai `--window-close-hover-bg` (merah), tombol lain `--tb-hover`.
- Double-click header = maximize. Resize 8 arah. Alert modal in-window lewat `InnerAlert`.
- **Tidak ada traffic light macOS** di mana pun.

---

## 7. Struktur Stylesheet

```text
src/assets/
  css/tailwind.css        entry Tailwind v4 + utilitas kecil (scrollbar widget)
  scss/
    global.scss           @use base, variables, modules
    _base.scss            import font, reset
    _variables.scss       semua token (:root, [data-theme="dark"], data-font*)
    modules/              _desktop _taskbar _windows _components _terminal
                          _docker _cloudflare _login _landing _index
```

Pembagian peran:

- **Tailwind**: layout cepat, spacing, flex/grid di TSX.
- **SCSS modul**: komponen bernama (`.panel-*`, `.docker-*`, `.ht-*`, `.taskbar-*`). Dipakai ulang lintas window. Halaman login dan landing memakai Tailwind inline.
- **Inline style**: hanya nilai dinamis (posisi, ukuran window, z-index).

Penamaan: BEM ringan `.block`, `.block__elem`, `.block--mod`. Prefix mengikuti modul pemilik.

---

## 8. Ikonografi

- Ikon aplikasi: `@fluentui/react-icons` varian `24Filled` lewat `AppIcon`.
- Ikon aksi/kontrol: `lucide-react`, garis, `strokeWidth 1.75`.
- Dilarang emoji sebagai ikon UI. (Field `icon` emoji di `DEFAULTS` windowStore adalah sisa lama, jangan dirender.)

---

## 9. Aksesibilitas

- Fokus terlihat: `:focus-visible` memakai `--focus-ring` dengan offset. Jangan `outline: none` tanpa pengganti.
- Teks sekunder tidak boleh di bawah kontras 4.5:1 pada surface-nya, di kedua tema.
- Target klik minimal 28px untuk kontrol padat, 44px untuk field.
- Hormati `prefers-reduced-motion` untuk animasi dekoratif baru.

---

## 10. Hutang Visual yang Diketahui

Status setelah audit dan perbaikan 2026-10-12. Yang sudah diperbaiki tidak ditulis ulang di sini; lihat riwayat git.

| Lokasi | Masalah | Aturan |
| :--- | :--- | :--- |
| `_terminal.scss` (63), konsol deploy Docker di `_docker.scss` (22), blok log di `_components.scss` (8) | Warna lepas. **Pengecualian disengaja** untuk permukaan terminal/log yang selalu gelap di kedua tema; jangan dijadikan contoh di luar itu | Rules 3.1 |
| `_login.scss` (28) | Variabel tema halaman login (`--login-*`) berisi warna lepas. Halaman login belum memakai token panel | Rules 3.1 |
| `AppIcon` `ICON_MAP` (19), `McpGuidePage` (12), `DesktopShowcase` (10), `LandingPage`, `LockScreen` | Warna lepas di TSX (hex dan Tailwind arbitrary value) | Rules 3.1 |
| `--panel-accent-gradient`, `--status-page-*`, `--action-cloudflare-gradient`, `--login-avatar-bg` | Gradient dekoratif multi-warna di token | Anti-slop 2.4 |
| `ApiTokensTab` (kalimat panjang bermarkup `<strong>`), `TunnelsWindow` (label), `LandingPage` (nav), `McpGuidePage`, `DesktopShowcase`, `DebugPanel` | String UI hardcoded tanpa `t()` | Rules 5.6 |
| `DebugPanel`, `DebugGrid` | Emoji di overlay dev (tidak tampil di produksi) | Rules 5.7 |
| `.panel-input`, `.panel-search__input`, `.ht-manager-input`, `.docker-image-combobox__item` | Memakai `outline: none`; sudah punya pengganti fokus (ring/border). Pertahankan pasangan itu | Aksesibilitas |
| `DeployModal.tsx` (600+ baris), `useDockerWindow`, `useFileManager`, `useProjectsWindow`, `useTunnelsWindow` | Hook/komponen masih besar; pecah lagi per bagian form/aksi bila disentuh | Rules 1.4 |
| `UsersWindow`, `HostTerminalWindow`, `DatabaseWindow`, `FileEditorWindow`, `DocsWindow` | 340-600 baris dalam satu file; belum dipecah | Rules 1.4 |
| ESLint | 0 error, 112 warning (terutama `any`, `react-refresh/only-export-components`) | Rules 8 |
