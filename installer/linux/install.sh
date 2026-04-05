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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() {
  printf '\n[%s] %s\n' "$APP_NAME" "$1"
}

run_quiet() {
  local logfile="/tmp/${APP_NAME}-install.log"
  if ! "$@" >>"$logfile" 2>&1; then
    printf '\n[%s] ERROR: command gagal. Cek log: %s\n' "$APP_NAME" "$logfile" >&2
    tail -n 40 "$logfile" >&2 || true
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
    *) fail "arsitektur tidak didukung untuk bootstrap Go: $arch" ;;
  esac

  local go_version="1.22.12"
  local archive="go${go_version}.linux-${GO_ARCH}.tar.gz"
  local urls=(
    "https://go.dev/dl/${archive}"
    "https://dl.google.com/go/${archive}"
    "https://storage.googleapis.com/golang/${archive}"
  )

  log "menginstall Go ${go_version}"
  rm -rf /usr/local/go

  local downloaded=0
  for url in "${urls[@]}"; do
    if curl -fsSL "$url" -o "/tmp/${archive}" >/dev/null 2>&1; then
      downloaded=1
      break
    fi
  done

  if [[ "$downloaded" -ne 1 ]]; then
    fail "semua mirror Go gagal diunduh"
  fi

  run_quiet tar -C /usr/local -xzf "/tmp/${archive}"
  export PATH="/usr/local/go/bin:$PATH"
}

collect_input() {
  log "konfigurasi bootstrap panel"

  read -r -p "Bind address panel [${DEFAULT_BIND_ADDR}]: " PANEL_BIND_ADDR
  PANEL_BIND_ADDR="${PANEL_BIND_ADDR:-$DEFAULT_BIND_ADDR}"

  read -r -p "Username admin [admin]: " PANEL_ADMIN_USERNAME
  PANEL_ADMIN_USERNAME="${PANEL_ADMIN_USERNAME:-admin}"

  read -r -s -p "Password admin [otomatis jika kosong]: " PANEL_ADMIN_PASSWORD
  printf '\n'
  if [[ -z "$PANEL_ADMIN_PASSWORD" ]]; then
    PANEL_ADMIN_PASSWORD="$(random_string 20)"
    GENERATED_PASSWORD=1
  else
    GENERATED_PASSWORD=0
  fi

  PANEL_SESSION_SECRET="$(random_string 48)"
  PANEL_INSTALL_CHANNEL="stable"
  PANEL_PORTAINER_URL="$DEFAULT_PORTAINER_URL"
}

prepare_dirs() {
  log "menyiapkan direktori runtime"
  mkdir -p "$INSTALL_ROOT" "$STATE_DIR" "$CONFIG_DIR" "$FRONTEND_DIR"
  chmod 700 "$CONFIG_DIR"
}

build_agent() {
  log "membangun binary Go agent"
  export PATH="/usr/local/go/bin:$PATH"
  cd "$REPO_ROOT"
  run_quiet go mod download
  run_quiet go build -o "$BIN_PATH" ./cmd/panel-agent
  chmod 755 "$BIN_PATH"
}

write_env() {
  log "menulis file konfigurasi $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
PANEL_BIND_ADDR=${PANEL_BIND_ADDR}
PANEL_ADMIN_USERNAME=${PANEL_ADMIN_USERNAME}
PANEL_ADMIN_PASSWORD=${PANEL_ADMIN_PASSWORD}
PANEL_SESSION_SECRET=${PANEL_SESSION_SECRET}
PANEL_STATE_DIR=${STATE_DIR}
PANEL_PORTAINER_URL=${PANEL_PORTAINER_URL}
PANEL_INSTALL_CHANNEL=${PANEL_INSTALL_CHANNEL}
PANEL_FRONTEND_DIR=${FRONTEND_DIR}
EOF
  chmod 600 "$ENV_FILE"
}

build_frontend() {
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
  cp "$REPO_ROOT/installer/linux/ui-panel.service.tpl" "$SERVICE_FILE"
  chmod 644 "$SERVICE_FILE"
  run_quiet systemctl daemon-reload
  run_quiet systemctl enable ui-panel.service
  run_quiet systemctl restart ui-panel.service
}

install_cli() {
  log "menginstall command line ui-panel"
  cat > "$CLI_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/ui-panel/agent.env"
SERVICE_NAME="ui-panel.service"

reset_password() {
  local password
  local escaped_password

  if [[ ! -f "$ENV_FILE" ]]; then
    printf '\nFile konfigurasi tidak ditemukan: %s\n' "$ENV_FILE" >&2
    exit 1
  fi

  read -r -s -p 'Password admin baru: ' password
  printf '\n'

  if [[ -z "$password" ]]; then
    printf '\nPassword tidak boleh kosong.\n' >&2
    exit 1
  fi

  escaped_password="$(printf '%s' "$password" | sed 's/[\\&]/\\&/g')"
  sudo sed -i "s/^PANEL_ADMIN_PASSWORD=.*/PANEL_ADMIN_PASSWORD=${escaped_password}/" "$ENV_FILE"
  sudo systemctl restart "$SERVICE_NAME"
  printf '\nPassword admin berhasil direset dan service direstart.\n'
}

run_action() {
  case "$1" in
    restart)
      sudo systemctl restart ui-panel.service
      printf '\nService berhasil direstart.\n'
      ;;
    stop)
      sudo systemctl stop ui-panel.service
      printf '\nService berhasil dihentikan.\n'
      ;;
    reset-password)
      reset_password
      ;;
    uninstall)
      sudo bash /opt/ui-panel/installer/uninstall.sh
      ;;
    *)
      printf '\nAksi tidak dikenal: %s\n' "$1"
      exit 1
      ;;
  esac
}

show_menu() {
  printf '\nUI Panel Service Manager\n'
  printf '1. Restart Service\n'
  printf '2. Stop Service\n'
  printf '3. Reset Password\n'
  printf '4. Uninstall\n'
  printf '5. Exit\n\n'
  read -r -p 'Pilih opsi [1-5]: ' choice

  case "$choice" in
    1) run_action restart ;;
    2) run_action stop ;;
    3) run_action reset-password ;;
    4) run_action uninstall ;;
    5) exit 0 ;;
    *)
      printf '\nPilihan tidak valid.\n'
      exit 1
      ;;
  esac
}

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

deploy_portainer() {
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
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  host_ip="${host_ip:-127.0.0.1}"

  log "instalasi selesai"
  printf '\nPanel URL      : http://%s\n' "$host_ip:8787"
  printf 'Username       : %s\n' "$PANEL_ADMIN_USERNAME"
  printf 'Password       : %s\n' "$PANEL_ADMIN_PASSWORD"
  printf 'Frontend path  : %s\n' "$FRONTEND_DIR"
  printf 'Portainer      : hanya localhost melalui backend agent\n'
  printf 'CLI command    : ui-panel\n'

  if [[ "$GENERATED_PASSWORD" -eq 1 ]]; then
    printf '\nCatatan: password admin dibuat otomatis. Simpan informasi ini dengan aman.\n'
  fi

  printf '\nPerintah penting:\n'
  printf '  ui-panel\n'
  printf '  systemctl status ui-panel\n'
  printf '  journalctl -u ui-panel -f\n'
}

main() {
  require_root
  detect_pm
  install_base_packages
  ensure_docker
  ensure_go
  collect_input
  prepare_dirs
  build_agent
  build_frontend
  write_env
  install_service
  install_cli
  deploy_portainer
  print_summary
}

main "$@"
