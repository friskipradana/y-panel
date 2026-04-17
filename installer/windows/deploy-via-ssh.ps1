#!/usr/bin/env pwsh
# Deploy ServerPanel Pro via plink (PuTTY)
# Usage: .\deploy-via-ssh.ps1

$server = "100.65.152.14"
$user = "renaldi"
$pass = "Renaldi123!@#"
$plink = "C:\Program Files\PuTTY\plink.exe"
$pscp = "C:\Program Files\PuTTY\pscp.exe"
$projectRoot = "e:\Pekerjaan\Programing\React\homeserver-desktop"

function Invoke-SSH {
    param([string]$cmd)
    Write-Host "> $cmd" -ForegroundColor Cyan
    $result = & $plink -batch -ssh -pw $pass "${user}@${server}" $cmd 2>&1
    Write-Host $result
    return $result
}

Write-Host "═══════════════════════════════════════" -ForegroundColor Yellow
Write-Host "  ServerPanel Pro — Remote Deploy" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════" -ForegroundColor Yellow

# 1. Test connection
Write-Host "`n[1/6] Testing SSH connection..." -ForegroundColor Green
$test = & $plink -batch -ssh -pw $pass "${user}@${server}" "echo OK && uname -a" 2>&1
Write-Host $test
if ($test -notmatch "OK") {
    Write-Host "SSH connection failed!" -ForegroundColor Red
    exit 1
}

# 2. Check server state
Write-Host "`n[2/6] Checking server state..." -ForegroundColor Green
Invoke-SSH "systemctl status ui-panel --no-pager -l | head -20 2>/dev/null || echo 'Service not found'"
Invoke-SSH "which go 2>/dev/null || ls /usr/local/go/bin/go 2>/dev/null || echo 'Go not installed'"
Invoke-SSH "postgresql --version 2>/dev/null || pg_lsclusters 2>/dev/null | head -3 || echo 'PostgreSQL check'"

# 3. Install dependencies on server
Write-Host "`n[3/6] Installing server dependencies..." -ForegroundColor Green
$installScript = @'
export DEBIAN_FRONTEND=noninteractive

# PostgreSQL
if ! command -v psql &>/dev/null; then
  echo "Installing PostgreSQL..."
  sudo apt-get update -q
  sudo apt-get install -y -q postgresql postgresql-client
fi

# Go
if ! command -v /usr/local/go/bin/go &>/dev/null; then
  echo "Installing Go 1.22..."
  cd /tmp
  wget -q https://go.dev/dl/go1.22.2.linux-amd64.tar.gz
  sudo rm -rf /usr/local/go
  sudo tar -C /usr/local -xzf go1.22.2.linux-amd64.tar.gz
  echo "Go installed"
fi

# Node.js
if ! command -v node &>/dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
  sudo apt-get install -y -q nodejs
fi

echo "ALL DONE: $(which psql) | $(/usr/local/go/bin/go version) | $(node --version)"
'@
& $plink -batch -ssh -pw $pass "${user}@${server}" $installScript

# 4. Setup PostgreSQL
Write-Host "`n[4/6] Setting up PostgreSQL..." -ForegroundColor Green
$pgScript = @'
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create user
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'panel_user') THEN CREATE USER panel_user WITH PASSWORD 'PanelPass2024A'; END IF; END \$\$;"

# Create database
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='serverpanel'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE serverpanel OWNER panel_user"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE serverpanel TO panel_user" 2>/dev/null

echo "PostgreSQL ready. DB: serverpanel, User: panel_user"
'@
& $plink -batch -ssh -pw $pass "${user}@${server}" $pgScript

# 5. Create env file
Write-Host "`n[5/6] Writing environment config..." -ForegroundColor Green
$encKey = -join ((1..64) | ForEach-Object { "{0:x}" -f (Get-Random -Max 16) })
$envContent = @"
PANEL_BIND_ADDR=0.0.0.0:8787
PANEL_DB_ENABLED=true
PANEL_DATABASE_DSN=postgres://panel_user:PanelPass2024A@127.0.0.1:5432/serverpanel?sslmode=disable
PANEL_ENCRYPTION_KEY=$encKey
PANEL_BOOTSTRAP_USERNAME=admin
PANEL_BOOTSTRAP_EMAIL=admin@panel.local
PANEL_BOOTSTRAP_PASSWORD=Admin@Panel2024!
PANEL_STATE_DIR=/var/lib/ui-panel
PANEL_FRONTEND_DIR=/opt/ui-panel/frontend
PANEL_SESSION_TTL=12h
"@

# Write env via heredoc
$envCmd = "sudo mkdir -p /opt/ui-panel /var/lib/ui-panel && cat > /tmp/panel.env << 'ENVEOF'`n$envContent`nENVEOF`nsudo mv /tmp/panel.env /etc/ui-panel.env && sudo chmod 600 /etc/ui-panel.env && echo 'Env written OK'"
& $plink -batch -ssh -pw $pass "${user}@${server}" $envCmd

# 6. Transfer and build
Write-Host "`n[6/6] Transferring source and building..." -ForegroundColor Green

# Create tarball of Go source (excluding node_modules and dist)
Write-Host "Creating source tarball..." -ForegroundColor Cyan
$tarball = "$env:TEMP\panel-src.tar.gz"
Push-Location $projectRoot
tar --exclude='./node_modules' --exclude='./.git' --exclude='./dist' -czf $tarball . 2>$null
if (-not $?) {
    # Fallback: use 7zip or just copy key files
    Write-Host "tar failed, trying alternative..." -ForegroundColor Yellow
    Compress-Archive -Path "$projectRoot\internal","$projectRoot\go.mod","$projectRoot\go.sum","$projectRoot\main.go" -DestinationPath "$env:TEMP\panel-src.zip" -Force 2>$null
}
Pop-Location
Write-Host "Tarball created: $tarball" -ForegroundColor Green

# Transfer via pscp
Write-Host "Uploading source..." -ForegroundColor Cyan
& $pscp -pw $pass -q $tarball "${user}@${server}:/tmp/panel-src.tar.gz"

# Build on server
$buildScript = @'
export PATH=$PATH:/usr/local/go/bin
cd /tmp
rm -rf panel-src
mkdir panel-src && cd panel-src
tar -xzf /tmp/panel-src.tar.gz

echo "Building Go backend..."
go mod download 2>/dev/null
go build -o /tmp/ui-panel-agent . 2>&1 || go build -o /tmp/ui-panel-agent ./main.go 2>&1 || echo "BUILD FAILED"

if [ -f /tmp/ui-panel-agent ]; then
  echo "Build success!"
  sudo mv /tmp/ui-panel-agent /opt/ui-panel/ui-panel-agent
  sudo chmod +x /opt/ui-panel/ui-panel-agent
  sudo chown $(whoami):$(whoami) /opt/ui-panel/ui-panel-agent
else
  echo "ERROR: Build failed"
fi

cd /tmp && rm -rf panel-src panel-src.tar.gz
'@
& $plink -batch -ssh -pw $pass "${user}@${server}" $buildScript

# Update systemd service
$serviceScript = @'
sudo tee /etc/systemd/system/ui-panel.service > /dev/null << 'EOF'
[Unit]
Description=ServerPanel Pro
After=network.target postgresql.service

[Service]
Type=simple
User=ui-panel
Group=ui-panel
WorkingDirectory=/var/lib/ui-panel
EnvironmentFile=/etc/ui-panel.env
ExecStart=/opt/ui-panel/ui-panel-agent
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ui-panel

[Install]
WantedBy=multi-user.target
EOF

# Create panel user if missing
id ui-panel 2>/dev/null || sudo useradd -r -s /bin/bash -m ui-panel
sudo mkdir -p /opt/ui-panel /var/lib/ui-panel
sudo chown -R ui-panel:ui-panel /opt/ui-panel /var/lib/ui-panel 2>/dev/null || true
sudo chown ui-panel:ui-panel /opt/ui-panel/ui-panel-agent 2>/dev/null || true

sudo systemctl daemon-reload
sudo systemctl enable ui-panel
sudo systemctl restart ui-panel
sleep 3
sudo systemctl status ui-panel --no-pager | head -20
echo "Service restart done. Healthcheck:"
curl -s http://127.0.0.1:8787/healthz || echo "Healthcheck failed"
'@
& $plink -batch -ssh -pw $pass "${user}@${server}" $serviceScript

Write-Host "`n═══════════════════════════════════════" -ForegroundColor Yellow
Write-Host " Deploy selesai!" -ForegroundColor Green
Write-Host " URL : http://${server}:8787" -ForegroundColor Cyan
Write-Host " Login: admin / Admin@Panel2024!" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor Yellow
