#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ui-panel"
APP_USER="root"
INSTALL_ROOT="/opt/ui-panel"
STATE_DIR="/var/lib/ui-panel"
CONFIG_DIR="/etc/ui-panel"
ENV_FILE="$CONFIG_DIR/agent.env"
SERVICE_FILE="/etc/systemd/system/ui-panel.service"
BIN_PATH="/usr/local/bin/ui-panel-agent"
CLI_PATH="/usr/local/bin/ui-panel"
FRONTEND_DIR="$INSTALL_ROOT/frontend"
PORTAINER_CONTAINER="ui-panel-portainer"
DEFAULT_BIND_ADDR="0.0.0.0:8787"
DEFAULT_PORTAINER_URL="http://127.0.0.1:9000"
DEFAULT_DB_HOST="127.0.0.1"
DEFAULT_DB_PORT="3306"
DEFAULT_DB_NAME="ui_panel"
DEFAULT_DB_USER="ui_panel"
DEFAULT_ALLOWED_HOSTS=""
DEFAULT_ALLOWED_ORIGINS=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

INSTALL_LOG_FILE="/tmp/${APP_NAME}-install.log"
MANAGED_ORIGINS_BLOCK_BEGIN="# UI_PANEL_ALLOWED_ORIGINS_BEGIN"
MANAGED_ORIGINS_BLOCK_END="# UI_PANEL_ALLOWED_ORIGINS_END"

log() {
  printf '\n[%s] %s\n' "$APP_NAME" "$1"
}

run_quiet() {
  if ! "$@" >>"$INSTALL_LOG_FILE" 2>&1; then
    printf '\n[%s] ERROR: command gagal. Cek log: %s\n' "$APP_NAME" "$INSTALL_LOG_FILE" >&2
    tail -n 40 "$INSTALL_LOG_FILE" >&2 || true
    exit 1
  fi
}

fail() {
  printf '\n[%s] ERROR: %s\n' "$APP_NAME" "$1" >&2
  exit 1
}

random_string() {
  local length="$1"
  local value

  set +o pipefail
  value="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$length")"
  set -o pipefail

  if [[ -z "$value" ]]; then
    fail "gagal membuat random string"
  fi

  printf '%s' "$value"
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    fail "installer harus dijalankan sebagai root (gunakan sudo)"
  fi
}

prepare_install_log() {
  : >"$INSTALL_LOG_FILE"
}

detect_pm() {
  if command -v apt-get >/dev/null 2>&1; then
    PKG_INSTALL='apt-get install -y'
    PKG_UPDATE='apt-get update -y'
  elif command -v dnf >/dev/null 2>&1; then
    PKG_INSTALL='dnf install -y'
    PKG_UPDATE='dnf makecache'
  elif command -v yum >/dev/null 2>&1; then
    PKG_INSTALL='yum install -y'
    PKG_UPDATE='yum makecache'
  else
    fail "package manager tidak didukung. Gunakan Debian/Ubuntu/RHEL compatible distro."
  fi
}

install_base_packages() {
  log "memastikan package dasar tersedia"
  eval "$PKG_UPDATE" >/dev/null 2>&1
  eval "$PKG_INSTALL curl ca-certificates tar gzip sed grep coreutils systemd" >/dev/null 2>&1
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "docker sudah tersedia"
  else
    log "menginstall docker"
    curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  fi

  run_quiet systemctl enable docker
  run_quiet systemctl restart docker
}

ensure_node_tooling() {
  if command -v node >/dev/null 2>&1; then
    local node_major
    node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [[ "$node_major" -ge 20 ]] && command -v npm >/dev/null 2>&1; then
      log "Node.js modern sudah tersedia"
      return
    fi
  fi

  log "menginstall Node.js modern"
  if command -v apt-get >/dev/null 2>&1; then
    run_quiet apt-get purge -y nodejs npm
    run_quiet apt-get update -y
    run_quiet apt-get install -y ca-certificates curl gnupg
    run_quiet bash -lc 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -'
    run_quiet apt-get install -y nodejs npm
    return
  fi

  fail "installer frontend saat ini membutuhkan Node.js modern (>=20). Pasang Node.js secara manual untuk distro ini."
}

ensure_go() {
  if command -v go >/dev/null 2>&1; then
    log "go sudah tersedia: $(go version)"
    return
  fi

  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) GO_ARCH="amd64" ;;
    aarch64|arm64) GO_ARCH="arm64" ;;
    *) fail "arsitektur tidak didukung untuk Go: $arch" ;;
  esac

  local go_version="1.22.12"
  local archive="go${go_version}.linux-${GO_ARCH}.tar.gz"
  local archive_path="/tmp/${archive}"
  local urls=(
    "https://dl.google.com/go/${archive}"
    "https://go.dev/dl/${archive}"
  )

  log "menginstall Go ${go_version}"
  rm -rf /usr/local/go "$archive_path"

  local downloaded=0
  local url
  for url in "${urls[@]}"; do
    printf '[%s] mencoba mirror Go: %s\n' "$APP_NAME" "$url" >>"$INSTALL_LOG_FILE"
    if curl --fail --silent --show-error --location --retry 3 --retry-delay 2 --connect-timeout 15 "$url" -o "$archive_path" >>"$INSTALL_LOG_FILE" 2>&1; then
      if tar -tzf "$archive_path" >/dev/null 2>&1; then
        downloaded=1
        break
      fi
      printf '[%s] archive Go rusak/tidak valid dari mirror: %s\n' "$APP_NAME" "$url" >>"$INSTALL_LOG_FILE"
      rm -f "$archive_path"
    fi
  done

  if [[ "$downloaded" -ne 1 ]]; then
    if command -v apt-get >/dev/null 2>&1; then
      printf '[%s] fallback install Go via apt-get\n' "$APP_NAME" >>"$INSTALL_LOG_FILE"
      run_quiet apt-get update -y
      run_quiet apt-get install -y golang-go
      log "go tersedia via apt: $(go version)"
      return
    fi
    fail "gagal mengunduh archive Go dari mirror mana pun"
  fi

  run_quiet tar -C /usr/local -xzf "$archive_path"
  export PATH="/usr/local/go/bin:$PATH"
  log "go berhasil diinstall: $(/usr/local/go/bin/go version)"
}

ensure_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    log "cloudflared sudah tersedia: $(cloudflared -V)"
    return
  fi

  log "menginstall cloudflared"
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) CF_ARCH="amd64" ;;
    aarch64|arm64) CF_ARCH="arm64" ;;
    armv7l|armv7) CF_ARCH="armhf" ;;
    *) fail "arsitektur tidak didukung untuk cloudflared: $arch" ;;
  esac

  local url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"
  local bin_path="/usr/local/bin/cloudflared"

  printf '[%s] mengunduh cloudflared dari %s\n' "$APP_NAME" "$url" >>"$INSTALL_LOG_FILE"
  if ! curl --fail --silent --show-error --location --retry 3 "$url" -o "$bin_path" >>"$INSTALL_LOG_FILE" 2>&1; then
    fail "gagal mengunduh cloudflared"
  fi
  chmod +x "$bin_path"
  log "cloudflared berhasil diinstall: $(cloudflared -V)"
}

ui_panel_config() {
  log "konfigurasi ui-panel"

  local current_bind_addr=""
  local current_allowed_hosts=""
  local current_allowed_origins=""
  local current_hostname=""
  local primary_ip=""
  local interactive_mode=0
  if [[ -t 0 && -t 1 ]]; then
    interactive_mode=1
  fi

  if [[ -f "$ENV_FILE" ]]; then
    current_bind_addr="$(grep '^PANEL_BIND_ADDR=' "$ENV_FILE" | head -n 1 | cut -d= -f2- || true)"
    current_allowed_hosts="$(grep '^PANEL_ALLOWED_HOSTS=' "$ENV_FILE" | head -n 1 | cut -d= -f2- || true)"
    current_allowed_origins="$(grep '^PANEL_ALLOWED_ORIGINS=' "$ENV_FILE" | head -n 1 | cut -d= -f2- || true)"
  fi

  current_bind_addr="${current_bind_addr:-$DEFAULT_BIND_ADDR}"

  if [[ -z "${PANEL_BIND_ADDR:-}" ]]; then
    if [[ "$interactive_mode" -eq 1 ]]; then
      read -r -p "Bind address panel [${current_bind_addr}]: " PANEL_BIND_ADDR || true
      PANEL_BIND_ADDR="${PANEL_BIND_ADDR:-$current_bind_addr}"
    else
      PANEL_BIND_ADDR="$current_bind_addr"
      log "Bind address (otomatis): $PANEL_BIND_ADDR"
    fi
  else
    log "Bind address (dari env): $PANEL_BIND_ADDR"
  fi

  current_hostname="$(hostname 2>/dev/null || true)"
  current_hostname="${current_hostname//[$'\r\n']/}"
  primary_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  primary_ip="${primary_ip//[$'\r\n']/}"

  PANEL_SESSION_SECRET="$(random_string 48)"
  PANEL_INSTALL_CHANNEL="stable"
  PANEL_PORTAINER_URL="$DEFAULT_PORTAINER_URL"
  PANEL_DB_ENABLED="true"
  PANEL_ALLOWED_HOSTS="${current_allowed_hosts:-${DEFAULT_ALLOWED_HOSTS}}"
  PANEL_ALLOWED_ORIGINS="${current_allowed_origins:-${DEFAULT_ALLOWED_ORIGINS}}"
  PANEL_ENCRYPTION_KEY="${PANEL_ENCRYPTION_KEY:-$(random_string 64)}"
  PANEL_DATABASE_DSN="${PANEL_DATABASE_DSN:-}"
  PANEL_SESSION_TTL="${PANEL_SESSION_TTL:-12h}"

  if [[ -z "$PANEL_ALLOWED_HOSTS" ]]; then
    PANEL_ALLOWED_HOSTS="localhost,127.0.0.1"
    if [[ -n "$current_hostname" && "$current_hostname" != "localhost" ]]; then
      PANEL_ALLOWED_HOSTS+=",${current_hostname}"
    fi
    if [[ -n "$primary_ip" && "$primary_ip" != "127.0.0.1" ]]; then
      PANEL_ALLOWED_HOSTS+=",${primary_ip}"
    fi
  fi

  if [[ -z "$PANEL_ALLOWED_ORIGINS" ]]; then
    local bind_port="${PANEL_BIND_ADDR##*:}"
    PANEL_ALLOWED_ORIGINS="http://127.0.0.1:${bind_port},http://localhost:${bind_port}"
    if [[ -n "$current_hostname" && "$current_hostname" != "localhost" ]]; then
      PANEL_ALLOWED_ORIGINS+=",http://${current_hostname}:${bind_port}"
    fi
    if [[ -n "$primary_ip" && "$primary_ip" != "127.0.0.1" ]]; then
      PANEL_ALLOWED_ORIGINS+=",http://${primary_ip}:${bind_port}"
    fi
  fi
}

ensure_mariadb() {
  local db_service=""

  if command -v mariadb >/dev/null 2>&1 || command -v mysql >/dev/null 2>&1; then
    log "MariaDB/MySQL client sudah tersedia"
  else
    log "menginstall MariaDB server"
    if command -v apt-get >/dev/null 2>&1; then
      run_quiet apt-get install -y mariadb-server mariadb-client
    elif command -v dnf >/dev/null 2>&1; then
      run_quiet dnf install -y mariadb-server mariadb
    elif command -v yum >/dev/null 2>&1; then
      run_quiet yum install -y mariadb-server mariadb
    else
      fail "installer MariaDB belum didukung untuk distro ini"
    fi
  fi

  for candidate in mariadb mysql mysqld; do
    if systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${candidate}\\.service"; then
      db_service="$candidate"
      break
    fi
    if systemctl list-units --all --type=service 2>/dev/null | grep -q "${candidate}\\.service"; then
      db_service="$candidate"
      break
    fi
    if systemctl status "${candidate}.service" >/dev/null 2>&1; then
      db_service="$candidate"
      break
    fi
  done

  if [[ -z "$db_service" ]]; then
    fail "service MariaDB/MySQL tidak ditemukan setelah instalasi (cek nama unit: mariadb/mysql/mysqld)"
  fi

  log "mengaktifkan service database: ${db_service}.service"
  run_quiet systemctl daemon-reload
  run_quiet systemctl enable "${db_service}.service"
  run_quiet systemctl restart "${db_service}.service"
}

run_sql() {
  local statement="$1"

  if command -v mariadb >/dev/null 2>&1; then
    run_quiet mariadb -u root -e "$statement"
    return
  fi

  if command -v mysql >/dev/null 2>&1; then
    run_quiet mysql -u root -e "$statement"
    return
  fi

  fail "client MariaDB/MySQL tidak tersedia"
}

provision_database() {
  if [[ -n "${PANEL_DATABASE_DSN:-}" ]]; then
    log "menggunakan PostgreSQL dari PANEL_DATABASE_DSN; provisioning MariaDB dilewati"
    return
  fi

  log "menyiapkan database MariaDB untuk runtime panel"
  run_sql "CREATE DATABASE IF NOT EXISTS \`${PANEL_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  run_sql "CREATE USER IF NOT EXISTS '${PANEL_DB_USER}'@'${PANEL_DB_HOST}' IDENTIFIED BY '${PANEL_DB_PASSWORD}';"
  run_sql "ALTER USER '${PANEL_DB_USER}'@'${PANEL_DB_HOST}' IDENTIFIED BY '${PANEL_DB_PASSWORD}';"
  run_sql "GRANT ALL PRIVILEGES ON \`${PANEL_DB_NAME}\`.* TO '${PANEL_DB_USER}'@'${PANEL_DB_HOST}'; FLUSH PRIVILEGES;"
}

setup_directories() {
  log "menyiapkan direktori runtime"
  mkdir -p "$INSTALL_ROOT" "$STATE_DIR" "$CONFIG_DIR" "$FRONTEND_DIR"
  chmod 700 "$CONFIG_DIR"
}

ensure_hostname_resolution() {
  local current_hostname
  local hosts_file="/etc/hosts"

  current_hostname="$(hostname 2>/dev/null || true)"
  current_hostname="${current_hostname//[$'\r\n']/}"

  if [[ -z "$current_hostname" || "$current_hostname" == "localhost" ]]; then
    return
  fi

  if getent hosts "$current_hostname" >/dev/null 2>&1; then
    return
  fi

  log "menyinkronkan hostname aktif ke /etc/hosts"
  if grep -qE '^127\.0\.1\.1\s+' "$hosts_file"; then
    sed -i "s/^127\.0\.1\.1\s\+.*/127.0.1.1 ${current_hostname}/" "$hosts_file"
  else
    printf '\n127.0.1.1 %s\n' "$current_hostname" >> "$hosts_file"
  fi
}

build_agent() {
  log "membangun binary Go agent"
  export PATH="/usr/local/go/bin:$PATH"
  cd "$REPO_ROOT"
  run_quiet go mod download
  run_quiet go build -o "$BIN_PATH" ./cmd/panel-agent
  chmod 755 "$BIN_PATH"
}

extract_managed_origins_block() {
  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi

  awk -v begin="$MANAGED_ORIGINS_BLOCK_BEGIN" -v end="$MANAGED_ORIGINS_BLOCK_END" '
    $0 == begin { in_block=1 }
    in_block { print }
    $0 == end && in_block { exit }
  ' "$ENV_FILE"
}

write_env_file() {
  local preserved_origins_block

  log "menulis file konfigurasi $ENV_FILE"
  preserved_origins_block="$(extract_managed_origins_block || true)"
  cat > "$ENV_FILE" <<EOF
PANEL_BIND_ADDR=${PANEL_BIND_ADDR}
PANEL_ALLOWED_HOSTS=${PANEL_ALLOWED_HOSTS}
PANEL_ALLOWED_ORIGINS=${PANEL_ALLOWED_ORIGINS}
PANEL_SESSION_SECRET=${PANEL_SESSION_SECRET}
PANEL_SESSION_TTL=${PANEL_SESSION_TTL}
PANEL_STATE_DIR=${STATE_DIR}
PANEL_PORTAINER_URL=${PANEL_PORTAINER_URL}
PANEL_INSTALL_CHANNEL=${PANEL_INSTALL_CHANNEL}
PANEL_FRONTEND_DIR=${FRONTEND_DIR}
PANEL_DB_ENABLED=${PANEL_DB_ENABLED}
PANEL_DATABASE_DSN=${PANEL_DATABASE_DSN}
PANEL_ENCRYPTION_KEY=${PANEL_ENCRYPTION_KEY}
PANEL_ENV_FILE=${ENV_FILE}
EOF
  if [[ -n "$preserved_origins_block" ]]; then
    printf '%s\n' "$preserved_origins_block" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
}

prepare_frontend() {
  log "menyiapkan frontend panel"
  cd "$REPO_ROOT"

  if [[ ! -d "$REPO_ROOT/dist" ]]; then
    ensure_node_tooling
    log "membangun frontend panel"
    if command -v npm >/dev/null 2>&1; then
      run_quiet npm install
      run_quiet npm run build
    elif command -v bun >/dev/null 2>&1; then
      run_quiet bun install
      run_quiet bun run build
    else
      fail "npm atau bun diperlukan untuk build frontend"
    fi
  else
    log "menggunakan frontend build yang sudah tersedia"
  fi

  rm -rf "$FRONTEND_DIR"
  mkdir -p "$FRONTEND_DIR"
  cp -R "$REPO_ROOT/dist/." "$FRONTEND_DIR/"
}

install_service() {
  log "menginstall systemd service"

  if [[ ! -f "$REPO_ROOT/installer/linux/ui-panel.service.tpl" ]]; then
    fail "template systemd tidak ditemukan: $REPO_ROOT/installer/linux/ui-panel.service.tpl"
  fi

  cp "$REPO_ROOT/installer/linux/ui-panel.service.tpl" "$SERVICE_FILE" || fail "gagal menyalin template service ke $SERVICE_FILE"
  chmod 644 "$SERVICE_FILE" || fail "gagal chmod service file $SERVICE_FILE"

  if ! command -v systemctl >/dev/null 2>&1; then
    fail "systemctl tidak tersedia di server"
  fi

  run_quiet systemctl daemon-reload
  run_quiet systemctl enable ui-panel.service
}

install_cli() {
  log "menginstall command line ui-panel"
  cat > "$CLI_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/ui-panel/agent.env"
SERVICE_NAME="ui-panel.service"
PASSWORD_HISTORY_FILE="/var/lib/ui-panel/password-history.log"

require_root_cli() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    printf '\nui-panel harus dijalankan dengan sudo atau sebagai root.\n' >&2
    printf 'Contoh: sudo ui-panel\n\n' >&2
    exit 1
  fi
}

env_file_exists() {
  [[ -f "$ENV_FILE" ]]
}

get_env_value() {
  local key="$1"

  if ! env_file_exists; then
    return 1
  fi

  grep "^${key}=" "$ENV_FILE" | head -n 1 | cut -d= -f2-
}

get_bind_addr() {
  local bind_addr
  bind_addr="$(get_env_value PANEL_BIND_ADDR || true)"
  printf '%s' "${bind_addr:-0.0.0.0:8787}"
}

get_bind_host() {
  local bind_addr
  bind_addr="$(get_bind_addr)"
  if [[ "$bind_addr" == *:* ]]; then
    printf '%s' "${bind_addr%:*}"
  else
    printf '0.0.0.0'
  fi
}

get_bind_port() {
  local bind_addr
  bind_addr="$(get_bind_addr)"
  printf '%s' "${bind_addr##*:}"
}

show_panel_info() {
  local bind_addr
  local bind_port
  local host_ip
  local hostname_value

  bind_addr="$(get_bind_addr)"
  bind_port="$(get_bind_port)"
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  host_ip="${host_ip:-127.0.0.1}"
  hostname_value="$(hostname 2>/dev/null || true)"
  hostname_value="${hostname_value:-localhost}"

  printf '\nUI Panel Service Manager\n'
  printf 'Panel bind    : %s\n' "$bind_addr"
  printf 'Panel local   : http://127.0.0.1:%s\n' "$bind_port"
  printf 'Panel network : http://%s:%s\n' "$host_ip" "$bind_port"
  printf 'Panel host    : http://%s:%s\n\n' "$hostname_value" "$bind_port"
}

reset_password() {
  local password
  local confirm_password
  local command_output
  local status
  local timestamp

  if ! env_file_exists; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi

  read -r -s -p 'Password admin baru: ' password
  printf '\n'
  read -r -s -p 'Konfirmasi password admin baru: ' confirm_password
  printf '\n'

  if [[ -z "$password" ]]; then
    printf '\nPassword admin tidak boleh kosong.\n' >&2
    exit 1
  fi

  if [[ "$password" != "$confirm_password" ]]; then
    printf '\nKonfirmasi password admin tidak cocok.\n' >&2
    exit 1
  fi

  set +e
  command_output="$(printf '%s\n' "$password" | /usr/local/bin/ui-panel-agent reset-primary-password --password-stdin 2>&1)"
  status=$?
  set -e

  printf '%s\n' "$command_output"

  if [[ "$status" -ne 0 ]]; then
    printf '\nGagal mengubah password akun utama panel.\n' >&2
    exit 1
  fi

  mkdir -p "$(dirname "$PASSWORD_HISTORY_FILE")"
  touch "$PASSWORD_HISTORY_FILE"
  chmod 600 "$PASSWORD_HISTORY_FILE"
  timestamp="$(date '+%Y-%m-%d %H:%M:%S %Z')"
  printf '[%s] primary panel password updated via runtime-cli by %s\n' "$timestamp" "$(whoami)" >> "$PASSWORD_HISTORY_FILE"
}

view_password_history() {
  if [[ ! -f "$PASSWORD_HISTORY_FILE" ]]; then
    printf '\nBelum ada riwayat ganti password yang tercatat.\n'
    return
  fi

  printf '\nRiwayat Ganti Password UI Panel\n'
  printf '%s\n' '----------------------------------------'
  cat "$PASSWORD_HISTORY_FILE"
}

reset_db_password() {
  local db_host
  local db_user
  local db_name
  local db_password
  local escaped_password

  if ! env_file_exists; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi

  db_host="$(grep '^PANEL_DB_HOST=' "$ENV_FILE" | cut -d= -f2-)"
  db_user="$(grep '^PANEL_DB_USER=' "$ENV_FILE" | cut -d= -f2-)"
  db_name="$(grep '^PANEL_DB_NAME=' "$ENV_FILE" | cut -d= -f2-)"

  if [[ -z "$db_host" || -z "$db_user" || -z "$db_name" ]]; then
    printf '\nReset Password Database dari CLI hanya didukung untuk mode env database lama.\n' >&2
    printf 'Runtime saat ini memakai PANEL_DATABASE_DSN / PostgreSQL, jadi ubah password DB lewat flow PostgreSQL yang sesuai.\n' >&2
    return
  fi

  read -r -s -p 'Password database baru: ' db_password
  printf '\n'

  if [[ -z "$db_password" ]]; then
    printf '\nPassword database tidak boleh kosong.\n' >&2
    exit 1
  fi

  if command -v mariadb >/dev/null 2>&1; then
    mariadb -u root -e "ALTER USER '${db_user}'@'${db_host}' IDENTIFIED BY '${db_password}'; GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${db_user}'@'${db_host}'; FLUSH PRIVILEGES;"
  elif command -v mysql >/dev/null 2>&1; then
    mysql -u root -e "ALTER USER '${db_user}'@'${db_host}' IDENTIFIED BY '${db_password}'; GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${db_user}'@'${db_host}'; FLUSH PRIVILEGES;"
  else
    printf '\nClient MariaDB/MySQL tidak ditemukan.\n' >&2
    exit 1
  fi

  escaped_password="$(printf '%s' "$db_password" | sed 's/[\\&]/\\&/g')"
  sed -i "s/^PANEL_DB_PASSWORD=.*/PANEL_DB_PASSWORD=${escaped_password}/" "$ENV_FILE"
  systemctl restart "$SERVICE_NAME"
  printf '\nPassword database berhasil direset dan service direstart.\n'
}

change_panel_port() {
  local current_bind_addr
  local current_bind_host
  local current_port
  local new_port
  local next_bind_addr
  local current_allowed_origins
  local current_allowed_origins
  local current_origins_text
  local next_origins_text
  local updated_origins

  if ! env_file_exists; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi

  current_bind_addr="$(get_bind_addr)"
  current_bind_host="$(get_bind_host)"
  current_port="${current_bind_addr##*:}"
  current_allowed_origins="$(get_env_value PANEL_ALLOWED_ORIGINS || true)"
  current_origins_text=""
  if [[ -n "$current_allowed_origins" ]]; then
    current_origins_text="$(printf '%s\n' "$current_allowed_origins" | tr ',' '\n')"
  fi

  read -r -p "Port panel baru [${current_port}]: " new_port
  new_port="${new_port:-$current_port}"

  if [[ ! "$new_port" =~ ^[0-9]+$ ]] || (( new_port < 1 || new_port > 65535 )); then
    printf '\nPort tidak valid. Gunakan angka 1-65535.\n' >&2
    exit 1
  fi

  next_bind_addr="${current_bind_host}:${new_port}"
  sed -i "s/^PANEL_BIND_ADDR=.*/PANEL_BIND_ADDR=${next_bind_addr}/" "$ENV_FILE"

  if [[ -n "$current_origins_text" ]]; then
    next_origins_text="$(printf '%s\n' "$current_origins_text" | sed -E "/^[[:space:]]*#/! s#(https?://[^/:]+):[0-9]+#\\1:${new_port}#g")"
    updated_origins="$(printf '%s\n' "$next_origins_text" | grep -v '^[[:space:]]*#' | sed '/^[[:space:]]*$/d' | paste -sd, -)"
    sed -i "s#^PANEL_ALLOWED_ORIGINS=.*#PANEL_ALLOWED_ORIGINS=${updated_origins}#" "$ENV_FILE"
  fi

  systemctl restart "$SERVICE_NAME"

  printf '\nPort panel berhasil diubah ke %s dan service direstart.\n' "$new_port"
  printf 'Bind baru   : %s\n' "$next_bind_addr"
  printf 'Akses lokal : http://127.0.0.1:%s\n' "$new_port"
}

edit_panel_origins() {
  local raw_file="/etc/ui-panel/allowed-origins.raw"
  local current_allowed_origins
  local temp_file
  local edited_origins
  local editor_bin

  if ! env_file_exists; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi

  temp_file="$(mktemp /tmp/ui-panel-origins.XXXXXX)"

  if [[ -f "$raw_file" ]]; then
    cat "$raw_file" > "$temp_file"
  else
    current_allowed_origins="$(get_env_value PANEL_ALLOWED_ORIGINS || true)"
    {
      printf '# Satu origin per baris. Komentar (#) = tidak aktif. Contoh:\n'
      printf '# http://127.0.0.1:80\n'
      if [[ -n "$current_allowed_origins" ]]; then
        printf '%s\n' "$current_allowed_origins" | tr ',' '\n'
      fi
    } > "$temp_file"
  fi

  editor_bin="${VISUAL:-${EDITOR:-nano}}"
  if ! command -v "$editor_bin" >/dev/null 2>&1; then
    editor_bin="vi"
  fi

  "$editor_bin" "$temp_file"

  cp "$temp_file" "$raw_file"
  chmod 600 "$raw_file"

  edited_origins="$(grep -v '^\s*#' "$temp_file" | sed '/^\s*$/d' | paste -sd, -)"

  if grep -q '^PANEL_ALLOWED_ORIGINS=' "$ENV_FILE"; then
    sed -i "s#^PANEL_ALLOWED_ORIGINS=.*#PANEL_ALLOWED_ORIGINS=${edited_origins}#" "$ENV_FILE"
  else
    printf 'PANEL_ALLOWED_ORIGINS=%s\n' "$edited_origins" >> "$ENV_FILE"
  fi

  rm -f "$temp_file"
  systemctl restart "$SERVICE_NAME"
  printf '\nAllowed origins berhasil diperbarui dan service direstart.\n'
}

change_panel_access() {
  change_panel_port
}

run_action() {
  case "$1" in
    restart)
      systemctl restart ui-panel.service
      printf '\nService berhasil direstart.\n'
      ;;
    stop)
      systemctl stop ui-panel.service
      printf '\nService berhasil dihentikan.\n'
      ;;
    reset-password)
      reset_password
      ;;
    reset-db-password)
      reset_db_password
      ;;
    change-port)
      change_panel_port
      ;;
    edit-origins)
      edit_panel_origins
      ;;
    view-logs)
      journalctl -u "$SERVICE_NAME" -n 120 --no-pager
      ;;
    view-password-history)
      view_password_history
      ;;
    uninstall)
      bash /opt/ui-panel/installer/uninstall.sh
      ;;
    *)
      printf '\nAksi tidak dikenal: %s\n' "$1"
      exit 1
      ;;
  esac
}

show_menu() {
  show_panel_info
  printf '1. Restart Service\n'
  printf '2. Stop Service\n'
  printf '3. Reset Password Admin\n'
  printf '4. Reset Password Database\n'
  printf '5. Ubah Port Panel\n'
  printf '6. Edit Allowed Origins\n'
  printf '7. Lihat Log Service\n'
  printf '8. Lihat History Ganti Password\n'
  printf '9. Uninstall\n'
  printf '10. Exit\n\n'
  read -r -p 'Pilih opsi [1-10]: ' choice

  case "$choice" in
    1) run_action restart ;;
    2) run_action stop ;;
    3) run_action reset-password ;;
    4) run_action reset-db-password ;;
    5) run_action change-port ;;
    6) run_action edit-origins ;;
    7) run_action view-logs ;;
    8) run_action view-password-history ;;
    9) run_action uninstall ;;
    10) exit 0 ;;
    *)
      printf '\nPilihan tidak valid.\n'
      exit 1
      ;;
  esac
}

require_root_cli

if [[ $# -gt 0 ]]; then
  run_action "$1"
else
  show_menu
fi
EOF
  chmod 755 "$CLI_PATH"

  mkdir -p "$INSTALL_ROOT/installer"
  cp "$REPO_ROOT/installer/linux/uninstall.sh" "$INSTALL_ROOT/installer/uninstall.sh"
  chmod 755 "$INSTALL_ROOT/installer/uninstall.sh"
}

ensure_portainer() {
  log "memastikan Portainer berjalan secara lokal"

  if docker ps -a --format '{{.Names}}' | grep -q "^${PORTAINER_CONTAINER}$"; then
    docker rm -f "$PORTAINER_CONTAINER" >/dev/null 2>&1 || true
  fi

  docker volume create portainer_data >/dev/null 2>&1 || true

  local attempt
  for attempt in 1 2 3; do
    if docker pull portainer/portainer-ce:lts >/dev/null 2>&1 && \
      docker run -d \
        --name "$PORTAINER_CONTAINER" \
        --restart unless-stopped \
        -p 127.0.0.1:9000:9000 \
        -p 127.0.0.1:9443:9443 \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v portainer_data:/data \
        portainer/portainer-ce:lts >/dev/null 2>&1; then
      return
    fi

    docker rm -f "$PORTAINER_CONTAINER" >/dev/null 2>&1 || true
    sleep 3
  done

  fail "gagal menjalankan Portainer setelah beberapa percobaan"
}

print_summary() {
  local host_ip
  local bind_port
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  host_ip="${host_ip:-127.0.0.1}"
  bind_port="${PANEL_BIND_ADDR##*:}"

  log "instalasi selesai"
  printf '\nPanel URL      : http://%s\n' "$host_ip:$bind_port"
  printf 'Panel local    : http://127.0.0.1:%s\n' "$bind_port"
  printf 'Bind address   : %s\n' "$PANEL_BIND_ADDR"
  printf 'Frontend path  : %s\n' "$FRONTEND_DIR"
  printf 'Portainer      : hanya localhost melalui backend agent\n'
  printf 'CLI command    : ui-panel\n'
  printf '\nLangkah berikutnya:\n'
  printf '  1. Buka panel di browser\n'
  printf '  2. Jalankan first-run setup\n'
  printf '  3. Buat Admin Pertama dari UI\n'

  printf '\nPerintah penting:\n'
  printf '  ui-panel\n'
  printf '  systemctl status ui-panel\n'
  printf '  journalctl -u ui-panel -f\n'
}

main() {
  require_root
  prepare_install_log
  detect_pm
  install_base_packages
  ensure_docker
  ensure_go
  ensure_cloudflared
  ui_panel_config
  setup_directories
  ensure_hostname_resolution
  if [[ -n "${PANEL_DATABASE_DSN:-}" ]]; then
    log "PANEL_DATABASE_DSN terdeteksi; setup MariaDB lokal dilewati"
  else
    ensure_mariadb
    provision_database
  fi
  build_agent
  prepare_frontend
  write_env_file
  install_service
  install_cli
  ensure_portainer
  print_summary
}

main "$@"
