#!/usr/bin/env bash
# YPanel — Update Frontend Only
set -euo pipefail
: "${SUDO_PASS:?}"
: "${REMOTE_FRONT_DIR:?}"
: "${INSTALL_FRONT_DIR:?}"
: "${PANEL_USER:=root}"
: "${SERVICE_NAME:=ypanel}"

printf '%s\n' "$SUDO_PASS" | sudo -S -p '' bash -c "
  cp -r '$REMOTE_FRONT_DIR/.' '$INSTALL_FRONT_DIR/'
  chown -R $PANEL_USER:$PANEL_USER '$INSTALL_FRONT_DIR/'
  systemctl reload-or-restart $SERVICE_NAME 2>/dev/null || true
"
echo "FRONT_OK"

