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

# ── 2. Fix go.sum — jalankan go mod download di copy temp source ──────
# Installer .run akan extract dan build ulang, jadi kita perlu
# patch go.sum sebelum installer dijalankan.
# Caranya: extract installer, cd ke backend, go mod tidy, repack.

WORK=$(mktemp -d /tmp/ypanel-preflight.XXXXXX)
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

log "Pre-flight: extracting installer for go mod tidy..."
cp "$INSTALLER_PATH" "$WORK/installer.run"
chmod +x "$WORK/installer.run"

# Extract payload dari .run (base64 setelah marker __ARCHIVE__)
mkdir -p "$WORK/payload"
awk 'found{print}/^__ARCHIVE__$/{found=1;next}' "$WORK/installer.run" | base64 -d > "$WORK/payload.tar.gz" 2>/dev/null || {
  log "Warning: could not extract payload (old format), trying self-extraction..."
  # For old format that uses __ARCHIVE_BELOW__
  awk 'found{print}/^__ARCHIVE_BELOW__$/{found=1;next}' "$WORK/installer.run" | base64 -d > "$WORK/payload.tar.gz" 2>/dev/null || true
}

if [ -f "$WORK/payload.tar.gz" ] && [ -s "$WORK/payload.tar.gz" ]; then
  tar -xzf "$WORK/payload.tar.gz" -C "$WORK/payload" 2>/dev/null || true

  # Find go.mod (could be in backend/ or root)
  GOMOD_DIR=""
  if [ -f "$WORK/payload/backend/go.mod" ]; then
    GOMOD_DIR="$WORK/payload/backend"
  elif [ -f "$WORK/payload/go.mod" ]; then
    GOMOD_DIR="$WORK/payload"
  fi

  if [ -n "$GOMOD_DIR" ]; then
    log "Running go mod download in $GOMOD_DIR..."
    export GOPATH=/tmp/go-ypanel-cache
    export GOCACHE=/tmp/go-ypanel-build-cache
    cd "$GOMOD_DIR"
    $GO_BIN mod download 2>> "$LOG" || true
    $GO_BIN mod tidy 2>> "$LOG" || true
    cd /tmp
    
    # Repack with updated go.sum
    log "Repacking installer with updated go.sum..."
    STUB_LINES=$(awk '/^__ARCHIVE__|^__ARCHIVE_BELOW__$/{print NR; exit}' "$WORK/installer.run")
    head -n "$STUB_LINES" "$WORK/installer.run" > "$WORK/installer_new.run"
    BACK_SUBDIR=$(basename "$GOMOD_DIR")
    
    # Repack payload with new go.sum
    cd "$WORK/payload"
    tar -czf "$WORK/new_payload.tar.gz" .
    base64 "$WORK/new_payload.tar.gz" >> "$WORK/installer_new.run"
    chmod +x "$WORK/installer_new.run"
    
    # Replace original installer
    cp "$WORK/installer_new.run" "$INSTALLER_PATH"
    log "Installer repacked with updated go.sum"
  else
    log "Warning: go.mod not found in payload, skipping pre-flight mod update"
  fi
else
  log "Warning: could not extract payload for pre-flight. Proceeding anyway..."
fi

# ── 3. Run panel installer ────────────────────────────────────────────
log "Running panel installer at: $INSTALLER_PATH"
chmod +x "$INSTALLER_PATH"

printf '%s\n' "$SUDO_PASS" | sudo -S -p '' env \
  PANEL_BIND_ADDR="$PANEL_BIND_ADDR" \
  PANEL_DATABASE_DSN="$PANEL_DATABASE_DSN" \
  PANEL_ENCRYPTION_KEY="$PANEL_ENCRYPTION_KEY" \
  PANEL_STATE_DIR="$PANEL_STATE_DIR" \
  PANEL_FRONTEND_DIR="$PANEL_FRONTEND_DIR" \
  GOPATH=/tmp/go-ypanel-cache \
  GOCACHE=/tmp/go-ypanel-build-cache \
  bash "$INSTALLER_PATH" >> "$LOG" 2>&1

log "Installer finished successfully"
echo "INSTALLER_OK"

