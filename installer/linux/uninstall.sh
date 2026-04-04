#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ui-panel"
SERVICE_FILE="/etc/systemd/system/ui-panel.service"
BIN_PATH="/usr/local/bin/ui-panel-agent"
CLI_PATH="/usr/local/bin/ui-panel"
INSTALL_ROOT="/opt/ui-panel"
CONFIG_DIR="/etc/ui-panel"
STATE_DIR="/var/lib/ui-panel"
PORTAINER_CONTAINER="ui-panel-portainer"
PORTAINER_VOLUME="portainer_data"

log() {
  printf '\n[%s] %s\n' "$APP_NAME" "$1"
}

fail() {
  printf '\n[%s] ERROR: %s\n' "$APP_NAME" "$1" >&2
  exit 1
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    fail "uninstall harus dijalankan sebagai root (gunakan sudo)"
  fi
}

remove_service() {
  if systemctl list-unit-files | grep -q '^ui-panel.service'; then
    log "menghapus service ui-panel"
    systemctl stop ui-panel.service || true
    systemctl disable ui-panel.service || true
  fi

  rm -f "$SERVICE_FILE"
  systemctl daemon-reload
}

remove_binary_and_data() {
  log "menghapus binary, config, state, dan frontend"
  rm -f "$BIN_PATH"
  rm -f "$CLI_PATH"
  rm -rf "$CONFIG_DIR"
  rm -rf "$STATE_DIR"
  rm -rf "$INSTALL_ROOT"
}

remove_portainer() {
  if command -v docker >/dev/null 2>&1; then
    log "menghapus container Portainer yang dikelola installer"
    docker rm -f "$PORTAINER_CONTAINER" >/dev/null 2>&1 || true
    docker volume rm "$PORTAINER_VOLUME" >/dev/null 2>&1 || true
  fi
}

main() {
  require_root
  remove_service
  remove_binary_and_data
  remove_portainer
  log "uninstall selesai"
}

main "$@"
