#!/bin/bash
# ServerPanel Pro — Deploy Script
# Run on: server 100.65.152.14

set -e

PANEL_USER="ui-panel"
PANEL_DIR="/opt/ui-panel"
STATE_DIR="/var/lib/ui-panel"
SERVICE_NAME="ui-panel"
REPO_DIR="/tmp/panel-deploy-$$"
GO_BIN="/usr/local/go/bin/go"

echo "═══════════════════════════════════════════"
echo "  ServerPanel Pro — Deploy Script"
echo "═══════════════════════════════════════════"

# ─── 0. Dependencies ─────────────────────────────────────────────

echo "[1/8] Checking dependencies..."

# PostgreSQL
if ! command -v psql &>/dev/null; then
    echo "  → Installing PostgreSQL..."
    sudo apt-get install -y postgresql postgresql-client
fi

# Go
if ! command -v go &>/dev/null && [ ! -f "$GO_BIN" ]; then
    echo "  → Installing Go 1.22..."
    cd /tmp
    sudo apt-get install -y wget
    wget -q https://go.dev/dl/go1.22.2.linux-amd64.tar.gz
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf go1.22.2.linux-amd64.tar.gz
    echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee /etc/profile.d/golang.sh
    source /etc/profile.d/golang.sh
fi

export PATH=$PATH:/usr/local/go/bin

# Node.js (for frontend build)
if ! command -v node &>/dev/null; then
    echo "  → Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# cloudflared
if ! command -v cloudflared &>/dev/null; then
    echo "  → Installing cloudflared..."
    sudo mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
    sudo apt-get update && sudo apt-get install -y cloudflared
fi

echo "  ✓ Dependencies OK"

# ─── 1. PostgreSQL Setup ─────────────────────────────────────────

echo "[2/8] Setting up PostgreSQL..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create DB user and database if not exists
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='panel_user'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER panel_user WITH PASSWORD 'panel_pass_secure_$(hostname)'"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='serverpanel'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE serverpanel OWNER panel_user"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE serverpanel TO panel_user"

DB_PASS="panel_pass_secure_$(hostname)"
echo "  ✓ PostgreSQL ready (user: panel_user, db: serverpanel)"

# ─── 2. Generate encryption key ──────────────────────────────────

echo "[3/8] Generating encryption key..."
ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "  ✓ Key generated"

# ─── 3. Panel user ────────────────────────────────────────────────

echo "[4/8] Setting up panel system user..."
id "$PANEL_USER" &>/dev/null || sudo useradd -r -s /bin/bash -m -d /home/$PANEL_USER "$PANEL_USER"
sudo mkdir -p "$STATE_DIR" "$PANEL_DIR/frontend"
sudo chown -R "$PANEL_USER:$PANEL_USER" "$STATE_DIR" "$PANEL_DIR"
echo "  ✓ User $PANEL_USER ready"

# ─── 4. Copy source and build backend ────────────────────────────

echo "[5/8] Building Go backend..."
mkdir -p "$REPO_DIR"
# Copy source from current directory (script is run from project root)
cp -r . "$REPO_DIR/"
cd "$REPO_DIR"

# Download deps and build
$GO_BIN mod download
$GO_BIN build -o "$PANEL_DIR/ui-panel-agent" ./cmd/agent/main.go 2>/dev/null || \
    $GO_BIN build -o "$PANEL_DIR/ui-panel-agent" ./main.go

sudo chown "$PANEL_USER:$PANEL_USER" "$PANEL_DIR/ui-panel-agent"
sudo chmod +x "$PANEL_DIR/ui-panel-agent"
echo "  ✓ Backend built"

# ─── 5. Build frontend ────────────────────────────────────────────

echo "[6/8] Building frontend..."
cd "$REPO_DIR"
npm ci --silent
VITE_AGENT_BASE="" npm run build --silent
sudo cp -r dist/. "$PANEL_DIR/frontend/"
sudo chown -R "$PANEL_USER:$PANEL_USER" "$PANEL_DIR/frontend"
echo "  ✓ Frontend built"

# ─── 6. Write .env ────────────────────────────────────────────────

echo "[7/8] Writing environment config..."
sudo tee /etc/ui-panel.env > /dev/null <<ENVFILE
PANEL_BIND_ADDR=0.0.0.0:8787
PANEL_DB_ENABLED=true
PANEL_DATABASE_DSN=postgres://panel_user:${DB_PASS}@127.0.0.1:5432/serverpanel?sslmode=disable
PANEL_ENCRYPTION_KEY=${ENCRYPTION_KEY}
PANEL_STATE_DIR=${STATE_DIR}
PANEL_FRONTEND_DIR=${PANEL_DIR}/frontend
PANEL_SESSION_TTL=12h
ENVFILE

sudo chmod 600 /etc/ui-panel.env
sudo chown "$PANEL_USER:$PANEL_USER" /etc/ui-panel.env
echo "  ✓ Environment configured"

# ─── 7. Systemd service ───────────────────────────────────────────

echo "[8/8] Installing systemd service..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null <<SERVICE
[Unit]
Description=ServerPanel Pro — UI Panel Agent
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${PANEL_USER}
Group=${PANEL_USER}
WorkingDirectory=${STATE_DIR}
EnvironmentFile=/etc/ui-panel.env
ExecStart=${PANEL_DIR}/ui-panel-agent
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ui-panel

# Security hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=${STATE_DIR}

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

# Wait and check
sleep 3
if sudo systemctl is-active "$SERVICE_NAME" --quiet; then
    echo "  ✓ Service running!"
else
    echo "  ✗ Service failed to start. Check: journalctl -u $SERVICE_NAME -n 50"
    sudo journalctl -u "$SERVICE_NAME" -n 30 --no-pager
fi

# Cleanup
rm -rf "$REPO_DIR"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ ServerPanel Pro Deployed!"
echo ""
echo "  URL    : http://$(hostname -I | awk '{print $1}'):8787"
echo "  Login  : admin"
echo "  Pass   : Admin@Panel2024!"
echo ""
echo "  ⚠️  Harap ganti password setelah login pertama!"
echo "═══════════════════════════════════════════"
