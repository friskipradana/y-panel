#!/usr/bin/env bash
set -euo pipefail

# Error trap — print line number and failing command for diagnostics
trap 'rc=$?; echo "[reneo] FATAL (exit $rc) at line $BASH_LINENO: ${BASH_COMMAND} (log: /tmp/reneo-install.log)" >&2; exit $rc' ERR

APP_NAME="reneo"
LEGACY_NAME="ypanel"
LEGACY_INSTALL_ROOT="/opt/ypanel"
LEGACY_STATE_DIR="/var/lib/ypanel"
LEGACY_CONFIG_DIR="/etc/ypanel"
LEGACY_SERVICE_FILE="/etc/systemd/system/ypanel.service"
LEGACY_BIN_PATH="/usr/local/bin/ypanel-agent"
LEGACY_CLI_PATH="/usr/local/bin/ypanel"
APP_USER="root"
INSTALL_ROOT="/opt/reneo"
STATE_DIR="/var/lib/reneo"
CONFIG_DIR="/etc/reneo"
ENV_FILE="$CONFIG_DIR/agent.env"
SERVICE_FILE="/etc/systemd/system/reneo.service"
BIN_PATH="/usr/local/bin/reneo-agent"
CLI_PATH="/usr/local/bin/reneo"
FRONTEND_DIR="$INSTALL_ROOT/frontend"
PORTAINER_CONTAINERS=("reneo-portainer" "ypanel-portainer")
DEFAULT_BIND_ADDR="0.0.0.0:8787"
DEFAULT_PORTAINER_URL=""
DEFAULT_DB_HOST="127.0.0.1"
DEFAULT_DB_PORT="5432"
DEFAULT_DB_NAME="reneo"
DEFAULT_DB_USER="reneo"
DEFAULT_ALLOWED_HOSTS=""
DEFAULT_ALLOWED_ORIGINS=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${RENEO_REPO_ROOT:-${YPANEL_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}}"

INSTALL_LOG_FILE="/tmp/${APP_NAME}-install.log"
MANAGED_ORIGINS_BLOCK_BEGIN="# UI_PANEL_ALLOWED_ORIGINS_BEGIN"
MANAGED_ORIGINS_BLOCK_END="# UI_PANEL_ALLOWED_ORIGINS_END"

# ---- Output helpers ----------------------------------------------------------
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""
fi

TOTAL_STEPS=9
STEP_NO=0
INSTALL_STARTED_AT="$(date +%s)"

# Major phase header: [3/9] Judul
step() {
  STEP_NO=$((STEP_NO + 1))
  printf '\n%s[%d/%d]%s %s%s%s\n' "$C_CYAN" "$STEP_NO" "$TOTAL_STEPS" "$C_RESET" "$C_BOLD" "$1" "$C_RESET"
}

# Detail line within a phase
log() {
  printf '  %s•%s %s\n' "$C_DIM" "$C_RESET" "$1"
}

ok() {
  printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"
}

warn() {
  printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1" >&2
}

usage() {
  cat <<USAGE
Reneo installer

Penggunaan: bash reneo-installer.run [opsi]

Opsi:
  --bind ADDR       Alamat bind panel (default: 0.0.0.0:8787 atau nilai terpasang)
  -y, --yes         Non-interaktif, pakai nilai default/terpasang tanpa bertanya
  --skip-start      Pasang tanpa menjalankan/restart service
  --no-color        Matikan warna output
  -h, --help        Tampilkan bantuan ini

Variabel lingkungan (awalan RENEO_ atau PANEL_): PANEL_BIND_ADDR, PANEL_DATABASE_DSN, PANEL_DB_PASSWORD,
PANEL_ALLOWED_HOSTS, PANEL_ALLOWED_ORIGINS, PANEL_SESSION_TTL.
Log lengkap instalasi: ${INSTALL_LOG_FILE}
USAGE
}

ASSUME_YES=0
SKIP_START=0
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --bind) PANEL_BIND_ADDR="${2:-}"; shift 2 ;;
      --bind=*) PANEL_BIND_ADDR="${1#*=}"; shift ;;
      -y|--yes) ASSUME_YES=1; shift ;;
      --skip-start) SKIP_START=1; shift ;;
      --no-color) C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""; shift ;;
      -h|--help) usage; exit 0 ;;
      *) printf 'Opsi tidak dikenal: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
  done
}

# Version of the bundle being installed (written by scripts/package-installer.ps1)
read_bundle_version() {
  local file
  for file in "$REPO_ROOT/VERSION" "$SCRIPT_DIR/VERSION"; do
    if [[ -f "$file" ]]; then
      tr -d '\r\n[:space:]' <"$file"
      return
    fi
  done
  printf 'dev'
}

run_quiet() {
  if ! "$@" >>"$INSTALL_LOG_FILE" 2>&1; then
    printf '\n%s✗ ERROR:%s perintah gagal: %s\n  Log lengkap: %s\n\n' "$C_RED" "$C_RESET" "$*" "$INSTALL_LOG_FILE" >&2
    tail -n 25 "$INSTALL_LOG_FILE" >&2 || true
    exit 1
  fi
}

fail() {
  printf '\n%s✗ ERROR:%s %s\n' "$C_RED" "$C_RESET" "$1" >&2
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
  log "memeriksa package dasar (curl, tar, gzip, systemd)"
  eval "$PKG_UPDATE" >>"$INSTALL_LOG_FILE" 2>&1 || warn "pembaruan indeks package gagal; melanjutkan dengan cache yang ada"
  eval "$PKG_INSTALL curl ca-certificates tar gzip sed grep coreutils systemd openssl" >>"$INSTALL_LOG_FILE" 2>&1 \
    || fail "gagal memasang package dasar. Cek log: $INSTALL_LOG_FILE"
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    ok "docker sudah tersedia ($(docker --version 2>/dev/null | cut -d, -f1))"
  else
    log "menginstall docker (beberapa menit)"
    curl -fsSL https://get.docker.com | sh >>"$INSTALL_LOG_FILE" 2>&1 \
      || fail "gagal memasang docker. Cek log: $INSTALL_LOG_FILE"
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

# Prebuilt agent shipped inside the bundle for this CPU architecture ("" if none)
prebuilt_agent_path() {
  local arch name
  arch="$(uname -m)"
  case "$arch" in
    x86_64) name="reneo-agent-linux-amd64" ;;
    aarch64|arm64) name="reneo-agent-linux-arm64" ;;
    *) return 0 ;;
  esac
  if [[ -f "$REPO_ROOT/bin/$name" ]]; then
    printf '%s' "$REPO_ROOT/bin/$name"
  fi
}

ensure_go() {
  if command -v go >/dev/null 2>&1; then
    ok "go sudah tersedia: $(go version | awk '{print $3}')"
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

  log "menginstall Go ${go_version} (untuk membangun agent dari source)"
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
      ok "go tersedia via apt: $(go version | awk '{print $3}')"
      return
    fi
    fail "gagal mengunduh archive Go dari mirror mana pun"
  fi

  run_quiet tar -C /usr/local -xzf "$archive_path"
  export PATH="/usr/local/go/bin:$PATH"
  if [[ ! -x /usr/local/go/bin/go ]]; then
    fail "instalasi Go gagal: /usr/local/go/bin/go tidak ditemukan setelah ekstraksi"
  fi
  ok "go terpasang: $(/usr/local/go/bin/go version | awk '{print $3}')"
}

ensure_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    ok "cloudflared sudah tersedia ($(cloudflared -V 2>&1 | head -n 1))"
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
  ok "cloudflared terpasang ($(cloudflared -V 2>&1 | head -n 1))"
}

reneo_config() {
  local current_bind_addr=""
  local current_allowed_hosts=""
  local current_allowed_origins=""
  local current_hostname=""
  local primary_ip=""
  local interactive_mode=0
  if [[ -t 0 && -t 1 && "$ASSUME_YES" -eq 0 ]]; then
    interactive_mode=1
  fi

  if [[ -f "$ENV_FILE" ]]; then
    # Strip \r from existing env file (Windows CRLF compatibility)
    sed -i 's/\r$//' "$ENV_FILE"
    current_bind_addr="$(grep '^PANEL_BIND_ADDR=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '\r\n' || true)"
    current_allowed_hosts="$(grep '^PANEL_ALLOWED_HOSTS=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '\r\n' || true)"
    current_allowed_origins="$(grep '^PANEL_ALLOWED_ORIGINS=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '\r\n' || true)"
    PANEL_DB_NAME="${PANEL_DB_NAME:-$(grep '^PANEL_DB_NAME=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '\r\n' || true)}"
    PANEL_DB_USER="${PANEL_DB_USER:-$(grep '^PANEL_DB_USER=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '\r\n' || true)}"
    PANEL_DATABASE_DSN="${PANEL_DATABASE_DSN:-$(grep '^PANEL_DATABASE_DSN=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '\r\n' || true)}"
    PANEL_ENCRYPTION_KEY="${PANEL_ENCRYPTION_KEY:-$(grep '^PANEL_ENCRYPTION_KEY=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '\r\n' || true)}"
    PANEL_SESSION_SECRET="${PANEL_SESSION_SECRET:-$(grep '^PANEL_SESSION_SECRET=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | tr -d '\r\n' || true)}"
  fi

  current_bind_addr="${current_bind_addr:-$DEFAULT_BIND_ADDR}"

  # A DSN counts as "provided" only when it came from the environment or an existing
  # agent.env. The generated default below must not skip local PostgreSQL setup.
  if [[ -n "${PANEL_DATABASE_DSN:-}" ]]; then
    DSN_PROVIDED=1
  else
    DSN_PROVIDED=0
  fi

  if [[ -z "${PANEL_BIND_ADDR:-}" ]]; then
    if [[ "$interactive_mode" -eq 1 ]]; then
      read -r -p "Bind address panel [${current_bind_addr}]: " PANEL_BIND_ADDR || true
      PANEL_BIND_ADDR="${PANEL_BIND_ADDR:-$current_bind_addr}"
    else
      PANEL_BIND_ADDR="$current_bind_addr"
      log "bind address: $PANEL_BIND_ADDR"
    fi
  else
    log "bind address: $PANEL_BIND_ADDR"
  fi

  if [[ ! "$PANEL_BIND_ADDR" =~ ^[^[:space:]]*:[0-9]{1,5}$ ]]; then
    fail "bind address tidak valid: '$PANEL_BIND_ADDR' (format host:port, contoh 0.0.0.0:8787)"
  fi

  current_hostname="$(hostname 2>/dev/null || true)"
  current_hostname="${current_hostname//[$'\r\n']/}"
  primary_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  primary_ip="${primary_ip//[$'\r\n']/}"

  PANEL_SESSION_SECRET="${PANEL_SESSION_SECRET:-$(random_string 48)}"
  PANEL_INSTALL_CHANNEL="stable"
  PANEL_PORTAINER_URL="$DEFAULT_PORTAINER_URL"
  PANEL_DB_ENABLED="true"
  PANEL_ALLOWED_HOSTS="${current_allowed_hosts:-${DEFAULT_ALLOWED_HOSTS}}"
  PANEL_ALLOWED_ORIGINS="${current_allowed_origins:-${DEFAULT_ALLOWED_ORIGINS}}"
  PANEL_ENCRYPTION_KEY="${PANEL_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
  if [[ ! "$PANEL_ENCRYPTION_KEY" =~ ^[0-9a-fA-F]{64}$ ]]; then
    log "PANEL_ENCRYPTION_KEY tidak valid; membuat key AES-256 baru"
    PANEL_ENCRYPTION_KEY="$(openssl rand -hex 32)"
  fi
  PANEL_DB_HOST="${PANEL_DB_HOST:-$DEFAULT_DB_HOST}"
  PANEL_DB_PORT="${PANEL_DB_PORT:-$DEFAULT_DB_PORT}"
  PANEL_DB_NAME="${PANEL_DB_NAME:-$DEFAULT_DB_NAME}"
  PANEL_DB_USER="${PANEL_DB_USER:-$DEFAULT_DB_USER}"
  PANEL_DB_PASSWORD="${PANEL_DB_PASSWORD:-$(random_string 32)}"
  PANEL_DATABASE_DSN="${PANEL_DATABASE_DSN:-postgres://${PANEL_DB_USER}:${PANEL_DB_PASSWORD}@${PANEL_DB_HOST}:${PANEL_DB_PORT}/${PANEL_DB_NAME}?sslmode=disable}"
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

ensure_postgres() {
  local db_service=""

  if command -v psql >/dev/null 2>&1; then
    log "PostgreSQL client sudah tersedia"
  else
    log "menginstall PostgreSQL server"
    if command -v apt-get >/dev/null 2>&1; then
      run_quiet apt-get install -y postgresql postgresql-client
    elif command -v dnf >/dev/null 2>&1; then
      run_quiet dnf install -y postgresql-server postgresql
      if [[ ! -d /var/lib/pgsql/data/base ]]; then
        run_quiet postgresql-setup --initdb
      fi
    elif command -v yum >/dev/null 2>&1; then
      run_quiet yum install -y postgresql-server postgresql
      if [[ ! -d /var/lib/pgsql/data/base ]]; then
        run_quiet postgresql-setup --initdb
      fi
    else
      fail "installer PostgreSQL belum didukung untuk distro ini"
    fi
  fi

  for candidate in postgresql postgresql@15-main postgresql@14-main postgresql@13-main; do
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
    fail "service PostgreSQL tidak ditemukan setelah instalasi"
  fi

  log "mengaktifkan service database: ${db_service}.service"
  run_quiet systemctl daemon-reload
  run_quiet systemctl enable "${db_service}.service"
  run_quiet systemctl restart "${db_service}.service"
}

run_psql() {
  local statement="$1"

  if command -v sudo >/dev/null 2>&1; then
    run_quiet sudo -u postgres psql -v ON_ERROR_STOP=1 -c "$statement"
    return
  fi

  run_quiet su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"$statement\""
}

psql_scalar() {
  local statement="$1"

  if command -v sudo >/dev/null 2>&1; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc "$statement" 2>>"$INSTALL_LOG_FILE" | tr -d '[:space:]'
    return
  fi

  su - postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$statement\"" 2>>"$INSTALL_LOG_FILE" | tr -d '[:space:]'
}

psql_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

provision_database() {
  local db_name db_user db_password
  db_name="$(psql_literal "$PANEL_DB_NAME")"
  db_user="$(psql_literal "$PANEL_DB_USER")"
  db_password="$(psql_literal "$PANEL_DB_PASSWORD")"

  log "menyiapkan database PostgreSQL untuk runtime panel"
  run_psql "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${db_user}') THEN CREATE ROLE \"${db_user}\" LOGIN PASSWORD '${db_password}'; ELSE ALTER ROLE \"${db_user}\" WITH LOGIN PASSWORD '${db_password}'; END IF; END \$\$;"
  if [[ "$(psql_scalar "SELECT 1 FROM pg_database WHERE datname = '${db_name}';")" != "1" ]]; then
    run_psql "CREATE DATABASE \"${db_name}\" OWNER \"${db_user}\";"
  else
    run_psql "ALTER DATABASE \"${db_name}\" OWNER TO \"${db_user}\";"
  fi
  run_psql "GRANT ALL PRIVILEGES ON DATABASE \"${db_name}\" TO \"${db_user}\";"
}

migrate_legacy_runtime() {
  local legacy_config_dir="/etc/ui-panel"
  local legacy_env_file="${legacy_config_dir}/agent.env"
  local legacy_state_dir="/var/lib/ui-panel"
  local legacy_install_root="/opt/ui-panel"

  if [[ -f "$legacy_env_file" && ! -f "$ENV_FILE" ]]; then
    log "migrasi konfigurasi legacy ui-panel ke reneo"
    mkdir -p "$CONFIG_DIR"
    cp "$legacy_env_file" "$ENV_FILE"
    # Strip \r (Windows CRLF compatibility)
    sed -i 's/\r$//' "$ENV_FILE"
  fi

  if [[ -d "$legacy_state_dir" && ! -d "$STATE_DIR" ]]; then
    log "migrasi state legacy ui-panel ke reneo"
    mkdir -p "$STATE_DIR"
    cp -a "$legacy_state_dir/." "$STATE_DIR/" 2>/dev/null || true
  fi

  if [[ -d "$legacy_install_root" && ! -d "$INSTALL_ROOT" ]]; then
    mkdir -p "$INSTALL_ROOT"
  fi
}

# Moves an existing ypanel layout to reneo and leaves symlinks so old paths, scripts and
# cloudflared configs that mention /var/lib/ypanel keep working.
migrate_ypanel_layout() {
  local moved=0
  local pair legacy current

  for pair in \
    "$LEGACY_CONFIG_DIR:$CONFIG_DIR" \
    "$LEGACY_STATE_DIR:$STATE_DIR" \
    "$LEGACY_INSTALL_ROOT:$INSTALL_ROOT"; do
    legacy="${pair%%:*}"
    current="${pair##*:}"
    if [[ -d "$legacy" && ! -L "$legacy" && ! -e "$current" ]]; then
      if [[ "$moved" -eq 0 ]]; then
        log "mengganti nama instalasi ypanel menjadi reneo"
        systemctl stop ypanel.service >>"$INSTALL_LOG_FILE" 2>&1 || true
        moved=1
      fi
      mv "$legacy" "$current"
      ln -sfn "$current" "$legacy"
      log "dipindahkan: $legacy -> $current (symlink lama dipertahankan)"
    fi
  done

  if [[ -e "$LEGACY_SERVICE_FILE" && -f "$ENV_FILE" ]]; then
    sed -i "s#/etc/ypanel/#/etc/reneo/#g; s#/var/lib/ypanel#/var/lib/reneo#g; s#/opt/ypanel#/opt/reneo#g" "$ENV_FILE" 2>/dev/null || true
  fi
}

# ypanel/ypanel-agent/ypanel.service keep working as aliases of the reneo names
install_ypanel_compat_links() {
  ln -sfn "$BIN_PATH" "$LEGACY_BIN_PATH"
  ln -sfn "$CLI_PATH" "$LEGACY_CLI_PATH"
  if [[ -f "$LEGACY_SERVICE_FILE" && ! -L "$LEGACY_SERVICE_FILE" ]]; then
    systemctl disable ypanel.service >>"$INSTALL_LOG_FILE" 2>&1 || true
    rm -f "$LEGACY_SERVICE_FILE"
  fi
  [[ -d "$LEGACY_CONFIG_DIR" || -L "$LEGACY_CONFIG_DIR" ]] || ln -sfn "$CONFIG_DIR" "$LEGACY_CONFIG_DIR"
  [[ -d "$LEGACY_STATE_DIR" || -L "$LEGACY_STATE_DIR" ]] || ln -sfn "$STATE_DIR" "$LEGACY_STATE_DIR"
  [[ -d "$LEGACY_INSTALL_ROOT" || -L "$LEGACY_INSTALL_ROOT" ]] || ln -sfn "$INSTALL_ROOT" "$LEGACY_INSTALL_ROOT"
}

install_legacy_aliases() {
  log "alias kompatibilitas ui-panel"
  ln -sfn "$BIN_PATH" /usr/local/bin/ui-panel-agent
  ln -sfn "$CLI_PATH" /usr/local/bin/ui-panel
  mkdir -p /etc/ui-panel
  ln -sfn "$ENV_FILE" /etc/ui-panel/agent.env
}

# Ookla's speedtest client for the Speedtest window. Installed from Ookla's official archive into
# the panel's own folder (not apt: that package is also called `speedtest` and collides with the
# Python speedtest-cli on /usr/bin/speedtest). Never fatal: the panel works without it, and the
# Speedtest window can install it later. Accepting Ookla's licence stays a manual step in the panel.
ensure_speedtest_cli() {
  local dest="$STATE_DIR/bin/speedtest"
  local version="1.2.0"
  local name sum

  if [[ -x "$dest" ]] && "$dest" --version 2>/dev/null | grep -qi 'by ookla'; then
    ok "klien Speedtest Ookla sudah tersedia"
    return 0
  fi

  case "$(uname -m)" in
    x86_64)        name="x86_64";  sum="5690596c54ff9bed63fa3732f818a05dbc2db19ad36ed68f21ca5f64d5cfeeb7" ;;
    aarch64|arm64) name="aarch64"; sum="3953d231da3783e2bf8904b6dd72767c5c6e533e163d3742fd0437affa431bd3" ;;
    armv7l|armv7)  name="armhf";   sum="e45fcdebbd8a185553535533dd032d6b10bc8c64eee4139b1147b9c09835d08d" ;;
    i386|i686)     name="i386";    sum="9ff7e18dbae7ee0e03c66108445a2fb6ceea6c86f66482e1392f55881b772fe8" ;;
    *)
      warn "klien Speedtest Ookla dilewati: arsitektur $(uname -m) tidak didukung"
      return 0
      ;;
  esac

  log "memasang klien Speedtest Ookla"
  local work archive
  work="$(mktemp -d)"
  archive="$work/speedtest.tgz"
  if ! curl --fail --silent --show-error --location --retry 3 --max-filesize 8388608 \
    "https://install.speedtest.net/app/cli/ookla-speedtest-${version}-linux-${name}.tgz" -o "$archive" >>"$INSTALL_LOG_FILE" 2>&1; then
    warn "klien Speedtest Ookla dilewati: unduhan gagal (bisa dipasang nanti dari jendela Speedtest)"
    rm -rf "$work"
    return 0
  fi
  if [[ "$(sha256sum "$archive" | cut -d' ' -f1)" != "$sum" ]]; then
    warn "klien Speedtest Ookla dilewati: checksum arsip tidak cocok"
    rm -rf "$work"
    return 0
  fi
  # only the client is unpacked, into a folder of its own
  if ! tar -xzf "$archive" -C "$work" speedtest >>"$INSTALL_LOG_FILE" 2>&1 || ! "$work/speedtest" --version 2>/dev/null | grep -qi 'by ookla'; then
    warn "klien Speedtest Ookla dilewati: arsip tidak berisi klien yang bisa dijalankan"
    rm -rf "$work"
    return 0
  fi
  mkdir -p "$STATE_DIR/bin"
  install -m 755 "$work/speedtest" "$dest"
  rm -rf "$work"
  ok "klien Speedtest Ookla terpasang (lisensi disetujui manual di jendela Speedtest)"
}

setup_directories() {
  log "menyiapkan direktori runtime"
  mkdir -p "$INSTALL_ROOT" "$STATE_DIR" "$CONFIG_DIR" "$FRONTEND_DIR"
  chmod 700 "$CONFIG_DIR"
  read_bundle_version >"$INSTALL_ROOT/VERSION"
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

install_agent() {
  local prebuilt
  prebuilt="$(prebuilt_agent_path)"

  # Stop the running agent first so the binary can be replaced safely
  local unit
  for unit in reneo.service ypanel.service; do
    if systemctl is-active --quiet "$unit" 2>/dev/null; then
      log "menghentikan service ${unit%.service} untuk mengganti binary"
      systemctl stop "$unit" >>"$INSTALL_LOG_FILE" 2>&1 || true
    fi
  done

  if [[ -n "$prebuilt" ]]; then
    log "memasang binary agent bawaan paket ($(basename "$prebuilt"))"
    install -m 755 "$prebuilt" "$BIN_PATH"
    return
  fi

  log "binary bawaan tidak tersedia untuk $(uname -m); membangun dari source"
  ensure_go
  export PATH="/usr/local/go/bin:$PATH"
  cd "$REPO_ROOT"
  run_quiet go mod download
  run_quiet go build -trimpath -ldflags="-s -w" -o "$BIN_PATH" ./cmd/panel-agent
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

  if [[ -f "$ENV_FILE" ]]; then
    cp -p "$ENV_FILE" "${ENV_FILE}.bak"
    log "cadangan konfigurasi lama: ${ENV_FILE}.bak"
  fi
  log "menulis konfigurasi $ENV_FILE"
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
PANEL_DB_HOST=${PANEL_DB_HOST}
PANEL_DB_PORT=${PANEL_DB_PORT}
PANEL_DB_NAME=${PANEL_DB_NAME}
PANEL_DB_USER=${PANEL_DB_USER}
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
    log "memakai frontend build bawaan paket"
  fi

  rm -rf "$FRONTEND_DIR"
  mkdir -p "$FRONTEND_DIR"
  cp -R "$REPO_ROOT/dist/." "$FRONTEND_DIR/"
}

install_service() {
  log "memasang unit systemd reneo.service"

  if [[ -f "$LEGACY_SERVICE_FILE" && ! -L "$LEGACY_SERVICE_FILE" ]]; then
    systemctl stop ypanel.service >>"$INSTALL_LOG_FILE" 2>&1 || true
    systemctl disable ypanel.service >>"$INSTALL_LOG_FILE" 2>&1 || true
    rm -f "$LEGACY_SERVICE_FILE"
  fi

  if [[ ! -f "$REPO_ROOT/installer/linux/reneo.service.tpl" ]]; then
    fail "template systemd tidak ditemukan: $REPO_ROOT/installer/linux/reneo.service.tpl"
  fi

  cp "$REPO_ROOT/installer/linux/reneo.service.tpl" "$SERVICE_FILE" || fail "gagal menyalin template service ke $SERVICE_FILE"
  chmod 644 "$SERVICE_FILE" || fail "gagal chmod service file $SERVICE_FILE"

  if ! command -v systemctl >/dev/null 2>&1; then
    fail "systemctl tidak tersedia di server"
  fi

  run_quiet systemctl daemon-reload
  systemctl stop ui-panel.service >/dev/null 2>&1 || true
  systemctl disable ui-panel.service >/dev/null 2>&1 || true
  run_quiet systemctl enable reneo.service
}

bind_port() {
  printf '%s' "${PANEL_BIND_ADDR##*:}"
}

# Is something other than reneo already listening on the panel port?
port_conflict() {
  local port
  port="$(bind_port)"
  command -v ss >/dev/null 2>&1 || return 1
  ss -ltnpH "sport = :${port}" 2>/dev/null | grep -Ev 'reneo-agent|ypanel-agent' | grep -q .
}

start_service() {
  if [[ "$SKIP_START" -eq 1 ]]; then
    warn "--skip-start: service tidak dijalankan. Jalankan: systemctl restart reneo"
    SERVICE_STATE="dilewati"
    return
  fi

  if port_conflict; then
    warn "port $(bind_port) sudah dipakai proses lain; service mungkin gagal start (cek: ss -ltnp | grep :$(bind_port))"
  fi

  log "menjalankan service reneo"
  systemctl restart reneo.service >>"$INSTALL_LOG_FILE" 2>&1 || true

  local port tries=0 max=40
  port="$(bind_port)"
  while [[ "$tries" -lt "$max" ]]; do
    if curl -fsS --max-time 2 "http://127.0.0.1:${port}/healthz" >/dev/null 2>&1; then
      SERVICE_STATE="berjalan"
      ok "panel merespons di 127.0.0.1:${port} (/healthz)"
      return
    fi
    if ! systemctl is-active --quiet reneo.service; then
      break
    fi
    tries=$((tries + 1))
    sleep 1
  done

  SERVICE_STATE="gagal"
  printf '\n%s✗ Service reneo tidak sehat setelah %ss.%s Log terakhir:\n' "$C_RED" "$tries" "$C_RESET" >&2
  journalctl -u reneo -n 25 --no-pager >&2 || true
  fail "panel tidak merespons. Periksa: journalctl -u reneo -n 100 --no-pager"
}

install_cli() {
  log "memasang CLI /usr/local/bin/reneo"
  cat > "${CLI_PATH}.new" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Error trap — shows exact failing line and command for debugging
trap 'echo "[reneo] FATAL ERROR at line $BASH_LINENO: $(sed -n "${BASH_LINENO}p" "$0" 2>/dev/null || echo "?")" >&2' ERR

ENV_FILE="/etc/reneo/agent.env"
SERVICE_NAME="reneo.service"
PASSWORD_HISTORY_FILE="/var/lib/reneo/password-history.log"
AGENT_BIN="/usr/local/bin/reneo-agent"

require_root_cli() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    printf '\nreneo harus dijalankan dengan sudo atau sebagai root.\n' >&2
    printf 'Contoh: sudo reneo\n\n' >&2
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

RELEASE_REPO="${RENEO_UPDATE_REPO:-friskipradana/y-panel}"
VERSION_FILE="/opt/reneo/VERSION"

installed_version() {
  local v=""
  [[ -f "$VERSION_FILE" ]] && v="$(tr -d 'v \r\n' <"$VERSION_FILE")"
  printf '%s' "${v:-unknown}"
}

latest_version() {
  local json tag
  json="$(curl -fsSL --max-time 10 -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/${RELEASE_REPO}/releases/latest" 2>/dev/null)" || return 1
  tag="$(printf '%s' "$json" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  [[ -n "$tag" ]] || return 1
  printf '%s' "${tag#v}"
}

# true when $1 is a newer version than $2
version_gt() {
  [[ "$1" != "$2" && "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n1)" == "$1" ]]
}

# exit 0 up to date, 10 update available, 2 could not check
check_update() {
  local current latest
  current="$(installed_version)"
  printf 'Versi terpasang : v%s\n' "$current"
  if ! latest="$(latest_version)"; then
    printf 'Versi terbaru   : tidak dapat diperiksa (tanpa internet atau batas API GitHub)\n' >&2
    return 2
  fi
  printf 'Versi terbaru   : v%s\n' "$latest"
  if [[ "$current" == "unknown" ]]; then
    printf '\nVersi terpasang tidak diketahui; jalankan: sudo reneo update\n'
    return 10
  fi
  if version_gt "$latest" "$current"; then
    printf '\nPembaruan tersedia. Jalankan: sudo reneo update\n'
    printf 'Catatan rilis   : https://github.com/%s/releases/tag/v%s\n' "$RELEASE_REPO" "$latest"
    return 10
  fi
  printf '\nSudah versi terbaru.\n'
  return 0
}

# reneo update [--yes] [--check] [--version X.Y.Z]
do_update() {
  local assume_yes=0 check_only=0 target="" current answer asset url tmp_file
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -y|--yes) assume_yes=1 ;;
      --check) check_only=1 ;;
      --version) target="${2:-}"; shift ;;
      --version=*) target="${1#*=}" ;;
      *) printf 'Opsi update tidak dikenal: %s\n' "$1" >&2; return 1 ;;
    esac
    shift
  done

  current="$(installed_version)"
  if [[ -z "$target" ]]; then
    if ! target="$(latest_version)"; then
      printf '\nTidak dapat memeriksa versi terbaru. Periksa koneksi internet.\n' >&2
      return 2
    fi
  fi
  target="${target#v}"
  if [[ ! "$target" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '\nVersi tidak valid: %s (contoh: 3.4.0)\n' "$target" >&2
    return 1
  fi

  printf 'Versi terpasang : v%s\nVersi tujuan    : v%s\n' "$current" "$target"
  if [[ "$current" != "unknown" ]] && ! version_gt "$target" "$current"; then
    printf '\nTidak ada pembaruan: v%s tidak lebih baru dari v%s.\n' "$target" "$current"
    return 0
  fi
  if [[ "$check_only" -eq 1 ]]; then
    printf '\nPembaruan tersedia ke v%s.\n' "$target"
    return 10
  fi

  if [[ "$assume_yes" -ne 1 ]]; then
    read -r -p "Perbarui ke v${target}? Service akan direstart sebentar. [y/N]: " answer || true
    case "${answer,,}" in
      y|ya|yes) ;;
      *) printf 'Dibatalkan.\n'; return 0 ;;
    esac
  fi

  asset="reneo-installer.run"
  version_gt "3.4.0" "$target" && asset="ypanel-installer.run"
  url="https://github.com/${RELEASE_REPO}/releases/download/v${target}/${asset}"
  tmp_file="$(mktemp /tmp/reneo-update.XXXXXX.run)"
  trap 'rm -f "$tmp_file" "$tmp_file.sha256"' RETURN

  printf '\nMengunduh %s\n' "$url"
  curl -fL --retry 3 --connect-timeout 15 -o "$tmp_file" "$url" || { printf 'Gagal mengunduh installer.\n' >&2; return 1; }
  if curl -fsSL --connect-timeout 15 -o "$tmp_file.sha256" "https://github.com/${RELEASE_REPO}/releases/download/v${target}/reneo-installer.run.sha256" 2>/dev/null; then
    local want have
    want="$(cut -d' ' -f1 "$tmp_file.sha256")"
    have="$(sha256sum "$tmp_file" | cut -d' ' -f1)"
    if [[ "$want" != "$have" ]]; then
      printf 'Checksum tidak cocok, pembaruan dibatalkan.\n' >&2
      return 1
    fi
    printf 'Checksum sha256 cocok.\n'
  fi

  bash "$tmp_file" --yes
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

  printf '\nReneo Service Manager  v%s\n' "$(installed_version)"
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
  command_output="$(printf '%s\n' "$password" | /usr/local/bin/reneo-agent reset-primary-password --password-stdin 2>&1)"
  status=$?
  set -e

  printf '%s\n' "$command_output"

  if [[ "$status" -ne 0 ]]; then
    printf '\nGagal mengubah password akun utama Reneo.\n' >&2
    exit 1
  fi

  mkdir -p "$(dirname "$PASSWORD_HISTORY_FILE")"
  touch "$PASSWORD_HISTORY_FILE"
  chmod 600 "$PASSWORD_HISTORY_FILE"
  timestamp="$(date '+%Y-%m-%d %H:%M:%S %Z')"
  printf '[%s] primary Reneo password updated via runtime-cli by %s\n' "$timestamp" "$(whoami)" >> "$PASSWORD_HISTORY_FILE"
}

view_password_history() {
  if [[ ! -f "$PASSWORD_HISTORY_FILE" ]]; then
    printf '\nBelum ada riwayat ganti password yang tercatat.\n'
    return
  fi

  printf '\nRiwayat Ganti Password Reneo\n'
  printf '%s\n' '----------------------------------------'
  cat "$PASSWORD_HISTORY_FILE"
}

migrate_up() {
  if ! env_file_exists; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi
  "$AGENT_BIN" migrate up
}

rollback_last_migration() {
  if ! env_file_exists; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi
  "$AGENT_BIN" migrate rollback
}

migration_status() {
  if ! env_file_exists; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi
  "$AGENT_BIN" migrate status
}

reset_db_password() {
  local db_host
  local db_user
  local db_name
  local db_port
  local db_password
  local escaped_password

  if ! env_file_exists; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi

  db_host="$(grep '^PANEL_DB_HOST=' "$ENV_FILE" | cut -d= -f2-)"
  db_port="$(grep '^PANEL_DB_PORT=' "$ENV_FILE" | cut -d= -f2-)"
  db_user="$(grep '^PANEL_DB_USER=' "$ENV_FILE" | cut -d= -f2-)"
  db_name="$(grep '^PANEL_DB_NAME=' "$ENV_FILE" | cut -d= -f2-)"

  if [[ -z "$db_host" || -z "$db_user" || -z "$db_name" ]]; then
    printf '\nReset Password Database membutuhkan PANEL_DB_HOST, PANEL_DB_PORT, PANEL_DB_USER, dan PANEL_DB_NAME di %s.\n' "$ENV_FILE" >&2
    return
  fi

  read -r -s -p 'Password database baru: ' db_password
  printf '\n'

  if [[ -z "$db_password" ]]; then
    printf '\nPassword database tidak boleh kosong.\n' >&2
    exit 1
  fi

  run_psql "ALTER ROLE \"$(psql_literal "$db_user")\" WITH LOGIN PASSWORD '$(psql_literal "$db_password")';"

  escaped_password="$(printf '%s' "$db_password" | sed 's/[\\&]/\\&/g')"
  if grep -q '^PANEL_DATABASE_DSN=' "$ENV_FILE"; then
    local escaped_dsn
    escaped_dsn="$(printf 'postgres://%s:%s@%s:%s/%s?sslmode=disable' "$db_user" "$db_password" "${db_host:-$DEFAULT_DB_HOST}" "${db_port:-$DEFAULT_DB_PORT}" "$db_name" | sed 's/[\\&]/\\&/g')"
    sed -i "s#^PANEL_DATABASE_DSN=.*#PANEL_DATABASE_DSN=${escaped_dsn}#" "$ENV_FILE"
  fi
  systemctl restart "$SERVICE_NAME"
  printf '\nPassword database PostgreSQL berhasil direset dan service direstart.\n'
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
  local raw_file="/etc/reneo/allowed-origins.raw"
  local current_allowed_origins
  local temp_file
  local edited_origins
  local editor_bin

  if ! env_file_exists; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi

  temp_file="$(mktemp /tmp/reneo-origins.XXXXXX)"

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
  local action="$1"
  shift || true
  case "$action" in
    restart)
      systemctl restart reneo.service
      printf '\nService berhasil direstart.\n'
      ;;
    stop)
      systemctl stop reneo.service
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
    migrate-up)
      migrate_up
      ;;
    migrate-rollback)
      rollback_last_migration
      ;;
    migrate-status)
      migration_status
      ;;
    version)
      printf 'Reneo v%s\n' "$(installed_version)"
      ;;
    check-update)
      check_update
      ;;
    update)
      do_update "$@"
      ;;
    uninstall)
      bash /opt/reneo/installer/uninstall.sh
      ;;
    *)
      printf '\nAksi tidak dikenal: %s\n' "$action"
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
  printf '9. Jalankan Migrasi Database\n'
  printf '10. Rollback Migrasi Terakhir\n'
  printf '11. Lihat Status Migrasi\n'
  printf '12. Cek Pembaruan\n'
  printf '13. Perbarui Sekarang\n'
  printf '14. Uninstall\n'
  printf '15. Exit\n\n'
  read -r -p 'Pilih opsi [1-15]: ' choice

  case "$choice" in
    1) run_action restart ;;
    2) run_action stop ;;
    3) run_action reset-password ;;
    4) run_action reset-db-password ;;
    5) run_action change-port ;;
    6) run_action edit-origins ;;
    7) run_action view-logs ;;
    8) run_action view-password-history ;;
    9) run_action migrate-up ;;
    10) run_action migrate-rollback ;;
    11) run_action migrate-status ;;
    12) run_action check-update || true ;;
    13) run_action update ;;
    14) run_action uninstall ;;
    15) exit 0 ;;
    *)
      printf '\nPilihan tidak valid.\n'
      exit 1
      ;;
  esac
}

require_root_cli

if [[ $# -gt 0 ]]; then
  run_action "$@"
else
  show_menu
fi
EOF
  chmod 755 "${CLI_PATH}.new"
  mv -f "${CLI_PATH}.new" "$CLI_PATH"

  mkdir -p "$INSTALL_ROOT/installer"
  cp "$REPO_ROOT/installer/linux/uninstall.sh" "$INSTALL_ROOT/installer/uninstall.sh"
  chmod 755 "$INSTALL_ROOT/installer/uninstall.sh"
}

disable_portainer() {
  log "memastikan sidecar Portainer lama tidak berjalan"

  local name
  for name in "${PORTAINER_CONTAINERS[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
      docker rm -f "$name" >/dev/null 2>&1 || true
    fi
  done
  docker volume rm portainer_data >/dev/null 2>&1 || true
}

print_summary() {
  local host_ip port elapsed version
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  host_ip="${host_ip:-127.0.0.1}"
  port="$(bind_port)"
  elapsed=$(( $(date +%s) - INSTALL_STARTED_AT ))
  version="$(read_bundle_version)"

  printf '\n%s%s=====================================================%s\n' "$C_GREEN" "$C_BOLD" "$C_RESET"
  if [[ "$IS_UPGRADE" -eq 1 ]]; then
    printf '%s%s Reneo diperbarui ke v%s%s  (%ss)\n' "$C_GREEN" "$C_BOLD" "${version#v}" "$C_RESET" "$elapsed"
  else
    printf '%s%s Reneo v%s terpasang%s  (%ss)\n' "$C_GREEN" "$C_BOLD" "${version#v}" "$C_RESET" "$elapsed"
  fi
  printf '%s%s=====================================================%s\n\n' "$C_GREEN" "$C_BOLD" "$C_RESET"

  printf '  %-14s %s\n' "Buka panel" "http://${host_ip}:${port}"
  printf '  %-14s %s\n' "Lokal" "http://127.0.0.1:${port}"
  printf '  %-14s %s\n' "Service" "reneo.service (${SERVICE_STATE})"
  printf '  %-14s %s\n' "Konfigurasi" "$ENV_FILE"
  printf '  %-14s %s\n' "Data" "$STATE_DIR"
  printf '  %-14s %s\n' "Frontend" "$FRONTEND_DIR"
  printf '  %-14s %s\n' "Database" "$([[ "$DSN_PROVIDED" -eq 1 ]] && printf 'DSN dari konfigurasi' || printf 'PostgreSQL lokal (%s)' "$PANEL_DB_NAME")"
  printf '  %-14s %s\n' "Log instalasi" "$INSTALL_LOG_FILE"

  if [[ "$IS_UPGRADE" -eq 1 ]]; then
    printf '\n%sCatatan upgrade:%s muat ulang browser (Ctrl+F5). Konfigurasi lama dicadangkan di %s.bak\n' "$C_BOLD" "$C_RESET" "$ENV_FILE"
  else
    printf '\n%sLangkah berikutnya:%s\n' "$C_BOLD" "$C_RESET"
    printf '  1. Buka http://%s:%s di browser\n' "$host_ip" "$port"
    printf '  2. Selesaikan first-run setup\n'
    printf '  3. Buat akun Admin pertama\n'
  fi

  printf '\n%sPerintah berguna:%s\n' "$C_BOLD" "$C_RESET"
  printf '  reneo                          menu kelola panel (password, port, origins, migrasi)\n'
  printf '  systemctl status reneo         status service\n'
  printf '  journalctl -u reneo -f         log langsung\n'
  printf '  bash %s --help        opsi installer\n\n' "reneo-installer.run"
}

main() {
  parse_args "$@"
  # RENEO_BIND_ADDR, RENEO_DATABASE_DSN, ... work like their PANEL_ counterparts
  local _kv _key
  while IFS='=' read -r _key _kv; do
    case "$_key" in
      RENEO_REPO_ROOT|RENEO_HOME|RENEO_CONFIG_DIR|RENEO_SERVICE_NAME) ;;
      RENEO_*) export "PANEL_${_key#RENEO_}=${_kv}" ;;
    esac
  done < <(env | grep '^RENEO_' || true)
  require_root
  prepare_install_log

  # Upgrade when a previous configuration exists
  IS_UPGRADE=0
  if [[ -f "$ENV_FILE" || -f "$LEGACY_CONFIG_DIR/agent.env" || -f /etc/ui-panel/agent.env ]]; then
    IS_UPGRADE=1
  fi
  SERVICE_STATE="tidak dijalankan"
  DSN_PROVIDED=0

  local mode="pemasangan baru"
  [[ "$IS_UPGRADE" -eq 1 ]] && mode="pembaruan"
  printf '%sReneo installer%s  v%s  (%s)\n' "$C_BOLD" "$C_RESET" "$(read_bundle_version | sed 's/^v//')" "$mode"

  step "Prasyarat sistem"
  detect_pm
  install_base_packages
  ensure_docker
  ensure_cloudflared

  step "Konfigurasi"
  migrate_ypanel_layout
  reneo_config
  migrate_legacy_runtime
  setup_directories
  ensure_speedtest_cli
  ensure_hostname_resolution

  step "Database"
  if [[ "$DSN_PROVIDED" -eq 1 ]]; then
    log "memakai database dari konfigurasi (PANEL_DATABASE_DSN); PostgreSQL lokal tidak disentuh"
  else
    ensure_postgres
    provision_database
  fi

  step "Agent"
  install_agent

  step "Frontend"
  prepare_frontend

  step "Menulis konfigurasi"
  write_env_file

  step "Migrasi database"
  log "menjalankan migrasi"
  PANEL_ENV_FILE="$ENV_FILE" run_quiet "$BIN_PATH" migrate up
  ok "skema database terbaru"

  step "Service dan CLI"
  install_service
  install_cli
  install_legacy_aliases
  install_ypanel_compat_links
  disable_portainer
  start_service

  step "Selesai"
  print_summary
}

main "$@"

