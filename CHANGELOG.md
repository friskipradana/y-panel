# Changelog

All notable changes to the YPanel project will be documented in this file.

## [4.3.1] - 2026-10-15

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v4.3.1** berisi 2 perubahan: 1 fitur, 1 pemeliharaan. (42 files changed, 2058 insertions(+), 404 deletions(-))

### 🚀 Fitur Baru (Added)
- **databases:** User-managed databases in the Database window, Reneo database moved to superadmin-only Settings tab; project runtime hardening ([`f131d08`](https://github.com/friskipradana/panel-desktop-ui/commit/f131d08))

### 🔧 Pemeliharaan (Chores & Maintenance)
- **ui:** Ban lucide Sparkles icons everywhere and enforce it in check:ui ([`50fbcf7`](https://github.com/friskipradana/panel-desktop-ui/commit/50fbcf7))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v4.3.0...v4.3.1

## [4.3.0] - 2026-10-15

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v4.3.0** berisi 4 perubahan: 4 fitur. (46 files changed, 1741 insertions(+), 355 deletions(-))

### 🚀 Fitur Baru (Added)
- **accounts:** Role hierarchy, safe quota patch, usage, password reset and change, suspend/delete stop workloads ([`a391740`](https://github.com/friskipradana/panel-desktop-ui/commit/a391740))
- **demo:** Read-only demo account with landing page card; polish projects, database, system and logs windows ([`7d77f0f`](https://github.com/friskipradana/panel-desktop-ui/commit/7d77f0f))
- **demo,landing:** Harden demo allowlist, seed sample projects, tidy mobile landing, drop owner line, split users window ([`5f6056d`](https://github.com/friskipradana/panel-desktop-ui/commit/5f6056d))
- **mobile:** Per-phone widget order and lock, lock screen in account menu, translate widget gallery and window titles ([`13004dc`](https://github.com/friskipradana/panel-desktop-ui/commit/13004dc))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v4.2.0...v4.3.0

## [4.2.0] - 2026-10-15

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v4.2.0** berisi 1 perubahan: 1 perbaikan. (1 file changed, 13 insertions(+), 21 deletions(-))

### 🐛 Perbaikan Bug (Fixed)
- **mobile:** Layout override from ?ui= lasts one page load, reload without it returns to auto ([`0c21f7e`](https://github.com/friskipradana/panel-desktop-ui/commit/0c21f7e))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v4.1.0...v4.2.0

## [4.1.0] - 2026-10-15

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v4.1.0** berisi 1 perubahan: 1 pemeliharaan. (1 file changed, 1 deletion(-))

### 🔧 Pemeliharaan (Chores & Maintenance)
- Stop tracking tsconfig.app.tsbuildinfo (already gitignored, dirtied the tree on every build) ([`4b85ef3`](https://github.com/friskipradana/panel-desktop-ui/commit/4b85ef3))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v4.0.4...v4.1.0

## [4.0.4] - 2026-10-15

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v4.0.4** berisi 6 perubahan: 3 fitur, 2 perbaikan, 1 peningkatan. (20 files changed, 767 insertions(+), 164 deletions(-))

### 🚀 Fitur Baru (Added)
- **mobile:** Notification bell, theme switch in account menu, file editor owns scroll ([`f1f9e9b`](https://github.com/friskipradana/panel-desktop-ui/commit/f1f9e9b))
- **mobile:** Open any window from the palette, profile and extra apps on phone, logs toolbar and settings tabs fit ([`1d5c780`](https://github.com/friskipradana/panel-desktop-ui/commit/1d5c780))
- **mobile:** Phone layout for the panel home and apps ([`673b2aa`](https://github.com/friskipradana/panel-desktop-ui/commit/673b2aa))

### 🐛 Perbaikan Bug (Fixed)
- **mobile:** Wrap entity row actions and drop file manager columns on narrow windows ([`bbb8a40`](https://github.com/friskipradana/panel-desktop-ui/commit/bbb8a40))
- **widgets:** Never clamp the stored widget layout while the phone layout is active ([`9794a5b`](https://github.com/friskipradana/panel-desktop-ui/commit/9794a5b))

### ♻️ Refaktor & Peningkatan (Changed)
- **mobile:** Scope phone-only styles to the mobile shell so desktop windows stay untouched ([`0a4666f`](https://github.com/friskipradana/panel-desktop-ui/commit/0a4666f))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v4.0.3...v4.0.4

## [4.0.3] - 2026-10-15

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v4.0.3** berisi 1 perubahan: 1 perbaikan. (11 files changed, 57 insertions(+), 42 deletions(-))

### 🐛 Perbaikan Bug (Fixed)
- **public:** Keep /docs/mcp reachable without a session; lists instead of cards on the MCP guide ([`fd1c74f`](https://github.com/friskipradana/panel-desktop-ui/commit/fd1c74f))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v4.0.2...v4.0.3

## [4.0.2] - 2026-10-15

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v4.0.2** berisi 1 perubahan: 1 perbaikan. (6 files changed, 184 insertions(+), 250 deletions(-))

### 🐛 Perbaikan Bug (Fixed)
- **landing:** Remove decorative slop, use tables and lists instead of card grids ([`2f698ae`](https://github.com/friskipradana/panel-desktop-ui/commit/2f698ae))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v4.0.1...v4.0.2

## [4.0.1] - 2026-10-15

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v4.0.1** berisi 1 perubahan: 1 perbaikan. (4 files changed, 18 insertions(+), 18 deletions(-))

### 🐛 Perbaikan Bug (Fixed)
- **landing:** Responsive layout for phones and tablets ([`80f9565`](https://github.com/friskipradana/panel-desktop-ui/commit/80f9565))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v4.0.0...v4.0.1

## [4.0.0] - 2026-10-15

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v4.0.0** berisi 10 perubahan: 6 fitur, 2 perbaikan, 1 dokumentasi, 1 pemeliharaan. (99 files changed, 2535 insertions(+), 618 deletions(-))

### 🚀 Fitur Baru (Added)
- **brand:** Rename YPanel to Reneo across UI, installer, runtime and docs ([`8b27342`](https://github.com/friskipradana/panel-desktop-ui/commit/8b27342))
- **brand:** Reneo landing page, philosophy and icon set from the REN brand kit ([`210486f`](https://github.com/friskipradana/panel-desktop-ui/commit/210486f))
- **installer:** One-line curl | sudo bash install, pipe-safe .run and sha256 asset ([`fdafeaf`](https://github.com/friskipradana/panel-desktop-ui/commit/fdafeaf))
- **landing:** Step-by-step installation guide ([`65a0277`](https://github.com/friskipradana/panel-desktop-ui/commit/65a0277))
- **runtime:** Reneo naming with RENEO_* env aliases and legacy ypanel fallback ([`5583ecd`](https://github.com/friskipradana/panel-desktop-ui/commit/5583ecd))
- **updater:** Check and apply releases via cli and web ui ([`535d77b`](https://github.com/friskipradana/panel-desktop-ui/commit/535d77b))

### 🐛 Perbaikan Bug (Fixed)
- **landing:** Use reneo.my.id in the Cloudflare preview ([`3eab805`](https://github.com/friskipradana/panel-desktop-ui/commit/3eab805))
- **landing:** Tidy the hero install command block ([`61cca00`](https://github.com/friskipradana/panel-desktop-ui/commit/61cca00))

### 📚 Dokumentasi (Documentation)
- Add Reneo philosophy and guiding principles documentation ([`9bd9ac4`](https://github.com/friskipradana/panel-desktop-ui/commit/9bd9ac4))

### 🔧 Pemeliharaan (Chores & Maintenance)
- Update typescript build info cache ([`246cc0e`](https://github.com/friskipradana/panel-desktop-ui/commit/246cc0e))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.4.5...v4.0.0

## [3.4.5] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.4.5** berisi 1 perubahan: 1 fitur. (7 files changed, 183 insertions(+), 12 deletions(-))

### 🚀 Fitur Baru (Added)
- **mcp:** Serve the live tool catalog so the guide always matches the agent ([`99d5ad9`](https://github.com/friskipradana/panel-desktop-ui/commit/99d5ad9))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.4.4...v3.4.5

## [3.4.4] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.4.4** berisi 2 perubahan: 1 fitur, 1 pemeliharaan. (7 files changed, 711 insertions(+), 10 deletions(-))

### 🚀 Fitur Baru (Added)
- **mcp:** Host operations tools for disk, firewall and PostgreSQL exposure ([`bd41367`](https://github.com/friskipradana/panel-desktop-ui/commit/bd41367))

### 🔧 Pemeliharaan (Chores & Maintenance)
- **typescript:** Update build info ([`8194f74`](https://github.com/friskipradana/panel-desktop-ui/commit/8194f74))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.4.3...v3.4.4

## [3.4.3] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.4.3** berisi 1 perubahan: 1 perbaikan. (4 files changed, 27 insertions(+), 6 deletions(-))

### 🐛 Perbaikan Bug (Fixed)
- **desktop:** Keep the command palette and snap preview above windows ([`d9bb54b`](https://github.com/friskipradana/panel-desktop-ui/commit/d9bb54b))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.4.2...v3.4.3

## [3.4.2] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.4.2** berisi 1 perubahan: 1 perbaikan. (2 files changed, 131 insertions(+), 37 deletions(-))

### 🐛 Perbaikan Bug (Fixed)
- **widgets:** Lay out with measured heights and resolve overlaps to the nearest free spot ([`c0a3d6c`](https://github.com/friskipradana/panel-desktop-ui/commit/c0a3d6c))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.4.1...v3.4.2

## [3.4.1] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.4.1** berisi 2 perubahan: 1 perbaikan, 1 pemeliharaan. (7 files changed, 283 insertions(+), 48 deletions(-))

### 🐛 Perbaikan Bug (Fixed)
- **desktop:** Keep dropped widget position, snap windows to edges, cascade and clamp windows ([`34e4ac1`](https://github.com/friskipradana/panel-desktop-ui/commit/34e4ac1))

### 🔧 Pemeliharaan (Chores & Maintenance)
- **compiler:** Refresh typescript build cache ([`58a5127`](https://github.com/friskipradana/panel-desktop-ui/commit/58a5127))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.4.0...v3.4.1

## [3.4.0] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.4.0** berisi 1 perubahan: 1 fitur. (15 files changed, 949 insertions(+), 623 deletions(-))

### 🚀 Fitur Baru (Added)
- **public:** Rebuild landing and MCP guide pages, show the real panel version ([`a576825`](https://github.com/friskipradana/panel-desktop-ui/commit/a576825))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.3.1...v3.4.0

## [3.3.1] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.3.1** berisi 1 perubahan: 1 fitur. (6 files changed, 310 insertions(+), 1 deletion(-))

### 🚀 Fitur Baru (Added)
- **cloudflare:** Redirect rules API and MCP tools ([`8c38ad3`](https://github.com/friskipradana/panel-desktop-ui/commit/8c38ad3))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.3.0...v3.3.1

## [3.3.0] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.3.0** berisi 2 perubahan: 1 fitur, 1 pemeliharaan. (9 files changed, 1218 insertions(+), 16 deletions(-))

### 🚀 Fitur Baru (Added)
- **mcp:** Expand tool catalog to 97 tools with annotations, prompts and widget control ([`5148e1c`](https://github.com/friskipradana/panel-desktop-ui/commit/5148e1c))

### 🔧 Pemeliharaan (Chores & Maintenance)
- **release:** Publish CHANGELOG notes as the GitHub release body ([`8f09803`](https://github.com/friskipradana/panel-desktop-ui/commit/8f09803))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.2.2...v3.3.0

## [3.2.2] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.2.2** berisi 2 perubahan: 1 fitur, 1 perbaikan. (7 files changed, 385 insertions(+), 87 deletions(-))

### 🚀 Fitur Baru (Added)
- Add NetworkTrafficWidget component and English/Indonesian localization files ([`f911f0a`](https://github.com/friskipradana/panel-desktop-ui/commit/f911f0a))

### 🐛 Perbaikan Bug (Fixed)
- **installer:** Start service after install, fix database detection, ship prebuilt agent, clearer output ([`7e7264d`](https://github.com/friskipradana/panel-desktop-ui/commit/7e7264d))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.2.1...v3.2.2

## [3.2.1] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.2.1** berisi 2 perubahan: 1 perbaikan, 1 pemeliharaan. (12 files changed, 181 insertions(+), 101 deletions(-))

### 🐛 Perbaikan Bug (Fixed)
- **agent:** Count physical interfaces only for network IO, add widgets_data migration ([`64e0ba2`](https://github.com/friskipradana/panel-desktop-ui/commit/64e0ba2))

### 🔧 Pemeliharaan (Chores & Maintenance)
- **build:** Update typescript build info ([`48c3a93`](https://github.com/friskipradana/panel-desktop-ui/commit/48c3a93))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.2.0...v3.2.1

## [3.2.0] - 2026-10-13

### 🌟 Ringkasan Rilis (Release Overview)
Rilis **v3.2.0** berisi 7 perubahan: 2 fitur, 1 peningkatan, 3 dokumentasi, 1 pemeliharaan. (168 files changed, 20283 insertions(+), 18649 deletions(-))

### 🚀 Fitur Baru (Added)
- **agent:** Terminal keepalive and reattach, ping probe, metrics history, per-user widget layout ([`560b623`](https://github.com/friskipradana/panel-desktop-ui/commit/560b623))
- **widgets:** Persistent line graphs, ping monitor, multi sticky notes, hover-only chrome ([`5856336`](https://github.com/friskipradana/panel-desktop-ui/commit/5856336))

### ♻️ Refaktor & Peningkatan (Changed)
- **ui:** Shared UI kit, split large windows into hooks and sections, terminal reconnect client ([`8051af6`](https://github.com/friskipradana/panel-desktop-ui/commit/8051af6))

### 📚 Dokumentasi (Documentation)
- **rules:** Rewrite design system, component list, UI kit rules and anti-slop skill ([`f5338ea`](https://github.com/friskipradana/panel-desktop-ui/commit/f5338ea))
- **rules:** Integrate UI design system, anti-slop, and review checklist into AGENTS.md and GEMINI.md ([`615c835`](https://github.com/friskipradana/panel-desktop-ui/commit/615c835))
- **rules:** Establish design standards and agent guidelines ([`792dea5`](https://github.com/friskipradana/panel-desktop-ui/commit/792dea5))

### 🔧 Pemeliharaan (Chores & Maintenance)
- **tooling:** Add check:ui validator and rework release notes generator ([`405ae4d`](https://github.com/friskipradana/panel-desktop-ui/commit/405ae4d))

### 👥 Kontributor
- AknalRe

**Full Changelog**: https://github.com/friskipradana/panel-desktop-ui/compare/v3.1.5...v3.2.0

## [3.1.5] - 2026-10-12

### 🌟 Ringkasan Rilis (Release Overview)
Rilis versi **v3.1.5** mencakup 1 pembaruan penting berikut:

### 🐛 Perbaikan Bug (Fixed)
- **fix(mcp): add cloudflare_create_tunnel_route, delete_dns, and auto-overwrite DNS conflicts** (`079bb42` by AknalRe)

## [3.1.4] - 2026-10-12

### 🌟 Ringkasan Rilis (Release Overview)
Rilis versi **v3.1.4** mencakup 1 pembaruan penting berikut:

### 🚀 Fitur Baru (Added / Features)
- **feat: implement Model Context Protocol (MCP) server integration and settings UI** (`7e0e40c` by AknalRe)

## [3.1.3] - 2026-10-12

### 🌟 Ringkasan Rilis (Release Overview)
Rilis versi **v3.1.3** mencakup 1 pembaruan penting berikut:

### 🚀 Fitur Baru (Added / Features)
- **feat: add HTTP middleware, MCP integration, Cloudflare API support, and API tokens settings UI** (`82ec39e` by AknalRe)

## [3.1.2] - 2026-10-12

### 🌟 Ringkasan Rilis (Release Overview)
Rilis versi **v3.1.2** mencakup 2 pembaruan penting berikut:

### 🚀 Fitur Baru (Added / Features)
- **feat: add server middleware, MCP tools API, and MCP HTTP handlers** (`989505f` by AknalRe)
- **feat: add ApiTokensTab settings component and HTTP server middleware** (`16d9c1e` by AknalRe)

## [3.1.1] - 2026-10-12

### 🌟 Ringkasan Rilis (Release Overview)
Rilis versi **v3.1.1** mencakup 1 pembaruan penting berikut:

### 🚀 Fitur Baru (Added / Features)
- **feat(mcp): add public endpoints and user guide** (`ed91a42` by AknalRe)

## [3.1.0] - 2026-10-12

### 🌟 Ringkasan Rilis (Release Overview)
Rilis versi **v3.1.0** mencakup 2 pembaruan penting berikut:

### 🚀 Fitur Baru (Added / Features)
- **feat: add Model Context Protocol (MCP) server implementation and API token settings UI** (`8f9ffbb` by AknalRe)
- **feat: add automated release script, API tokens settings tab, and release installer CI workflow** (`888aea1` by AknalRe)

## [3.0.3] - 2026-10-12

### 🌟 Ringkasan Rilis (Release Overview)
Rilis versi **v3.0.3** mencakup 1 pembaruan penting berikut:

### 🚀 Fitur Baru (Added / Features)
- **feat: add Model Context Protocol (MCP) server implementation and API token settings UI** (`8f9ffbb` by AknalRe)

## [3.0.2] - 2026-10-12

### 🌟 Ringkasan Rilis (Release Overview)
Rilis versi **v3.0.2** mencakup 2 pembaruan penting berikut:

### 🚀 Fitur Baru (Added / Features)
- **feat: add automated release script, API tokens settings tab, and release installer CI workflow** (`888aea1` by AknalRe)
- **feat: add SettingsWindow component for desktop preferences and system configuration** (`126e67d` by AknalRe)

## [3.0.1] - 2026-10-11

### 🌟 Ringkasan Rilis (Release Overview)
Rilis versi **v3.0.1** mencakup 1 pembaruan penting berikut:

### 🚀 Fitur Baru (Added / Features)
- **feat: add automated release script, API tokens settings tab, and release installer CI workflow** (`888aea1` by AknalRe)

## [0.7.0] - 2026-04-05
### Added
- Dedicated **Database** desktop window for monitoring MariaDB connectivity, persisted runtime logs, changelog rows, and settings audit metrics.
- Backend endpoint `GET /api/v1/database/status` and persistence bootstrap for MariaDB-backed runtime logs, changelog storage, and settings audit trails.
- Linux installer provisioning for MariaDB, including automatic database/user creation and runtime `PANEL_DB_*` env generation.
- CLI action `ui-panel reset-db-password` for rotating the MariaDB runtime password and restarting the service safely.
- Dedicated API-backed **Changelog** window so release notes are now loaded from backend runtime data instead of hardcoded frontend content.

### Changed
- **System** window now surfaces MariaDB health directly in the main host overview.
- In-app changelog presentation is now powered by the backend persistence layer.
- Backend server lifecycle now closes the database manager cleanly on shutdown.

## [0.6.0] - 2026-04-05
### Added
- **Settings** quick-launch entry on the taskbar for opening runtime configuration faster.
- Dedicated **Settings** window for editing hostname, timezone, and managed nameserver values.
- Backend endpoint pair `GET /api/v1/settings/system` and `POST /api/v1/settings/system` for authenticated host settings management.
- Linux host settings runtime helper for reading settings snapshots and writing managed DNS configuration for `systemd-resolved` hosts.

### Changed
- Improved the **Settings** window layout so the hero panel, cards, and action area stay readable on narrower window sizes.
- Increased the default **Settings** window size so the responsive layout starts in a more usable state.
- In-app changelog entries now include the new Settings and host configuration work.
- Desktop shell now routes the `settings` window kind to a dedicated settings editor instead of reusing system summary content.

## [0.5.0] - 2026-04-05
### Added
- Dedicated **System Logs** window in the desktop UI for viewing backend-hosted journal logs.
- Backend endpoint `GET /api/v1/system/logs` for serving `journalctl` output to authenticated clients.
- Taskbar shortcut for **System Logs** and separate shortcut for **Changelog**.
- `README_TASKS.md` as an operational task tracker for all fixes and feature additions.

### Changed
- Updated in-app changelog entries to reflect the latest runtime observability work.
- Refined desktop window defaults to support the new system log viewer.

### Fixed
- WebSocket compatibility regression in access-log middleware by forwarding required HTTP interfaces.
- Terminal/runtime observability coverage across frontend auth and terminal session flows.
- Administrative password rotation flow via `ui-panel reset-password`.

## [0.4.0] - 2026-04-05
### Changed
- Simplified login presentation.
- Improved host-terminal workflow and deployment ergonomics.
