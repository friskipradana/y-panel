# Component List

Inventaris komponen Reneo. Cek di sini sebelum membuat komponen atau class baru. Aturan pemakaian: [design-system.md](design-system.md).

## 1. Shell & Halaman

| Komponen | File | Peran |
| :--- | :--- | :--- |
| `AppShell` | `src/shell/index.tsx` | Cek sesi, shortcut global, revision sync, host router |
| `AppRouter` | `src/router/index.tsx` | Rute `/`, `/docs/mcp`, `/login`, `/home`, `*` dengan transisi |
| `PublicShell`, `CopyBlock` | `src/components/public/` | Kerangka halaman publik (header, versi, footer; selalu tema gelap via `data-theme="dark"`) dan blok kode dengan tombol salin |
| `DemoAccess` | `src/pages/landing/DemoAccess.tsx` | Kartu akun demo di landing; muncul hanya bila agent mengaktifkan demo (`RENEO_DEMO_PASSWORD`, lihat `docs/security-hardening.md`). Role demo di UI = `demo`, hanya window `apps`, `projects`, `system`, `widgets`, `docs`, `changelog`, `profile` |
| `LandingPage` | `src/pages/LandingPage.tsx` | Halaman publik bermerek Reneo (filosofi: [FILOSOFI-RENEO.md](../../docs/FILOSOFI-RENEO.md)); versi dari `usePanelVersion` (`lib/version.ts`: versi agent, fallback versi bundle). Ikon merek di `public/` dan `public/brand/` dibuat oleh `scripts/make-brand-icons.py` (navy `#0B2A57`, R putih) |
| `McpGuidePage` | `src/pages/McpGuidePage.tsx` + `mcp-guide/` | Panduan MCP: `ConnectPanel`, `ToolCatalog`; `toolsData.ts` dibuat dari registry agent |
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
| `MobileShell`, `MobileHome`, `MobileNotifications` | `components/mobile/` | Layout ponsel (di bawah 768px, atau `?ui=mobile`): satu aplikasi layar penuh, navigasi bawah, daftar jendela terbuka, widget bertumpuk. Konten aplikasi memakai `windowRegistry` yang sama dengan desktop. Bar atas memuat lonceng notifikasi (`MobileNotifications`); menu akun memuat tema, bahasa, profil. Pilihan layout: `hooks/useIsMobileLayout`. Penyesuaian khusus ponsel di window memakai varian Tailwind `mobile:` (aktif hanya di dalam `.layout-mobile`), jangan container query, agar window desktop tidak berubah |
| `CommandPalette` | `components/common/` | `cmdk`, pintasan global, tambah widget |
| `GlobalAlert` / `InnerAlert` | `components/alert/` | Konfirmasi & notifikasi, global dan in-window |
| `AppIcon` | `components/common/` | Satu-satunya pemetaan ikon aplikasi |
| `DateTimeText` | `components/common/` | Format tanggal/waktu konsisten |
| `IconBadge`, `SectionHeader`, `SettingRow`, `Button`, `IconButton`, `Badge`, `ToggleSwitch`, `SelectableCard`, `Field`/`TextInput`/`Textarea`, `Select`, `SearchInput`, `Tabs`, `DataTable`, `ListRow`, `EntityRow`, `Pagination`, `Modal` (dialog dan sheet), `KpiCard`, `EmptyState`/`LoadingState`/`ErrorState` | `components/ui/` | UI kit umum. Aturan dan contoh di [ui-components.md](ui-components.md) |
| `DevOverlay`, `DebugPanel`, `DebugGrid` | `components/debug/` | Hanya mode dev |

## 3. Window Aplikasi (`WindowKind`)

Setiap window besar berupa shell tipis + folder pendamping. Hook memegang state, komponen bagian hanya merender.

| Kind | Shell | Folder pendamping |
| :--- | :--- | :--- |
| `apps` | `DockerWindow` | `docker/`: `useDockerWindow`, `DockerToolbar`, `ContainersTab`, `ImagesTab`, `NetworksTab`, `TemplatesTab`, `DeployModal`, `DeleteContainerModal`, `LogModal`, `DockerProgressOverlay`, `DockerComponents`, `constants` |
| `settings` | `SettingsWindow` | `settings/`: `constants`, `SettingsPrimitives`, `hooks/` (`useHostSettings`, `useCloudflareSettings`, `usePaymentSettings`, `useNotificationSettings`), `tabs/` (General, Appearance, Wallpaper, Desktop, Screensaver, Sound, Cloudflare, Network, Security, Payment, Notifications, Audit), `tabs/notifications/`, `ApiTokensTab` |
| `file-manager` | `FileManagerWindow` | `file-manager/`: `useFileManager`, `FileTabsStrip`, `FileToolbar`, `FileTableHeader`, `FileList`, `FileRow`, `FileStatusBar`, `BulkActionsBar`, `FileActionModal`, `RootAccessModal`, `FileContextMenu`, `fileManagerConfig` |
| `projects` | `ProjectsWindow` | `projects/`: `useProjectsWindow`, `ProjectsToolbar`, `ProjectsBody`, `ProjectCard`, `ProjectFormModal`, `StaticUploadOverlay`, `UploadDraftModal`, `projectsConfig` |
| `tunnels` | `TunnelsWindow` | `tunnels/`: `useTunnelsWindow`, `TunnelsToolbar`, `CloudflareSetupNotice`, `TunnelsBody`, `TunnelRows`, `TunnelModals`, `TunnelModalHost`, `ProfileModalHost`, `TunnelsShared`, `tunnelForms` |
| `host-terminal` | `HostTerminalWindow` | xterm, multi-pane, preset (belum dipecah) |
| `terminal`, `portainer`, `trash` | placeholder | `Desktop.tsx` |
| `system` | `SystemWindow` | belum dipecah |
| `system-logs` | `SystemLogsWindow` | belum dipecah |
| `file-editor` | `FileEditorWindow` | Monaco (belum dipecah) |
| `database` | `DatabaseWindow` | belum dipecah |
| `users` | `UsersWindow` | `users/`: `UserQuotaPanel` (kuota + pemakaian), `ResetPasswordModal`, `permissions` (cermin kebijakan agent: admin hanya mengelola user biasa, hanya superadmin memberi role admin) |
| `profile` | `ProfileWindow` | `profile/AccountSecurityCard` (pemakaian sendiri + ganti password) |
| `widgets` | `WidgetsWindow` | – |
| `docs` | `DocsWindow` | – |
| `changelog` | `ChangelogWindow` | – |

## 4. Widget Desktop

`WidgetContainer` memetakan `WidgetType` ke komponen dan memberi `widget` (id + `config`). State posisi dan konfigurasi di `widgetStore`; riwayat metrik di `metricsStore` (persisten, 1 jam @ 5 dtk); polling bersama lewat `useSystemSampler`.

| Type | Komponen | Konfigurasi (`widget.config`) |
| :--- | :--- | :--- |
| `clock-uptime` | `ClockUptimeWidget` | - |
| `system-vital` | `SystemVitalWidget` | `mode` bars/graph, `range` |
| `network-traffic` | `NetworkTrafficWidget` | `range` |
| `cpu-graph` | `CpuGraphWidget` | `range` |
| `quick-note` | `QuickNoteWidget` (sticky note, boleh banyak) | `text`, `color` (yellow/green/blue/pink/violet/plain, lihat `noteColors.ts`) |
| `ping` | `PingWidget` (boleh banyak) | `host`, `port` (0 = ICMP), `intervalSec`, `label`, `range` |

Ponsel: urutan dan kunci widget disimpan terpisah di `mobile` (`order`, `locked`) pada blob yang sama dan tidak menyentuh koordinat desktop; `resetLayout` di ponsel hanya mengosongkan `mobile`.

Penyimpanan: layout, konfigurasi, dan isi note milik akun, disimpan di tabel `user_preferences.widgets_data` lewat `GET/PUT /api/v1/me/widgets` (hook `useWidgetSync`; localStorage hanya cache dan tidak diwariskan ke akun lain). Riwayat CPU/RAM/disk/suhu/network direkam agent (`internal/metrics`, 1 jam @ 5 dtk, file `metrics-history.json`) dan diambil lewat `GET /api/v1/system/history?since=`. Riwayat ping masih lokal per browser.

Pendukung: `LineChart` + `RangeSwitch` (grafik garis dengan tooltip dan celah data), `chartStats.summarize`, `useMetricSeries(key)`. Kunci seri: `cpu`, `ram`, `disk`, `temp`, `net-rx`, `net-tx`, `ping:<widgetId>`.

Chrome widget (judul, grip, kunci, tutup) hanya muncul saat hover/fokus dan melayang di tepi atas, tidak menggeser isi. Isi widget memakai container query (`@[260px]:`) karena lebar widget mengikuti viewport (maks 280px).

Utilitas scrollbar: `.custom-widget-scrollbar` (`tailwind.css`).

## 5. Class Bersama (`.panel-*`)

Didefinisikan di `_windows.scss` dan `_components.scss`. Ini kosakata UI utama.

| Grup | Class |
| :--- | :--- |
| Frame | `.panel-window`, `__header`, `__title`, `__icon`, `__title-text`, `__meta`, `__actions`, `__body` (`--fluid`), `__stack` |
| Surface | `.panel-surface`, `.panel-card`, `.panel-shell-card`, `.panel-muted-block` |
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
| `.login-*` | `_login.scss` | Hanya variabel tema halaman login dan override autofill. Login dan landing ditulis dengan Tailwind inline; `_landing.scss` sudah dihapus |
| `.desktop-root` | `_desktop.scss` | wadah wallpaper, scrollbar global, `::selection` |

## 7. Store, Hook, Lib

| Jenis | Daftar |
| :--- | :--- |
| Store | `windowStore`, `themeStore`, `authStore`, `widgetStore`, `commandStore`, `alertStore`, `editorStore` (`middleware/mutative`) |
| Hook | `useGlobalShortcuts`, `useRevisionSync`, `useWindowPollingActive`, `useContainers`, `useTerminalSession`, `useTerminalExec`, `useCapturedNotificationsSocket` |
| Lib | `i18n` (`t`, `useI18n`; kamus di `lib/locales/id.ts` dan `en.ts`), `alert`, `datetime`, `sound`, `lazy`, `runtimeLogger` |
| API | `src/api/*` (agent, auth, docker, files, system, tunnels, cloudflare, projects, users, apiTokens, notifications, payment, portainer, terminal, docs) |

## 8. Menambah Komponen

1. Cek tabel di atas. Ada yang cocok? Pakai.
2. Belum ada: letakkan di folder pemilik, pakai token, buat state lengkap (hover, fokus, disabled, empty, loading, error).
3. Perbarui file ini pada PR yang sama.
