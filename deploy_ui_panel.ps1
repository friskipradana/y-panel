param(
  [string]$HostName = 'node1-ubuntu.taile0346b.ts.net',
  [string]$SshUser = 'renaldi',
  [string]$SshPassword = '',
  [string]$RemoteBaseDir = '~/ui-panel-deploy',
  [string]$BindAddress = '',
  [string]$AdminUsername = 'admin',
  [string]$AdminPassword = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' tidak ditemukan di PATH."
  }
}

function Get-PortFromBindAddress {
  param([string]$Value)
  if ($Value -match ':(\d+)$') {
    return $matches[1]
  }
  return '8787'
}

# ── Pastikan Posh-SSH tersedia ────────────────────────────────────────────────
if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
  Write-Host "Menginstall modul Posh-SSH (diperlukan untuk deploy)..." -ForegroundColor Yellow
  # Pastikan NuGet provider tersedia tanpa prompt interaktif
  if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue | Where-Object { $_.Version -ge '2.8.5.201' })) {
    Write-Host "Menginstall NuGet provider..." -ForegroundColor Yellow
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
  }
  Install-Module -Name Posh-SSH -Scope CurrentUser -Force -AllowClobber -Repository PSGallery
  Write-Host "Posh-SSH berhasil diinstall." -ForegroundColor Green
}
Import-Module Posh-SSH -ErrorAction Stop

# ── Pastikan npm & tar tersedia ───────────────────────────────────────────────
Require-Command npm
Require-Command tar

$ProjectRoot  = Split-Path -Parent $MyInvocation.MyCommand.Path
$TmpDir       = Join-Path $ProjectRoot 'tmp'
$ArchivePath  = Join-Path $TmpDir 'ui-panel-deploy.tar.gz'
$PanelPort    = '8787'

if (-not (Test-Path $TmpDir)) {
  New-Item -ItemType Directory -Path $TmpDir | Out-Null
}

# ── Minta password jika belum diisi ──────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($SshPassword)) {
  $secPwd     = Read-Host 'Masukkan password SSH/sudo server' -AsSecureString
  $bstr       = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPwd)
  $SshPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$SudoPassword = $SshPassword   # password SSH = password sudo user

try {
  # ── Build frontend ──────────────────────────────────────────────────────────
  Write-Step 'Build frontend production'
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Build frontend gagal.' }

  # ── Buat archive ────────────────────────────────────────────────────────────
  Write-Step 'Buat archive project'
  if (Test-Path $ArchivePath) { Remove-Item $ArchivePath -Force }

  Push-Location $ProjectRoot
  try {
    & tar -czf $ArchivePath --exclude=node_modules --exclude=.git --exclude=tmp .
    if ($LASTEXITCODE -ne 0) { throw 'Gagal membuat archive deploy.' }
  }
  finally { Pop-Location }

  # ── Buka koneksi SSH ────────────────────────────────────────────────────────
  Write-Step 'Membuka koneksi SSH ke server'
  $securePass = ConvertTo-SecureString $SshPassword -AsPlainText -Force
  $credential = New-Object System.Management.Automation.PSCredential($SshUser, $securePass)

  # Terima host key secara otomatis (bypass fingerprint prompt)
  $session = New-SSHSession -ComputerName $HostName -Credential $credential -AcceptKey -Force
  if (-not $session) { throw 'Gagal membuka koneksi SSH.' }
  $sessionId = $session.SessionId

  function Invoke-Remote {
    param([string]$Cmd)
    $result = Invoke-SSHCommand -SessionId $sessionId -Command $Cmd -TimeOut 600
    if ($result.ExitStatus -ne 0) {
      Write-Host $result.Output   -ForegroundColor Red
      Write-Host $result.Error    -ForegroundColor Red
      throw "Remote command gagal (exit $($result.ExitStatus)): $Cmd"
    }
    return $result.Output
  }

  # ── Siapkan direktori remote ────────────────────────────────────────────────
  Write-Step 'Siapkan direktori remote'
  $resolvedLines = Invoke-Remote "mkdir -p $RemoteBaseDir && cd $RemoteBaseDir && pwd"
  $ResolvedRemoteBaseDir = ($resolvedLines | Select-Object -Last 1).Trim()
  if ([string]::IsNullOrWhiteSpace($ResolvedRemoteBaseDir)) {
    throw 'Gagal me-resolve path remote deploy directory.'
  }

  $RemoteReleaseDir  = "$ResolvedRemoteBaseDir/ui-panel"
  $RemoteArchivePath = "$ResolvedRemoteBaseDir/ui-panel-deploy.tar.gz"

  # ── Baca konfigurasi panel lama jika ada ───────────────────────────────────
  Write-Step 'Ambil konfigurasi panel lama jika ada'
  $escapedSudo     = $SudoPassword.Replace("'", "'\\''")
  $ExistingEnvRaw  = Invoke-Remote "printf '%s\n' '$escapedSudo' | sudo -S cat /etc/ui-panel/agent.env 2>/dev/null || true"
  $ExistingEnv     = @{}
  foreach ($line in $ExistingEnvRaw) {
    if ($line -match '^(?<key>[A-Z0-9_]+)=(?<value>.*)$') {
      $ExistingEnv[$matches.key] = $matches.value
    }
  }

  if ([string]::IsNullOrWhiteSpace($AdminPassword) -and $ExistingEnv.ContainsKey('PANEL_ADMIN_PASSWORD')) {
    $AdminPassword = $ExistingEnv['PANEL_ADMIN_PASSWORD']
  }
  if ([string]::IsNullOrWhiteSpace($AdminUsername) -and $ExistingEnv.ContainsKey('PANEL_ADMIN_USERNAME')) {
    $AdminUsername = $ExistingEnv['PANEL_ADMIN_USERNAME']
  }
  if ([string]::IsNullOrWhiteSpace($BindAddress) -and $ExistingEnv.ContainsKey('PANEL_BIND_ADDR')) {
    $BindAddress = $ExistingEnv['PANEL_BIND_ADDR']
  }
  if ([string]::IsNullOrWhiteSpace($BindAddress)) { $BindAddress = '0.0.0.0:8787' }
  $PanelPort = Get-PortFromBindAddress $BindAddress

  $AllowedHosts = @()
  if ($ExistingEnv.ContainsKey('PANEL_ALLOWED_HOSTS') -and -not [string]::IsNullOrWhiteSpace($ExistingEnv['PANEL_ALLOWED_HOSTS'])) {
    $AllowedHosts += ($ExistingEnv['PANEL_ALLOWED_HOSTS'] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }
  else {
    $AllowedHosts += @('localhost', '127.0.0.1', $HostName)
  }
  $AllowedHosts = $AllowedHosts | Select-Object -Unique

  $AllowedOrigins = @()
  if ($ExistingEnv.ContainsKey('PANEL_ALLOWED_ORIGINS') -and -not [string]::IsNullOrWhiteSpace($ExistingEnv['PANEL_ALLOWED_ORIGINS'])) {
    $AllowedOrigins += ($ExistingEnv['PANEL_ALLOWED_ORIGINS'] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }
  else {
    $AllowedOrigins += @(
      "http://127.0.0.1:$PanelPort",
      "http://localhost:$PanelPort",
      "http://${HostName}:$PanelPort"
    )
  }
  $AllowedOrigins = $AllowedOrigins | Select-Object -Unique

  # ── Upload archive via SCP ──────────────────────────────────────────────────
  Write-Step 'Upload archive ke server'
  Set-SCPItem -ComputerName $HostName -Credential $credential -Path $ArchivePath -Destination $ResolvedRemoteBaseDir -AcceptKey -Force
  Write-Host "Archive berhasil diupload." -ForegroundColor Green

  # ── Buat dan upload remote deploy script ────────────────────────────────────
  Write-Step 'Extract dan update ui-panel di server'

  $escapedRemoteBase    = $ResolvedRemoteBaseDir.Replace("'", "'\\''")
  $escapedRemoteRelease = $RemoteReleaseDir.Replace("'", "'\\''")
  $escapedRemoteArchive = $RemoteArchivePath.Replace("'", "'\\''")
  $escapedBind          = $BindAddress.Replace("'", "'\\''")
  $escapedAdmin         = $AdminUsername.Replace("'", "'\\''")
  $escapedPanelPassword = $AdminPassword.Replace("'", "'\\''")
  $escapedAllowedHosts  = ($AllowedHosts -join ',').Replace("'", "'\\''")
  $escapedAllowedOrigins = ($AllowedOrigins -join ',').Replace("'", "'\\''")

  $remoteScript = @"
set -euo pipefail
REMOTE_BASE_DIR='$escapedRemoteBase'
REMOTE_RELEASE_DIR='$escapedRemoteRelease'
REMOTE_ARCHIVE_PATH='$escapedRemoteArchive'
DEFAULT_BIND='$escapedBind'
DEFAULT_ADMIN='$escapedAdmin'
DEFAULT_PASSWORD='$escapedPanelPassword'
DEFAULT_ALLOWED_HOSTS='$escapedAllowedHosts'
DEFAULT_ALLOWED_ORIGINS='$escapedAllowedOrigins'
SUDO_PASSWORD='$escapedSudo'
PANEL_PORT='$PanelPort'

mkdir -p "`$REMOTE_BASE_DIR"
rm -rf "`$REMOTE_RELEASE_DIR"
mkdir -p "`$REMOTE_RELEASE_DIR"
tar -xzf "`$REMOTE_ARCHIVE_PATH" -C "`$REMOTE_RELEASE_DIR"
cd "`$REMOTE_RELEASE_DIR"
find installer -type f \( -name '*.sh' -o -name '*.service.tpl' \) -exec sed -i 's/\r$//' {} +
chmod +x installer/linux/install.sh
chmod +x installer/linux/uninstall.sh

ENV_FILE='/etc/ui-panel/agent.env'

printf '%s\n' "`$SUDO_PASSWORD" | sudo -S bash -c "export PANEL_BIND_ADDR='`$DEFAULT_BIND'; export PANEL_ADMIN_USERNAME='`$DEFAULT_ADMIN'; export PANEL_ADMIN_PASSWORD='`$DEFAULT_PASSWORD'; bash installer/linux/install.sh"
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S bash -lc "grep -q '^PANEL_ALLOWED_HOSTS=' \"`$ENV_FILE\" && sed -i \"s#^PANEL_ALLOWED_HOSTS=.*#PANEL_ALLOWED_HOSTS=`$DEFAULT_ALLOWED_HOSTS#\" \"`$ENV_FILE\" || echo \"PANEL_ALLOWED_HOSTS=`$DEFAULT_ALLOWED_HOSTS\" >> \"`$ENV_FILE\""
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S bash -lc "grep -q '^PANEL_ALLOWED_ORIGINS=' \"`$ENV_FILE\" && sed -i \"s#^PANEL_ALLOWED_ORIGINS=.*#PANEL_ALLOWED_ORIGINS=`$DEFAULT_ALLOWED_ORIGINS#\" \"`$ENV_FILE\" || echo \"PANEL_ALLOWED_ORIGINS=`$DEFAULT_ALLOWED_ORIGINS\" >> \"`$ENV_FILE\""
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S systemctl restart ui-panel.service
sleep 2
curl -fsS "http://127.0.0.1:`$PANEL_PORT/healthz"
"@

  $remoteScriptPath = Join-Path $TmpDir 'deploy_remote.sh'
  $remoteScriptUnix = ($remoteScript -replace "`r`n", "`n")
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($remoteScriptPath, $remoteScriptUnix, $utf8NoBom)

  try {
    Set-SCPItem -ComputerName $HostName -Credential $credential -Path $remoteScriptPath -Destination $ResolvedRemoteBaseDir -AcceptKey -Force
    Invoke-Remote "bash $ResolvedRemoteBaseDir/deploy_remote.sh"
  }
  finally {
    Remove-Item $remoteScriptPath -Force -ErrorAction SilentlyContinue
    Invoke-Remote "rm -f $ResolvedRemoteBaseDir/deploy_remote.sh" | Out-Null
  }

  Write-Step 'Deploy selesai'
  Write-Host "Panel berhasil diupdate di ${SshUser}@${HostName}" -ForegroundColor Green
  Write-Host "URL panel: http://${HostName}:$PanelPort" -ForegroundColor Green
}
finally {
  # Tutup sesi SSH
  if (Get-SSHSession -ErrorAction SilentlyContinue | Where-Object { $_.Connected }) {
    Remove-SSHSession -SessionId (Get-SSHSession).SessionId -ErrorAction SilentlyContinue | Out-Null
  }
  $SudoPassword = $null
}
