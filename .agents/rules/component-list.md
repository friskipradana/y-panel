# Component List

Inventaris komponen Reneo. Cek di sini sebelum membuat komponen atau class baru. Aturan pemakaian: [design-system.md](design-system.md).

## 1. Shell & Halaman

| Komponen | File | Peran |
| :--- | :--- | :--- |
| `AppShell` | `src/shell/index.tsx` | Cek sesi, shortcut global, revision sync, host router |
| `AppRouter` | `src/router/index.tsx` | Rute `/`, `/docs/mcp`, `/login`, `/home`, `*` dengan transisi |
| `PublicShell`, `CopyBlock` | `src/components/public/` | Kerangka halaman publik (header tanpa tombol login, versi, footer; mengikuti mode terang/gelap tersimpan dengan tombol tema) dan blok kode dengan tombol salin |
| `LandingPage` | `src/pages/LandingPage.tsx` | Halaman publik bermerek Reneo (tombol "Coba akun demo" di hero muncul hanya bila demo diaktifkan di Settings > General atau lewat `PANEL_DEMO_PASSWORD`) (filosofi: [FILOSOFI-RENEO.md](../../docs/FILOSOFI-RENEO.md)); versi dari `usePanelVersion` (`lib/version.ts`: versi agent, fallback versi bundle). Ikon merek di `public/` dan `public/brand/` dibuat oleh `scripts/make-brand-icons.py` (navy `#0B2A57`, R putih) |
| `McpGuidePage` | `src/pages/McpGuidePage.tsx` + `mcp-guide/` | Panduan MCP: `ConnectPanel`, `ToolCatalog`; `toolsData.ts` dibuat dari registry agent |
| `ArticlesPage`, `ArticlePage` | `src/pages/ArticlesPage.tsx` | Artikel publik `/articles` (kartu dengan gambar sampul = gambar pertama artikel, field `cover`) dan `/articles/:slug` (dari `GET /api/v1/public/docs`), tanpa login |
| `InstallPage` | `src/pages/InstallPage.tsx` | Langkah pemasangan lengkap (`InstallGuide`) di `/install`, dibuka dari tautan "Opsi dan langkah lengkap" di landing |
| `LoginPage` | `src/pages/LoginPage.tsx` | Login + wizard first-run: satu kartu bersih (`Field`, `TextInput`, `Button`) di atas warna halaman tema |
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
| `CommandPalette` | `components/common/` + `palette/` | Pencarian cepat (Ctrl+K, ikon kaca pembesar di taskbar dan di bar atas ponsel). Daftar dibuat oleh `usePaletteEntries` dari data, hanya yang boleh dipakai akun itu: jendela terbuka, aplikasi (katalog bersama `taskbar/appCatalog` dengan kata kunci Indonesia dan Inggris, dipakai juga menu Aplikasi), tab pengaturan (lompat langsung lewat `settingsNavStore`; hanya tab milik peran itu, `settingsTabAllowed`), widget yang boleh dipasang peran itu, subdomain milik pembeli, dan aksi (tema, bahasa, kunci layar, reset jendela/widget). Urutan hasil dari `palette/score.ts` (setiap kata harus cocok sebagai teks asli: judul, lalu kata kunci, lalu deskripsi), bukan pencocokan huruf acak cmdk. "Terakhir dipakai" tampil saat pencarian kosong (disimpan di browser). Pintasan Alt+huruf berasal dari satu tabel `WINDOW_SHORTCUTS` di `useGlobalShortcuts` |
| `GlobalAlert` / `InnerAlert` | `components/alert/` | Konfirmasi & notifikasi, global dan in-window |
| `AppIcon` | `components/common/` | Satu-satunya pemetaan ikon aplikasi |
| `DateTimeText` | `components/common/` | Format tanggal/waktu konsisten |
| `IconBadge`, `SectionHeader`, `SettingRow`, `Button`, `IconButton`, `Badge`, `ToggleSwitch`, `Checkbox`, `SelectableCard`, `Field`/`TextInput`/`Textarea`, `Select`, `SearchInput`, `Tabs`, `DataTable`, `ListRow`, `EntityRow`, `Pagination`, `Modal` (dialog dan sheet), `KpiCard`, `EmptyState`/`LoadingState`/`ErrorState` | `components/ui/` | UI kit umum. Aturan dan contoh di [ui-components.md](ui-components.md) |
| `DevOverlay`, `DebugPanel`, `DebugGrid` | `components/debug/` | Hanya mode dev |

## 3. Window Aplikasi (`WindowKind`)

Setiap window besar berupa shell tipis + folder pendamping. Hook memegang state, komponen bagian hanya merender.

| Kind | Shell | Folder pendamping |
| :--- | :--- | :--- |
| `apps` | `DockerWindow` | `docker/`: `useDockerWindow`, `DockerToolbar`, `ContainersTab`, `ImagesTab`, `NetworksTab`, `TemplatesTab`, `DeployModal`, `DeleteContainerModal`, `LogModal`, `DockerProgressOverlay`, `DockerComponents`, `constants` |
| `settings` | `SettingsWindow` | `settings/`: `constants`, `SettingsPrimitives`, `hooks/` (`useHostSettings`, `useCloudflareSettings`, `usePaymentSettings`, `useNotificationSettings`), `tabs/` (General, Hosting, Appearance, Wallpaper, Desktop, Screensaver, Sound, Cloudflare, Network, Security, Payment, Notifications, Audit), `tabs/notifications/`, `ApiTokensTab`, `hosting/` (`HostingChecklist`: daftar yang belum siap sebelum menjual; bagian Paket/Domain/Subdomain/Ketentuan/Demo dipilih lewat `Tabs` di `HostingTab`; `HostingPlansCard` + `PlanFormModal`: paket layanan, tiga paket contoh Starter/Pro/Bisnis dibuat sekali saat mode hosting pertama dinyalakan (`exampleHostingPlans`, flag `examplePlansSeeded`, tidak dibuat lagi bila dihapus); `HostingDomainsCard`: domain dari akun Cloudflare superadmin dipilih lewat dropdown (bisa dicari) lalu ditawarkan, daftar di bawahnya hanya domain yang ditawarkan; `HostingSubdomainsCard`: semua subdomain terjual, tangguhkan/hapus; `HostingTermsCard`: masa tenggang, tautan pemesanan, dan template pesan pemesanan dengan variabel `{plan}` `{price}` `{period}` yang dipasang `lib/orderMessage` ke tautan WhatsApp/email; tanpa tautan, landing menampilkan tombol salin pesan), `SitePublicCard` (di General: saklar landing page dan indeksing, `GET/PUT /api/v1/settings/site`), `DemoAccountCard`. Tab Hosting (superadmin): saklar mode hosting lalu kartu demo; mematikan mode hosting mematikan akun demo; mode hosting otomatis aktif pada instalasi lama yang demonya sudah menyala. Paket disimpan di tabel `hosting_plans` (harga rupiah, periode bulanan/tahunan/sekali bayar, fitur, batas sumber daya = kuota akun, jumlah subdomain) dan akun yang memakainya di `user_plans`; `GET/POST/PUT/DELETE /api/v1/hosting/plans`, `GET/PUT /api/v1/users/{id}/plan` (superadmin, 409 bila mode hosting mati). Memberi paket mengisi kuota akun; akun yang paketnya berakhir ditangguhkan setelah masa tenggang (`graceDays`, 0 = langsung) oleh pemeriksa tiap 15 menit, dan hanya penangguhan karena masa berlaku yang dicabut saat diperpanjang. Landing menampilkan `pages/landing/Pricing` dari `GET /api/v1/public/hosting`; panel paket per akun ada di `users/UserPlanPanel`. Subdomain pembeli = alamat panel miliknya: pembeli membuatnya di jendela Cloudflare lewat `tunnels/HostingSubdomainsPanel` + `SubdomainModal` (hanya nama dan domain, dicek langsung ke DNS; hanya muncul bila paketnya punya subdomain). Subdomain diarahkan ke panel itu sendiri, hanya pemiliknya yang bisa masuk di alamat itu, lalu ia menghubungkan Cloudflare miliknya sendiri; `GET/POST /api/v1/me/subdomains`, `GET .../check`, `PATCH/DELETE .../{id}`, dan sisi superadmin `/api/v1/hosting/domains`, `/api/v1/hosting/subdomains`. Agent menyinkronkan (`hosting_sync.go`) DNS CNAME dan tunnel `reneo-hosting` (terpisah dari tunnel superadmin) memakai token Cloudflare superadmin; tabel `hosting_domains`, `hosting_subdomains`, `hosting_state`. Bila landing page mati semua halaman publik (`/`, `/articles`, `/install`, `/docs/mcp`, sitemap, llms.txt, data artikel publik) hilang dan `/` mengarah ke `/login`; bila indeksing mati `robots.txt` menutup semua crawler dan setiap halaman berheader `noindex` |
| `file-manager` | `FileManagerWindow` | `file-manager/`: `useFileManager`, `FileTabsStrip`, `FileToolbar`, `FileTableHeader`, `FileList`, `FileRow`, `FileStatusBar`, `BulkActionsBar`, `FileActionModal`, `RootAccessModal`, `FileContextMenu`, `fileManagerConfig` |
| `projects` | `ProjectsWindow` | `projects/`: `useProjectsWindow`, `ProjectsToolbar`, `ProjectsBody`, `ProjectCard`, `ProjectFormModal`, `StaticUploadOverlay`, `UploadDraftModal`, `projectsConfig` |
| `tunnels` | `TunnelsWindow` | `tunnels/`: `useTunnelsWindow`, `TunnelsToolbar`, `CloudflareSetupNotice`, `TunnelsBody`, `TunnelRows`, `TunnelModals`, `TunnelModalHost`, `ProfileModalHost`, `TunnelsShared`, `tunnelForms` |
| `host-terminal` | `HostTerminalWindow` | xterm, multi-pane, preset (belum dipecah). Di ponsel ada `terminal/TerminalKeyBar` (Esc, Tab, Ctrl+C/D, panah, simbol) |
| `terminal`, `portainer`, `trash` | placeholder | `Desktop.tsx` |
| `system` | `SystemWindow` | Pemantauan host (CPU, RAM, disk, Docker, beban kerja). Isi internal Reneo (state path, Portainer, insiden reconcile) ada di Settings, tab `ReneoRuntimeTab`, hanya superadmin |
| `system-logs` | `SystemLogsWindow` | Hanya superadmin (API juga). Filter level, sorot pencarian, jeda, salin, unduh |
| `file-editor` | `FileEditorWindow` | Monaco (belum dipecah) |
| `database` | `DatabaseWindow` | `database/`: `useDatabasesWindow`, `CreateDatabaseModal`, `ConnectionModal`, `ManageDatabaseModal` (tab `TablesPanel`+`CreateTableModal`, `SqlPanel`, `UsersPanel`, `PasswordPanel`, `ResultTable`). Database milik user (PostgreSQL, MySQL, MariaDB, MongoDB, Redis) sebagai container di 127.0.0.1 (`internal/userdb`). Info database Reneo sendiri ada di Settings, tab `ReneoDatabaseTab`, hanya superadmin |
| `users` | `UsersWindow` | `users/`: `CreateUserModal` (bisa langsung memberi paket), `UsersFilters` (tab status paket dengan hitungan dari `GET /api/v1/users/summary`, filter status dan paket; `GET /api/v1/users` menerima `status`, `role`, `plan`, `planState`, dua yang terakhir hanya untuk superadmin dengan mode hosting aktif), `UserPlanPanel` + `UserSubdomainsList`, baris akun menampilkan paket, masa berlaku, jatah subdomain, dan tombol perpanjang satu periode; menghapus akun melepas DNS subdomainnya dan menangguhkan atau mengaktifkan akun menyinkronkan subdomain, `UserQuotaPanel` (kuota + pemakaian), `ResetPasswordModal`, `permissions` (cermin kebijakan agent: admin hanya mengelola user biasa, hanya superadmin memberi role admin) |
| `profile` | `ProfileWindow` | `profile/AccountSecurityCard` (pemakaian sendiri + ganti password) |
| `widgets` | `WidgetsWindow` | – |
| `speedtest` | `SpeedtestWindow` | `speedtest/`: `useSpeedtestWindow`, `SpeedPanel`, `SpeedGauge` (meter log-scale animasi), `SpeedSteps`, `SpeedStats` (angka + grafik langsung), `SpeedServerPicker` + `SpeedServerNotice`, `SpeedHistory` (tabel dengan kolom unduh/unggah/latensi/waktu dan tombol hapus riwayat); tab jenis tes berada di dalam kartu `SpeedPanel`, `useAnimatedNumber`; gaya di `_speedtest.scss`. Tab "Perangkat ke panel" (semua role bukan demo): browser menarik/mengirim data lewat `GET /api/v1/speedtest/download`, `POST .../upload`, `GET .../ping` (mesin ukur di `api/speedtest.ts`). Tab "Panel ke internet" (hanya superadmin): server dipilih dari katalog di agent dengan tiga mesin: host HTTP (Cloudflare, Hetzner, Tele2), Google (M-Lab NDT7, protokol terbuka lewat WebSocket, `speed_ndt7.go`), dan Speedtest.net serta CBN lewat klien resmi Ookla (`speed_ookla.go`: klien dipasang installer atau tombol "Pasang klien Ookla" di `SpeedServerNotice` (`POST /api/v1/speedtest/cli/install`, arsip resmi dengan sha256 dipatok, ke `<state>/bin/speedtest`, `speed_ookla_install.go`) dan lisensinya disetujui superadmin lewat `ooklaLicenseAccepted`; server CBN 12807 Jakarta dan 59016 Singapura ditambah server terdekat dari `speedtest -L`). Katalog lama: (`GET /api/v1/speedtest/servers`: Otomatis, Cloudflare, Hetzner Singapura/Falkenstein/Ashburn, Tele2; sebagian hanya unduh; tidak ada alamat buatan pengguna) lewat `POST /api/v1/speedtest/server?server=<id>`, agent mengukur ke speed.cloudflare.com dan mengalirkan hasilnya sebagai NDJSON (satu event per baris: ping, latency, download, upload, done) sehingga angka terisi realtime. Riwayat 8 hasil terakhir di localStorage. Jalur `/api/v1/speedtest/` tidak dicatat di runtime log dan punya batas laju sendiri (600/menit) |
| `docs` | `DocsWindow` | `docs/`: `useDocsWindow`, `DocEditorModal`, `MarkdownToolbar` (format + unggah gambar ke `POST /api/v1/docs/images`, dibaca publik di `/api/v1/public/doc-images/{hash}`). Markdown lewat `lib/markdown` (`![alt](url)`; artikel resmi memakai `img/<nama>.png` di `docs/articles/img/`); artikel berstatus terbit + `isPublic` tampil publik di `/articles` tanpa login; artikel resmi (`docs/articles` di repo, `internal/docsync`) tersinkron ke semua panel dan read-only; SEO (`robots.txt`, `sitemap.xml`, `llms.txt`, meta + JSON-LD) di `internal/httpserver/seo.go` |
| `changelog` | `ChangelogWindow` | Mengikuti GitHub Releases lewat agent (cache 1 jam, fallback ke entri lokal); catatan rilis dirender oleh `lib/markdown` |

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

Ukuran: widget desktop dapat diubah lebar dan tingginya lewat delapan pegangan tepi/sudut seperti window (`w`, `h` pada `PlacedWidget`; batas 200x96 sampai 720x760, tidak untuk widget terkunci; ukuran yang menimpa widget lain ditolak). Penempatan setelah geser memakai `placeDroppedWidget`: perataan ringan 8px, geser minimum keluar dari tumpang tindih, atau kembali ke posisi semula; tidak pernah melompat ke kolom lain. `widget.config.notes` pada `quick-note` berisi daftar memo (JSON).

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
