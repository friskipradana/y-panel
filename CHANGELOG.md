# Changelog

All notable changes to the YPanel project will be documented in this file.

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
