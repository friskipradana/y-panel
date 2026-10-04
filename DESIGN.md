# YPanel — Design System & Visual Architecture (`DESIGN.md`)

Dokumen ini mendefinisikan standar desain visual, theming, tipografi, arsitektur SCSS modular, serta prinsip estetika antarmuka untuk **YPanel** (Desktop-style Linux Server Control Panel).

---

## 1. Filosofi Desain

1. **Native Desktop OS di Web Browser**:
   - YPanel didesain menyerupai workstation modern native (window chrome presisi, subtle backdrop blur, draggable header, window controls responsif, minimasi ke taskbar).
2. **Developer-First Infrastructure Aesthetics**:
   - Terinspirasi dari standar desain infrastruktur modern (Linear, Cloudflare Dashboard, Vercel, Supabase).
   - Tampilan tajam, minim ornamen berlebihan (*no visual clutter / no AI slop*), mengutamakan *information density* yang nyaman dibaca oleh sysadmin dan DevOps.
3. **Clean Geometric UI (No macOS Traffic Lights)**:
   - Gunakan kontrol jendela minimalis khas workstation Linux (Close, Minimize, Maximize dengan icon tajam).
   - Menghindari bulatan warna merah/kuning/hijau khas macOS.

---

## 2. Tipografi & Font Stack

| Peruntukan | Font Family | Karakter & Penggunaan |
| :--- | :--- | :--- |
| **Primary / UI** | `Outfit, sans-serif` | Heading, titlebar, label tombol, menu navigasi, modal dialog. Modern, rounded, dan tajam. |
| **Monospace / Code** | `'JetBrains Mono', monospace` | Host Terminal, log viewer, status badge, port mapping, cron table, IP addresses, dan command snippets. |

```scss
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```

---

## 3. Color Tokens & Theming System

YPanel menggunakan CSS custom properties yang terdaftar di `src/assets/scss/_variables.scss`:

### A. Dark Theme Tokens (Default)
| Token | Nilai / Deskripsi | Fungsi |
| :--- | :--- | :--- |
| `--win-bg` | `#0f172a` (Deep Slate-900) | Latar belakang jendela & container utama |
| `--win-surface` | `#1e293b` (Slate-800) | Surface card, section, panel header |
| `--win-border` | `rgba(255, 255, 255, 0.08)` - `0.12` | Border halus transparan pada frame & divider |
| `--win-text` | `#f8fafc` (High-contrast slate-50) | Teks utama, judul, data penting |
| `--win-text-muted` | `#94a3b8` (Slate-400) | Teks sekunder, label, helper text |
| `--panel-primary` | `#38bdf8` (Cyan-400) / `#6366f1` (Indigo-500) | Aksen utama tombol, link aktif, highlight |
| `--panel-success` | `#22c55e` (Green-500) | Status container running, tunnel active, port open |
| `--panel-danger` | `#ef4444` (Red-500) | Status container stopped, error alert, delete action |
| `--panel-warning` | `#f59e0b` (Amber-500) | Warning notice, resource high threshold |

### B. Glassmorphism & Elevation
- **Window Chrome**: `backdrop-filter: blur(20px); background: rgba(15, 23, 42, 0.85);`
- **Top Taskbar**: `backdrop-filter: blur(20px); height: 44px; z-index: 60000;`
- **Modal Backdrop**: `backdrop-filter: blur(12px); background: rgba(0, 0, 0, 0.6);`

---

## 4. Arsitektur SCSS & CSS Modular

Struktur stylesheet dikelola di bawah `src/assets/`:

```text
src/assets/
├── css/
│   └── tailwind.css             # Entrypoint khusus @import "tailwindcss";
└── scss/
    ├── global.scss              # Root stylesheet (@use "./base", "./variables", "./modules")
    ├── _base.scss               # Font imports & CSS element resets
    ├── _variables.scss          # Design tokens & color variables (:root, [data-theme])
    └── modules/                 # Modul-modul terisolasi per fitur
        ├── _index.scss          # Barrel @forward untuk seluruh modul
        ├── _desktop.scss        # Wallpaper container, transition, selection style
        ├── _taskbar.scss        # Taskbar header, clock tray, profile popover
        ├── _windows.scss        # Base window chrome, titlebar, split panes
        ├── _components.scss     # Shared UI: modals, form inputs, combobox, badges
        ├── _terminal.scss       # Multi-pane terminal, tabs, status dot, presets
        ├── _docker.scss         # Docker deploy wizard, progress overlay & console
        ├── _cloudflare.scss     # Cloudflare workspace, tunnel table, metrics
        ├── _login.scss          # Layar login & first-run wizard steps
        └── _landing.scss        # Public landing page, interactive hero previews
```

---

## 5. Kaidah Penulisan Komentar & Kode (Anti-Slop)

1. **Modern Single-Line Comments**:
   Gunakan komentar satu baris yang bersih dan to the point:
   ```scss
   // Multi-Pane Terminal & Presets
   .ht-root { ... }
   ```
2. **Dilarang Menambahkan ASCII Box Banners**:
   Hindari komentar blok panjang dengan deretan garis tebal (`===` atau `---` panjang) yang memadati layar dan mengganggu navigasi kode.
3. **Separation of Concerns**:
   - Utilitas Tailwind murni di `tailwind.css`.
   - Modul antarmuka server diatur dalam file partial `modules/_*.scss`.
