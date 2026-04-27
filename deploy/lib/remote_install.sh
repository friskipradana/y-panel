#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# YPanel — Remote Install Script v2
# Di-upload oleh build.ps1 lalu dieksekusi via SSH.
# Semua konfigurasi diterima via environment variables.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── ENV DEFAULTS ──────────────────────────────────────────────────────
: "${SUDO_PASS:?SUDO_PASS env var required}"
: "${INSTALLER_PATH:?INSTALLER_PATH env var required}"
: "${PANEL_BIND_ADDR:=0.0.0.0:8787}"
: "${PANEL_DATABASE_DSN:?PANEL_DATABASE_DSN required}"
: "${PANEL_ENCRYPTION_KEY:?PANEL_ENCRYPTION_KEY required}"
: "${PANEL_STATE_DIR:=/var/lib/ypanel}"
: "${PANEL_FRONTEND_DIR:=/opt/ypanel/frontend}"
: "${ENV_CONTENT_FILE:=}"
: "${LOG_PATH:=/tmp/ypanel-install.log}"

LOG="$LOG_PATH"
: > "$LOG"

# ── HELPER ────────────────────────────────────────────────────────────
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# ── 1. Ensure Go ──────────────────────────────────────────────────────
GO_BIN=/usr/local/go/bin/go
if ! command -v "$GO_BIN" >/dev/null 2>&1; then
  log "Installing Go 1.22..."
  cd /tmp
  wget -q https://go.dev/dl/go1.22.2.linux-amd64.tar.gz
  printf '%s\n' "$SUDO_PASS" | sudo -S -p '' bash -c "rm -rf /usr/local/go; tar -C /usr/local -xzf /tmp/go1.22.2.linux-amd64.tar.gz" >> "$LOG" 2>&1
  printf '%s\n' "$SUDO_PASS" | sudo -S -p '' bash -c "echo 'export PATH=/usr/local/go/bin:\$PATH' > /etc/profile.d/golang.sh; chmod 644 /etc/profile.d/golang.sh" >> "$LOG" 2>&1
  rm -f /tmp/go1.22.2.linux-amd64.tar.gz
fi
export PATH=/usr/local/go/bin:$PATH
GO_VERSION=$($GO_BIN version 2>/dev/null | head -1 || echo 'go ok')
log "Go: $GO_VERSION"

# The uploaded .run already contains the production bundle produced by build.ps1.
# Run it directly so the actual installer log is preserved and failures are easier to diagnose.

# ── 3. Run panel installer ────────────────────────────────────────────
if [ -n "$ENV_CONTENT_FILE" ] && [ -f "$ENV_CONTENT_FILE" ]; then
  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in
      ''|'#'*) continue ;;
      PANEL_BIND_ADDR|PANEL_DATABASE_DSN|PANEL_ENCRYPTION_KEY|PANEL_STATE_DIR|PANEL_FRONTEND_DIR|PANEL_ALLOWED_HOSTS|PANEL_ALLOWED_ORIGINS|PANEL_SESSION_TTL)
        export "${key}=${value}"
        ;;
    esac
  done < "$ENV_CONTENT_FILE"
  log "Loaded installer env from $ENV_CONTENT_FILE"
fi

log "Running panel installer at: $INSTALLER_PATH"
chmod +x "$INSTALLER_PATH"

if ! printf '%s\n' "$SUDO_PASS" | sudo -S -p '' env \
  PANEL_BIND_ADDR="$PANEL_BIND_ADDR" \
  PANEL_DATABASE_DSN="$PANEL_DATABASE_DSN" \
  PANEL_ENCRYPTION_KEY="$PANEL_ENCRYPTION_KEY" \
  PANEL_STATE_DIR="$PANEL_STATE_DIR" \
  PANEL_FRONTEND_DIR="$PANEL_FRONTEND_DIR" \
  PANEL_ALLOWED_HOSTS="${PANEL_ALLOWED_HOSTS:-}" \
  PANEL_ALLOWED_ORIGINS="${PANEL_ALLOWED_ORIGINS:-}" \
  PANEL_SESSION_TTL="${PANEL_SESSION_TTL:-12h}" \
  GOPATH=/tmp/go-ypanel-cache \
  GOCACHE=/tmp/go-ypanel-build-cache \
  bash "$INSTALLER_PATH" >> "$LOG" 2>&1; then
  log "Installer failed. Last log lines:"
  tail -n 120 "$LOG" || true
  exit 1
fi

log "Installer finished successfully"
echo "INSTALLER_OK"

