#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ServerPanel Pro — PostgreSQL Setup Script
# Di-upload oleh build.ps1, dieksekusi via SSH.
# Output: PG_READY dan DSN di stdout
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail
: "${SUDO_PASS:?}"
: "${PG_USER:=panel_user}"
: "${PG_DBNAME:=serverpanel}"
: "${PG_PASS:?}"

sudo_exec() { printf '%s\n' "$SUDO_PASS" | sudo -S -p '' bash -c "$*"; }

export DEBIAN_FRONTEND=noninteractive

# Install if missing
if ! command -v psql >/dev/null 2>&1; then
  sudo_exec "apt-get update -qq 2>/dev/null"
  sudo_exec "apt-get install -y -qq postgresql postgresql-client 2>/dev/null"
fi

sudo_exec "systemctl start postgresql"
sudo_exec "systemctl enable postgresql"

# Create role if not exists, then always sync password
sudo_exec "sudo -u postgres psql -c \"DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$PG_USER') THEN CREATE USER $PG_USER WITH PASSWORD '$PG_PASS'; END IF; END \\\$\\\$;\""
sudo_exec "sudo -u postgres psql -c \"ALTER USER $PG_USER WITH PASSWORD '$PG_PASS';\""

# Create database if not exists
sudo_exec "sudo -u postgres psql -tc \"SELECT 1 FROM pg_database WHERE datname='$PG_DBNAME'\" | grep -q 1 || sudo -u postgres psql -c 'CREATE DATABASE $PG_DBNAME OWNER $PG_USER'"
sudo_exec "sudo -u postgres psql -c 'ALTER DATABASE $PG_DBNAME OWNER TO $PG_USER' 2>/dev/null || true"
sudo_exec "sudo -u postgres psql -c 'GRANT ALL PRIVILEGES ON DATABASE $PG_DBNAME TO $PG_USER' 2>/dev/null || true"

echo "PG_READY"
echo "DSN=postgres://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DBNAME}?sslmode=disable"
