#!/usr/bin/env bash
set -euo pipefail

APP_NAME="reneo"
SERVICE_FILE="/etc/systemd/system/reneo.service"
BIN_PATH="/usr/local/bin/reneo-agent"
CLI_PATH="/usr/local/bin/reneo"
INSTALL_ROOT="/opt/reneo"
CONFIG_DIR="/etc/reneo"
STATE_DIR="/var/lib/reneo"
PORTAINER_CONTAINERS=("reneo-portainer" "ypanel-portainer")
PORTAINER_VOLUME="portainer_data"
PG_DB_NAME="serverpanel"
PG_DB_USER="panel_user"
REMOVE_POSTGRES="false"

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

ask_remove_everything() {
  local answer
  printf '\n[%s] Apakah anda ingin menghapus keseluruhan beserta databasenya? [y/N]: ' "$APP_NAME"
  read -r answer
  case "${answer,,}" in
    y|ya|yes)
      REMOVE_POSTGRES="true"
      log "mode uninstall penuh dipilih; PostgreSQL dan database akan dihapus"
      ;;
    *)
      REMOVE_POSTGRES="false"
      log "database PostgreSQL akan dipertahankan"
      ;;
  esac
}

remove_service() {
  local unit
  for unit in reneo ypanel; do
    if systemctl list-unit-files | grep -q "^${unit}.service"; then
      log "menghapus service ${unit}"
      systemctl stop "${unit}.service" || true
      systemctl disable "${unit}.service" || true
    fi
  done
  if systemctl list-unit-files | grep -q '^ui-panel.service'; then
    log "menghapus service legacy ui-panel"
    systemctl stop ui-panel.service || true
    systemctl disable ui-panel.service || true
    rm -f /etc/systemd/system/ui-panel.service
  fi

  rm -f "$SERVICE_FILE" /etc/systemd/system/ypanel.service
  systemctl daemon-reload
}

remove_binary_and_data() {
  log "menghapus binary, config, state, dan frontend"
  rm -f "$BIN_PATH"
  rm -f "$CLI_PATH"
  rm -f /usr/local/bin/ui-panel-agent
  rm -f /usr/local/bin/ui-panel
  if [[ -L /etc/ui-panel/agent.env ]]; then
    rm -f /etc/ui-panel/agent.env
  fi
  # Names used before the rename: compatibility symlinks on migrated hosts, real files otherwise
  rm -f /usr/local/bin/ypanel-agent /usr/local/bin/ypanel
  rm -rf "$CONFIG_DIR" "$STATE_DIR" "$INSTALL_ROOT"
  rm -rf /etc/ypanel /var/lib/ypanel /opt/ypanel
}

remove_portainer() {
  if command -v docker >/dev/null 2>&1; then
    log "menghapus container Portainer yang dikelola installer"
    docker rm -f "${PORTAINER_CONTAINERS[@]}" >/dev/null 2>&1 || true
    docker volume rm "$PORTAINER_VOLUME" >/dev/null 2>&1 || true
  fi
}

remove_postgres() {
  if [[ "$REMOVE_POSTGRES" != "true" ]]; then
    return
  fi

  if ! command -v psql >/dev/null 2>&1; then
    log "PostgreSQL client tidak ditemukan; lewati penghapusan database"
  else
    log "menghapus database PostgreSQL panel"
    sudo -u postgres psql -d postgres -c "REVOKE CONNECT ON DATABASE ${PG_DB_NAME} FROM PUBLIC;" >/dev/null 2>&1 || true
    sudo -u postgres psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PG_DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
    sudo -u postgres psql -d postgres -c "DROP DATABASE IF EXISTS ${PG_DB_NAME};" >/dev/null 2>&1 || true
    sudo -u postgres psql -d postgres -c "DROP ROLE IF EXISTS ${PG_DB_USER};" >/dev/null 2>&1 || true
  fi

  if command -v apt-get >/dev/null 2>&1; then
    log "menghapus paket PostgreSQL"
    systemctl stop postgresql >/dev/null 2>&1 || true
    apt-get purge -y postgresql postgresql-client postgresql-common >/dev/null 2>&1 || true
    apt-get autoremove -y >/dev/null 2>&1 || true
  else
    log "apt-get tidak tersedia; lewati uninstall paket PostgreSQL"
  fi
}

main() {
  require_root
  ask_remove_everything
  remove_service
  remove_binary_and_data
  remove_portainer
  remove_postgres
  log "uninstall selesai"
}

main "$@"

