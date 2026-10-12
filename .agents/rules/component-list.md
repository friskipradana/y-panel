# Component List

Inventaris komponen YPanel. Cek di sini sebelum membuat komponen atau class baru. Aturan pemakaian: [design-system.md](design-system.md).

## 1. Shell & Halaman

| Komponen | File | Peran |
| :--- | :--- | :--- |
| `AppShell` | `src/shell/index.tsx` | Cek sesi, shortcut global, revision sync, host router |
| `AppRouter` | `src/router/index.tsx` | Rute `/`, `/docs/mcp`, `/login`, `/home`, `*` dengan transisi |
| `LandingPage` | `src/pages/LandingPage.tsx` | Halaman publik |
| `McpGuidePage` | `src/pages/McpGuidePage.tsx` | Panduan MCP publik |
| `LoginPage` | `src/pages/LoginPage.tsx` | Login + wizard first-run |
| `DesktopPage` | `src/pages/DesktopPage.tsx` | Pembungkus `Desktop` |
| `FrontendNotFoundPage` | `src/components/system/` | 404 frontend |
| `StatusPage` | `src/components/system/` | Halaman status/error sistem |
| `WindowErrorBoundary` | `src/components/system/` | Error boundary per window |
| `DesktopShowcase` | `src/components/landing/` | Pratinjau desktop di landing |

## 2. Desktop Chrome

| Komponen | File | Catatan |
| :--- | :--- | :--- |
| `Desktop` | `components/desktop/Desktop.tsx` | Menyusun taskbar, ikon, widget, window, dock. Registri `WINDOW_CONTENT` |
| `Window` | `components/desktop/Window.tsx` | Drag, resize 8 arah, min/max/fullscreen, `InnerAlert` |
| `DesktopIcon` | `components/desktop/DesktopIcon.tsx` | Gaya `framed`/`plain`, ukuran, bobot font dari `themeStore` |
| `LockScreen` | `components/desktop/LockScreen.tsx` | Gaya `clock`, `matrix`, `starfield`, `modern`, `none` |
| `Taskbar` | `components/taskbar/Taskbar.tsx` | Bar atas 44px: menu, jam, notifikasi, tray |
| `ApplicationsMenu` | `components/taskbar/` | Daftar aplikasi |
| `ProfileMenu` | `components/taskbar/` | Akun, tema, logout |
| `LanguageSwitcher` | `components/taskbar/` | `id` / `en` |
| `Dock` | `components/dock/Dock.tsx` | Auto-hide, preview window, context menu |
| `CommandPalette` | `components/common/` | `cmdk`, pintasan global, tambah widget |
| `GlobalAlert` / `InnerAlert` | `components/alert/` | Konfirmasi & notifikasi, global dan in-window |
| `AppIcon` | `components/common/` | Satu-satunya pemetaan ikon aplikasi |
| `DateTimeText` | `components/common/` | Format tanggal/waktu konsisten |
| `PanelSelectMenu` | `components/system/` | Dropdown pilihan bergaya panel |
| `DevOverlay`, `DebugPanel`, `DebugGrid` | `components/debug/` | Hanya mode dev |

## 3. Window Aplikasi (`WindowKind`)

| Kind | Komponen | Folder |
| :--- | :--- | :--- |
| `apps` | `DockerWindow` | `windows/docker/` (`ContainersTab`, `ImagesTab`, `NetworksTab`, `TemplatesTab`, `DockerComponents`) |
| `host-terminal` | `HostTerminalWindow` | `windows/` (xterm, multi-pane, preset) |
| `terminal` | placeholder | `Desktop.tsx` |
| `system` | `SystemWindow` | `windows/` |
| `system-logs` | `SystemLogsWindow` | `windows/` |
| `file-manager` | `FileManagerWindow` | `windows/` |
| `file-editor` | `FileEditorWindow` | `windows/` (Monaco) |
| `database` | `DatabaseWindow` | `windows/` |
| `projects` | `ProjectsWindow` | `windows/` |
| `tunnels` | `TunnelsWindow` | `windows/` (Cloudflare) |
| `users` | `UsersWindow` | `windows/` |
| `settings` | `SettingsWindow` | `windows/` + `settings/ApiTokensTab` |
| `profile` | `ProfileWindow` | `windows/` |
| `widgets` | `WidgetsWindow` | `windows/` |
| `docs` | `DocsWindow` | `windows/` |
| `changelog` | `ChangelogWindow` | `windows/` |
| `portainer`, `trash` | placeholder | `Desktop.tsx` |

## 4. Widget Desktop

`WidgetContainer` memetakan `WidgetType` ke komponen. State di `widgetStore`, lapisan di `DesktopWidgetLayer`.

| Type | Komponen |
| :--- | :--- |
| `clock-uptime` | `ClockUptimeWidget` |
| `system-vital` | `SystemVitalWidget` |
| `network-traffic` | `NetworkTrafficWidget` |
| `cpu-graph` | `CpuGraphWidget` |
| `quick-note` | `QuickNoteWidget` |

Utilitas scrollbar: `.custom-widget-scrollbar` (`tailwind.css`).

## 5. Class Bersama (`.panel-*`)

Didefinisikan di `_windows.scss` dan `_components.scss`. Ini kosakata UI utama.

| Grup | Class |
| :--- | :--- |
| Frame | `.panel-window`, `__header`, `__title`, `__icon`, `__title-text`, `__meta`, `__actions`, `__body` (`--fluid`), `__stack` |
| Surface | `.panel-surface`, `.panel-card` (`--interactive`), `.panel-shell-card`, `.panel-muted-block` |
| Tabel/baris | `.panel-table-container`, `.panel-table-row`, `.row-top` |
| Tombol | `.panel-btn` + `--ghost`, `--primary-soft`, `--primary`, `--danger-soft`, `--danger`; `.panel-icon-btn` + `--primary`, `--success`, `--warning`, `--danger` |
| Field | `.panel-input` (`--mono`), `.panel-select`, `.panel-textarea`, `.panel-search`, `.panel-hint`, `.panel-section-label` |
| Status | `.panel-badge` + `--primary`, `--success`, `--warning`, `--danger`, `--info`, `--neutral`; `.panel-status--*`; `.panel-status-dot`; `.status-orb` (`--warn`) |
| Data | `.panel-kpi-card`, `.panel-kpi-grid`, `.panel-progress` (`__bar`), `.panel-timeline`, `.panel-meta-line`, `.panel-log-surface`, `.panel-mono` |
| Toolbar | `.panel-toolbar` (`--flat`, `--search`), `.panel-pagination`, `.panel-pagination-summary` |
| Feedback | `.panel-empty` (`--wide`), `.panel-loading`, `.panel-error-state`, `.panel-alert` |
| Overlay | `.panel-modal-overlay`, `.panel-modal-card` |
| Lain | `.panel-avatar`, `.panel-hero`, `.panel-grid-compact` (`--2`) |

## 6. Class per Fitur

| Prefix | Modul | Isi |
| :--- | :--- | :--- |
| `.docker-*` | `_docker.scss`, `_components.scss` | toolbar, flat row, deploy wizard, progress console, image combobox, token chip, log viewer |
| `.tunnel-flat-row*` | `_components.scss` | baris tunnel Cloudflare |
| `.ht-*` | `_terminal.scss` | tabbar, pane, preset, manager, status dot |
| `.taskbar-*` | `_taskbar.scss` | nav, ikon, jam, bahasa, notifikasi |
| `.login-*` | `_login.scss` | shell, hero, form, status card |
| `.landing-*` | `_landing.scss` | nav, hero, fitur, install card, showcase |
| `.desktop-root` | `_desktop.scss` | wadah wallpaper, scrollbar global, `::selection` |

## 7. Store, Hook, Lib

| Jenis | Daftar |
| :--- | :--- |
| Store | `windowStore`, `themeStore`, `authStore`, `widgetStore`, `commandStore`, `alertStore`, `editorStore` (`middleware/mutative`) |
| Hook | `useGlobalShortcuts`, `useRevisionSync`, `useWindowPollingActive`, `useContainers`, `useTerminalSession`, `useTerminalExec`, `useCapturedNotificationsSocket` |
| Lib | `i18n` (`t`, `useI18n`), `alert`, `datetime`, `sound`, `lazy`, `runtimeLogger` |
| API | `src/api/*` (agent, auth, docker, files, system, tunnels, cloudflare, projects, users, apiTokens, notifications, payment, portainer, terminal, docs) |

## 8. Menambah Komponen

1. Cek tabel di atas. Ada yang cocok? Pakai.
2. Belum ada: letakkan di folder pemilik, pakai token, buat state lengkap (hover, fokus, disabled, empty, loading, error).
3. Perbarui file ini pada PR yang sama.
