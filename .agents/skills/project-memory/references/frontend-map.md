# Peta Arsitektur Frontend (`src/`)

## 1. Entrypoint & Routing (`src/main.tsx`, `src/App.tsx`, `src/router/index.tsx`)
- **`src/main.tsx`**:
  - Mengimpor `@/lib/legacyStorage` (migrasi key localStorage `ypanel-*` -> `reneo-*`), `@/assets/css/tailwind.css`, dan `@/assets/scss/global.scss`.
  - Mendaftarkan PWA service worker (`src/pwa.ts`).
  - Menunggu `Promise.all([loadLanguage(getInitialLanguage()), stylesReady(), preloadRoute(window.location.pathname)])`, lalu memanggil `seedFromBoot()` (`window.__REN_BOOT__`) dan menghapus `#boot-splash`.
- **`src/App.tsx`**:
  - Membungkus aplikasi dengan `<QueryClientProvider>` dan `<BrowserRouter>`.
  - Merender `<AlertHost />` (lazy load `GlobalAlert`), `<AppToaster />` (Sonner), dan `<AppShell />`.
- **`src/router/index.tsx`**:
  - Rute Publik (`overflow-y-auto`, aktif saat `usePublicSite().landing` bernilai `true`):
    - `/` -> `LandingPage` (`src/pages/landing/LandingPage.tsx`)
    - `/docs/mcp` (redirect dari `/mcp/guide`) -> `McpGuidePage` (`src/pages/mcp-guide/McpGuidePage.tsx`)
    - `/install` -> `InstallPage` (`src/pages/install/InstallPage.tsx`)
    - `/terms` & `/privacy` -> `LegalPage` (`src/pages/legal/LegalPage.tsx`)
    - `/order` & `/order/:publicId` -> `OrderPage` (`src/pages/order/OrderPage.tsx`)
    - `/order/:publicId/invoice` -> `OrderInvoicePage` (`src/pages/order/OrderInvoicePage.tsx`)
    - `/articles` & `/articles/:slug` -> `ArticlesPage` / `ArticlePage` (`src/pages/articles/ArticlesPage.tsx`)
  - Rute Autentikasi & Terlindungi:
    - `/login` -> `LoginPage` (`src/pages/login/LoginPage.tsx`)
    - `/home` -> `DesktopPage` (`src/pages/desktop/DesktopPage.tsx`)
    - `/database/:key` -> `DatabaseAdminPage` (`src/pages/database-admin/DatabaseAdminPage.tsx`)
    - `*` -> `FrontendNotFoundPage` (`src/components/system/FrontendNotFoundPage.tsx`)

---

## 2. Desktop Shell, Taskbar, Dock, Mobile, & Widgets
- **`src/shell/index.tsx` (`AppShell`)**:
  - Inisialisasi sesi (`useAuthStore.initSession`), listener `panel:session-expired`, aktivasi `useGlobalShortcuts(authenticated)` & `useRevisionSync(authenticated)`, pemeriksaan `getUpdateStatus`, tampilan `BootSplash`, `PasswordGate` (`user.mustChangePassword`), `AppRouter`, `DevOverlay`, dan `UpdateProgressModal`.
- **`src/components/desktop/`**:
  - `Desktop.tsx`: Root desktop (`.desktop-root`), wallpaper, auto-lock idle timer, drag-drop widget, `DesktopContextMenu.tsx`, `Taskbar`, `DesktopIconLayer.tsx` (`DesktopIcon.tsx`), `DesktopWidgetLayer`, daftar `Window.tsx` (diurutkan berdasarkan `id` untuk menjaga stabilitas DOM), `Dock`, `LockScreen.tsx`, dan `CommandPalette`. Merender `MobileShell` bila `useIsMobileLayout()` aktif.
  - `windowRegistry.tsx`: Lazy imports 20 window, fungsi RBAC `canAccessWindow(kind, role)`, `WINDOW_CONTENT`, dan `DESKTOP_SHORTCUTS`.
- **`src/components/taskbar/`**:
  - `Taskbar.tsx` (bar 44px), `ApplicationsMenu.tsx`, `appCatalog.ts` (`MENU_ITEMS`, `CATEGORIES`, `APP_KEYWORDS`), `LanguageSwitcher.tsx`, `NotificationsMenu.tsx`, `ProfileMenu.tsx`.
- **`src/components/dock/Dock.tsx`**: Dock bawah dengan auto-hide dan menu konteks.
- **`src/components/mobile/`**:
  - `MobileShell.tsx`, `MobileHome.tsx`, `MobileAppsGrid.tsx`, `MobileNotifications.tsx` (untuk viewport `< 768px` atau `?ui=mobile`).
- **`src/components/widgets/`** (6 `WidgetType`):
  - `DesktopWidgetLayer.tsx`, `WidgetContainer.tsx`, `LineChart.tsx`, `chartStats.ts`, `noteColors.ts`, `types.ts`.
  - Widget: `ClockUptimeWidget.tsx` (`clock-uptime`), `SystemVitalWidget.tsx` (`system-vital`), `NetworkTrafficWidget.tsx` (`network-traffic`), `CpuGraphWidget.tsx` (`cpu-graph`), `QuickNoteWidget.tsx` (`quick-note`), `PingWidget.tsx` (`ping`).

---

## 3. Daftar 20 `WindowKind` (`src/components/windows/`)

Menambah window baru wajib mendaftarkan di 5 titik: `WindowKind` (`src/types/index.ts`), `DEFAULTS` (`src/store/windowStore.ts`), `WINDOW_CONTENT` (`src/components/desktop/windowRegistry.tsx`), `ICON_MAP` (`src/components/common/AppIcon.tsx`), dan key i18n (`src/lib/locales/id.ts` & `en.ts`).

| `WindowKind` | Komponen Utama | Direktori / File Pendamping | Role Akses |
| :--- | :--- | :--- | :--- |
| `apps` | `DockerWindow.tsx` | `windows/docker/` (`useDockerWindow.ts`, `DockerToolbar.tsx`, `ContainersTab.tsx`, `ImagesTab.tsx`, `NetworksTab.tsx`, `VolumesTab.tsx`, `TemplatesTab.tsx`, `DeployModal.tsx`, `DeleteContainerModal.tsx`, `LogModal.tsx`, `DockerUpdateModal.tsx`, `DockerProgressOverlay.tsx`, `DockerComponents.tsx`, `constants.ts`, `domainTargets.ts`) | Semua |
| `host-terminal` | `HostTerminalWindow.tsx` | `windows/terminal/` (`TerminalKeyBar.tsx`, `TerminalCopyModal.tsx`, `terminalText.ts`) | Semua |
| `terminal` | `TerminalPlaceholder` | Di dalam `windowRegistry.tsx` | Semua |
| `system` | `SystemWindow.tsx` | `windows/system/` (`IpAddressList.tsx`, `SystemListView.tsx`) | Semua |
| `system-logs` | `SystemLogsWindow.tsx` | — | `superadmin` |
| `database` | `DatabaseWindow.tsx` | `windows/database/` (`useDatabasesWindow.ts`, `CreateDatabaseModal.tsx`, `ConnectionModal.tsx`, `OpenClientModal.tsx`, `ManageDatabaseModal.tsx`, `ManageDatabaseContent.tsx`, `TablesPanel.tsx`, `CreateTableModal.tsx`, `SqlPanel.tsx`, `ResultTable.tsx`, `UsersPanel.tsx`, `AccessPanel.tsx`, `PasswordPanel.tsx`) | Semua |
| `file-manager` | `FileManagerWindow.tsx` | `windows/file-manager/` (`useFileManager.tsx`, `useFileUpload.ts`, `fileManagerConfig.tsx`, `FileToolbar.tsx`, `FileTabsStrip.tsx`, `FileList.tsx`, `FileRow.tsx`, `FileContextMenu.tsx`, `FileActionModal.tsx`, `BulkActionsBar.tsx`, `FileUploadBar.tsx`, `FileStatusBar.tsx`, `RootAccessModal.tsx`) | Semua |
| `file-editor` | `FileEditorWindow.tsx` | Terhubung ke `src/store/editorStore.ts` | Semua |
| `projects` | `ProjectsWindow.tsx` | `windows/projects/` (`useProjectsWindow.tsx`, `projectsConfig.tsx`, `ProjectsToolbar.tsx`, `ProjectsBody.tsx`, `ProjectRow.tsx`, `ProjectFormModal.tsx`, `ProjectRunFields.tsx`, `projectRun.ts`, `ProjectServicesEditor.tsx`, `ProjectLogModal.tsx`, `UploadDraftModal.tsx`, `StaticUploadOverlay.tsx`) | Semua |
| `tunnels` | `TunnelsWindow.tsx` | `windows/tunnels/` (`useTunnelsWindow.tsx`, `TunnelsToolbar.tsx`, `TunnelsScope.tsx`, `TunnelsBody.tsx`, `TunnelRows.tsx`, `TunnelModals.tsx`, `TunnelInfoModals.tsx`, `TunnelModalHost.tsx`, `ProfileModalHost.tsx`, `RouteDomainModal.tsx`, `CloudflareSetupNotice.tsx`, `HostingSubdomainsPanel.tsx`, `SubdomainModal.tsx`, `HostingCustomDomainsPanel.tsx`, `CustomDomainModal.tsx`, `DirectDomainRecords.tsx`, `tunnelForms.ts`, `openCloudflareSettings.ts`) | Semua |
| `firewall` | `FirewallWindow.tsx` | `windows/firewall/` (`useFirewallWindow.ts`, `FirewallToolbar.tsx`, `RulesSection.tsx`, `PortsSection.tsx`, `PolicySection.tsx`, `RuleModal.tsx`) | `superadmin` |
| `users` | `UsersWindow.tsx` | `windows/users/` (`UserRow.tsx`, `CreateUserModal.tsx`, `ChangeRoleModal.tsx`, `ResetPasswordModal.tsx`, `MoveAccountModal.tsx`, `AccessShareModal.tsx`, `UserQuotaPanel.tsx`, `UserPlanPanel.tsx`, `UserPlanTrial.tsx`, `RenewPlanModal.tsx`, `UserSubdomainsList.tsx`, `permissions.ts`, `constants.ts`, `apiError.ts`) | `admin`, `superadmin` |
| `hosting` | `HostingWindow.tsx` | Memakai `windows/settings/hosting/` (`PlansSection.tsx`, `DomainsSection.tsx`, `SubdomainsSection.tsx`, `OrdersSection.tsx`, `VouchersSection.tsx`, `PlanModal.tsx`, `PlanFeaturesField.tsx`, `PlanPricingPreview.tsx`, `PromoModal.tsx`, `SubdomainModal.tsx`, `VoucherModal.tsx`, `ConfirmOrderModal.tsx`, `RejectOrderModal.tsx`, `OrderRequestCard.tsx`, `SaleToggleCard.tsx`, `SeedDefaultPlansButton.tsx`) & `windows/settings/tabs/PaymentTab.tsx` | `admin`, `superadmin` |
| `settings` | `SettingsWindow.tsx` | `windows/settings/` (`tabsConfig.tsx`, `SettingsNav.tsx`, `SettingsPrimitives.tsx`, `SettingsSaveBar.tsx`, `OptionCards.tsx`, `UpdateCard.tsx`, `SitePublicCard.tsx`, `DemoAccountCard.tsx`, `ApiTokensTab.tsx`, `hooks/*`, `tabs/*`, `publicip/*`, `tabs/notify/*`) | Semua (tab sesuai role) |
| `profile` | `ProfileWindow.tsx` | `windows/profile/` (`AccountSecurityCard.tsx`, `MyPlanCard.tsx`, `MyNotices.tsx`, `OwnBotCard.tsx`, `MyTelegramCard.tsx`, `MyWhatsAppCard.tsx`, `WhatsAppVerifyCard.tsx`, `ToolchainTools.tsx`, `ToolchainPrefsCard.tsx`, `ToolchainRunModal.tsx`) | Semua |
| `widgets` | `WidgetsWindow.tsx` | — | Semua |
| `speedtest` | `SpeedtestWindow.tsx` | `windows/speedtest/` (`useSpeedtestWindow.ts`, `useAnimatedNumber.ts`, `SpeedPanel.tsx`, `SpeedGauge.tsx`, `SpeedStats.tsx`, `SpeedSteps.tsx`, `SpeedServerPicker.tsx`, `SpeedServerNotice.tsx`, `SpeedHistory.tsx`) | Semua |
| `docs` | `DocsWindow.tsx` | `windows/docs/` (`useDocsWindow.ts`, `DocEditorModal.tsx`, `MarkdownToolbar.tsx`) | Semua |
| `changelog` | `ChangelogWindow.tsx` | — | Semua |
| `trash` | `TrashPlaceholder` | Di dalam `windowRegistry.tsx` | Semua |

---

## 4. UI Kit (`src/components/ui/`)
27 file komponen standar (wajib import langsung per file, tanpa barrel `index.ts`):
- **Aksi & Indikator**: `Button.tsx`, `IconButton.tsx`, `IconBadge.tsx`, `Badge.tsx`, `KpiCard.tsx`.
- **Form & Kontrol**: `Field.tsx` (`Field`, `TextInput`, `Textarea`), `PasswordInput.tsx`, `Select.tsx`, `FilePicker.tsx`, `SearchInput.tsx`, `ToggleSwitch.tsx`, `Checkbox.tsx`, `SelectableCard.tsx`, `SettingRow.tsx`, `SectionHeader.tsx`.
- **Navigasi & Dialog**: `Tabs.tsx`, `FilterMenu.tsx`, `Stepper.tsx`, `Modal.tsx`.
- **Tabel & Daftar**: `ListTable.tsx` (`ListTable`, `ListRowIcon`, `ListState`), `DataTable.tsx`, `ListRow.tsx`, `EntityRow.tsx`, `ColumnMenu.tsx`, `Pagination.tsx`.
- **State**: `states.tsx` (`EmptyState`, `LoadingState`, `ErrorState`).

---

## 5. Stores (`src/store/`), Hooks (`src/hooks/`), & API (`src/api/`)

### Zustand Stores (`src/store/`)
- `windowStore.ts`: State window (`windows`, `focusedId`, `DEFAULTS`, buka/tutup/min/max/fullscreen/move/resize/z-index).
- `authStore.ts`: Sesi user (`authenticated`, `checkingSession`, `user`, `initSession`, `loginSuccess`, `logout`).
- `themeStore.ts`: Tema (`light`/`dark`), wallpaper, ukuran/gaya ikon, lockscreen, suara, ukuran font.
- `widgetStore.ts` & `widgetLayout.ts`: Penempatan widget desktop, kalkulasi layout/kolisi, & sticky notes.
- `metricsStore.ts` & `liveStore.ts`: Deret waktu metrik 5-detik dan live stream 1-detik.
- `desktopIconStore.ts`: Posisi grid ikon desktop & urutan mobile.
- `editorStore.ts`: Tab aktif & buffer file di `FileEditorWindow`.
- `alertStore.ts`, `commandStore.ts`, `settingsNavStore.ts`, `updateStore.ts`.

### Custom Hooks (`src/hooks/`)
- `useWindowPollingActive.ts`, `useGlobalShortcuts.ts`, `useRevisionSync.ts`, `useSystemSampler.ts`, `useLivePolling.ts`, `useWidgetSync.ts`, `useListQuery.ts`, `useContainers.ts`, `useContainerLogs.ts`, `useTerminalSession.ts`, `useTerminalExec.ts`, `useCapturedNotificationsSocket.ts`, `useIsMobileLayout.ts`, `usePinchZoom.ts`, `usePageMeta.ts`, `usePublicSite.ts`.

### Modul API (`src/api/`)
- `client.ts` (`agentApi`), `agent.ts`, `auth.ts`, `apiTokens.ts`, `cloudflare.ts`, `databases.ts`, `docker.ts`, `dockerUpdate.ts`, `docs.ts`, `files.ts`, `firewall.ts`, `hosting.ts`, `invoice.ts`, `ndjson.ts`, `notifications.ts`, `notify.ts`, `payment.ts`, `projects.ts`, `publicProxy.ts`, `speedtest.ts`, `system.ts`, `terminal.ts`, `toolchain.ts`, `tunnels.ts`, `users.ts`.

---

## 6. Arsitektur SCSS (`src/assets/scss/`) & Z-Index (`src/lib/zLayers.ts`)
- **Entrypoint**: `src/assets/scss/global.scss` -> `_base.scss`, `_variables.scss` (`:root` & `[data-theme="dark"]`), dan `modules/_index.scss`.
- **Modul SCSS (`src/assets/scss/modules/`)**:
  - `_desktop.scss`, `_taskbar.scss`, `_windows.scss`, `_components.scss`, `_docker.scss`, `_terminal.scss`, `_cloudflare.scss`, `_speedtest.scss`, `_login.scss`.
- **Tangga Z-Index (`src/lib/zLayers.ts`)**:
  - `widgets: 12`, `windowNormal: 100`, `windowMaximized: 500`, `windowFocused: 50_000`, `snapPreview: 59_000`, `taskbar: 60_000`, `desktopContextMenu: 61_000`, `dock: 62_000`, `windowFullscreen: 120_000`, `commandPalette: 130_000`, `alert: 999_999`.

