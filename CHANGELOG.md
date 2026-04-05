# Changelog

All notable changes to the UI Panel project will be documented in this file.

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
