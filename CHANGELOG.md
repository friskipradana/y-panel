# Changelog

All notable changes to the UI Panel project will be documented in this file.

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
