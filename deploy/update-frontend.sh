#!/usr/bin/env bash
# Script ini dijalankan di server remote untuk mengupdate frontend saja
set -euo pipefail

INSTALL_ROOT="/opt/ui-panel"
FRONTEND_DIR="$INSTALL_ROOT/frontend"
TMP_DIR="/tmp/ui-panel-frontend-update"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Error: Script ini harus dijalankan dengan sudo" >&2
  exit 1
fi

echo "[ui-panel] Memulai update frontend..."

if [[ ! -f "$TMP_DIR/dist.zip" ]]; then
  echo "Error: File dist.zip tidak ditemukan di $TMP_DIR" >&2
  exit 1
fi

# Unzip folder dist langsung ke folder temporary
echo "[ui-panel] Mengekstrak file frontend..."
cd "$TMP_DIR"
# Buat folder dist manual jika zip-nya flat (isi langsung index.html dll)
mkdir -p dist_extracted
unzip -o dist.zip -d dist_extracted > /dev/null

# Ganti folder frontend lama dengan yang baru
echo "[ui-panel] Mengganti folder frontend di $FRONTEND_DIR"
rm -rf "$FRONTEND_DIR"
mkdir -p "$FRONTEND_DIR"
cp -R dist_extracted/. "$FRONTEND_DIR/"

# Bersihkan temporary
rm -rf "$TMP_DIR"

echo "[ui-panel] Update frontend selesai! Silakan refresh browser kamu."
