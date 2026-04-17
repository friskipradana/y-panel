#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ServerPanel Pro — Service Configure & Restart Script
# Di-upload oleh build.ps1, dieksekusi via SSH.
# ENV_CONTENT harus dipass via file /tmp/panel_env_content
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
: "${SUDO_PASS:?}"
: "${ENV_FILE:=/etc/ui-panel/agent.env}"
: "${ENV_CONTENT_FILE:=/tmp/panel_env_to_write}"
: "${SERVICE_NAME:=ui-panel}"
: "${PANEL_USER:=ui-panel}"

sudo_exec() { printf '%s\n' "$SUDO_PASS" | sudo -S -p '' bash -c "$*"; }

sudo_exec "mkdir -p $(dirname "$ENV_FILE")"
printf '%s\n' "$SUDO_PASS" | sudo -S -p '' cp "$ENV_CONTENT_FILE" "$ENV_FILE"
sudo_exec "chmod 600 '$ENV_FILE'"
sudo_exec "chown $PANEL_USER:$PANEL_USER '$ENV_FILE' 2>/dev/null || true"
sudo_exec "systemctl daemon-reload"
sudo_exec "systemctl restart $SERVICE_NAME"
sleep 3
if printf '%s\n' "$SUDO_PASS" | sudo -S -p '' systemctl is-active "$SERVICE_NAME" >/dev/null 2>&1; then
  echo "SERVICE_OK"
else
  echo "SERVICE_FAIL"
  printf '%s\n' "$SUDO_PASS" | sudo -S -p '' journalctl -u "$SERVICE_NAME" -n 20 --no-pager 2>/dev/null || true
fi
rm -f "$ENV_CONTENT_FILE"
