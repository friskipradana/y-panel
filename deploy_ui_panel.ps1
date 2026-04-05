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

function ConvertTo-PlainText {
  param([Security.SecureString]$SecureValue)

  if ($null -eq $SecureValue) {
    return ''
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Read-RequiredSecret {
  param([string]$PromptMessage)

  while ($true) {
    $secureValue = Read-Host $PromptMessage -AsSecureString
    $plainValue = ConvertTo-PlainText $secureValue

    if (-not [string]::IsNullOrWhiteSpace($plainValue)) {
      return $plainValue
    }

    Write-Host 'Password tidak boleh kosong. Silakan coba lagi.' -ForegroundColor Yellow
  }
}

function Get-PortFromBindAddress {
  param([string]$Value)

  if ($Value -match ':(\d+)$') {
    return $matches[1]
  }

  return '8787'
}

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TmpDir = Join-Path $ProjectRoot 'tmp'
$ArchivePath = Join-Path $TmpDir 'ui-panel-deploy.tar.gz'
$RemoteTarget = "$SshUser@$HostName"
$PanelPort = '8787'

Require-Command ssh
Require-Command scp
Require-Command tar
Require-Command npm

if (-not (Test-Path $TmpDir)) {
  New-Item -ItemType Directory -Path $TmpDir | Out-Null
}

$SudoPassword = $null
if ([string]::IsNullOrWhiteSpace($SshPassword)) {
  $SudoPassword = Read-RequiredSecret 'Masukkan password sudo server'
}
else {
  $SudoPassword = $SshPassword
}

try {
  Write-Step 'Build frontend production'
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw 'Build frontend gagal.'
  }

  Write-Step 'Buat archive project'
  if (Test-Path $ArchivePath) {
    Remove-Item $ArchivePath -Force
  }

  Push-Location $ProjectRoot
  try {
    & tar -czf $ArchivePath --exclude=node_modules --exclude=.git --exclude=tmp .
    if ($LASTEXITCODE -ne 0) {
      throw 'Gagal membuat archive deploy.'
    }
  }
  finally {
    Pop-Location
  }

  Write-Step 'Siapkan direktori remote'
  & ssh $RemoteTarget "mkdir -p $RemoteBaseDir && cd $RemoteBaseDir && pwd"
  if ($LASTEXITCODE -ne 0) {
    throw 'Gagal membuat direktori remote.'
  }
  $ResolvedRemoteBaseDir = ((& ssh $RemoteTarget "cd $RemoteBaseDir && pwd") | Select-Object -Last 1).Trim()
  if ([string]::IsNullOrWhiteSpace($ResolvedRemoteBaseDir)) {
    throw 'Gagal me-resolve path remote deploy directory.'
  }

  $RemoteReleaseDir = "$ResolvedRemoteBaseDir/ui-panel"
  $RemoteArchivePath = "$ResolvedRemoteBaseDir/ui-panel-deploy.tar.gz"

  Write-Step 'Ambil konfigurasi panel lama jika ada'
  $ExistingEnvRaw = (& ssh $RemoteTarget "printf '%s
' '$($SudoPassword.Replace("'", "'\''"))' | sudo -S cat /etc/ui-panel/agent.env 2>/dev/null || true")
  $ExistingEnv = @{}
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
  if ([string]::IsNullOrWhiteSpace($BindAddress)) {
    $BindAddress = '0.0.0.0:8787'
  }
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

  Write-Step 'Upload archive ke server'
  & scp $ArchivePath "${RemoteTarget}:$RemoteArchivePath"
  if ($LASTEXITCODE -ne 0) {
    throw 'Gagal upload archive ke server.'
  }

  Write-Step 'Extract dan update ui-panel di server'

  $escapedRemoteBase = $ResolvedRemoteBaseDir.Replace("'", "'\''")
  $escapedRemoteRelease = $RemoteReleaseDir.Replace("'", "'\''")
  $escapedRemoteArchive = $RemoteArchivePath.Replace("'", "'\''")
  $escapedSudo = $SudoPassword.Replace("'", "'\''")
  $escapedBind = $BindAddress.Replace("'", "'\''")
  $escapedAdmin = $AdminUsername.Replace("'", "'\''")
  $escapedPanelPassword = $AdminPassword.Replace("'", "'\''")
  $escapedAllowedHosts = (($AllowedHosts -join ',').Replace("'", "'\''"))
  $escapedAllowedOrigins = (($AllowedOrigins -join ',').Replace("'", "'\''"))

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

PANEL_BIND="`$DEFAULT_BIND"
PANEL_USER="`$DEFAULT_ADMIN"
PANEL_PASS="`$DEFAULT_PASSWORD"
PANEL_ALLOWED_HOSTS="`$DEFAULT_ALLOWED_HOSTS"
PANEL_ALLOWED_ORIGINS="`$DEFAULT_ALLOWED_ORIGINS"
ENV_FILE='/etc/ui-panel/agent.env'

printf '%s\n%s\n%s\n%s\n' "`$SUDO_PASSWORD" "`$PANEL_BIND" "`$PANEL_USER" "`$PANEL_PASS" | sudo -S bash installer/linux/install.sh
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S bash -lc "grep -q '^PANEL_ALLOWED_HOSTS=' \"`$ENV_FILE\" && sed -i \"s#^PANEL_ALLOWED_HOSTS=.*#PANEL_ALLOWED_HOSTS=`$PANEL_ALLOWED_HOSTS#\" \"`$ENV_FILE\" || echo \"PANEL_ALLOWED_HOSTS=`$PANEL_ALLOWED_HOSTS\" >> \"`$ENV_FILE\""
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S bash -lc "grep -q '^PANEL_ALLOWED_ORIGINS=' \"`$ENV_FILE\" && sed -i \"s#^PANEL_ALLOWED_ORIGINS=.*#PANEL_ALLOWED_ORIGINS=`$PANEL_ALLOWED_ORIGINS#\" \"`$ENV_FILE\" || echo \"PANEL_ALLOWED_ORIGINS=`$PANEL_ALLOWED_ORIGINS\" >> \"`$ENV_FILE\""
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S systemctl restart ui-panel.service
sleep 2
curl -fsS "http://127.0.0.1:`$PANEL_PORT/healthz"
"@


  $remoteScriptPath = Join-Path $TmpDir 'deploy_remote.sh'
  $remoteScriptUnix = ($remoteScript -replace "`r`n", "`n")
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($remoteScriptPath, $remoteScriptUnix, $utf8NoBom)

  try {
    & scp $remoteScriptPath "${RemoteTarget}:$ResolvedRemoteBaseDir/deploy_remote.sh"
    if ($LASTEXITCODE -ne 0) {
      throw 'Gagal upload script remote deploy.'
    }

    & ssh $RemoteTarget "bash $ResolvedRemoteBaseDir/deploy_remote.sh"
    if ($LASTEXITCODE -ne 0) {
      throw 'Deploy remote gagal.'
    }
  }
  finally {
    Remove-Item $remoteScriptPath -Force -ErrorAction SilentlyContinue
  }

  Write-Step 'Deploy selesai'
  Write-Host "Panel berhasil diupdate di $RemoteTarget" -ForegroundColor Green
  Write-Host "URL panel: http://${HostName}:$PanelPort" -ForegroundColor Green
}
finally {
  $SudoPassword = $null
}
