param(
  [string]$HostName = 'node1-ubuntu.taile0346b.ts.net',
  [string]$SshUser = 'renaldi',
  [string]$RemoteBaseDir = '~/ui-panel-deploy',
  [string]$BindAddress = '0.0.0.0:8787',
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
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TmpDir = Join-Path $ProjectRoot 'tmp'
$ArchivePath = Join-Path $TmpDir 'ui-panel-deploy.tar.gz'
$RemoteTarget = "$SshUser@$HostName"

Require-Command ssh
Require-Command scp
Require-Command tar
Require-Command npm

if (-not (Test-Path $TmpDir)) {
  New-Item -ItemType Directory -Path $TmpDir | Out-Null
}

$secureSudoPassword = Read-Host 'Masukkan password sudo server' -AsSecureString
$SudoPassword = ConvertTo-PlainText $secureSudoPassword

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

  $remoteScript = @"
set -euo pipefail
REMOTE_BASE_DIR='$escapedRemoteBase'
REMOTE_RELEASE_DIR='$escapedRemoteRelease'
REMOTE_ARCHIVE_PATH='$escapedRemoteArchive'
DEFAULT_BIND='$escapedBind'
DEFAULT_ADMIN='$escapedAdmin'
DEFAULT_PASSWORD='$escapedPanelPassword'
SUDO_PASSWORD='$escapedSudo'

mkdir -p "`$REMOTE_BASE_DIR"
rm -rf "`$REMOTE_RELEASE_DIR"
mkdir -p "`$REMOTE_RELEASE_DIR"
tar -xzf "`$REMOTE_ARCHIVE_PATH" -C "`$REMOTE_RELEASE_DIR"
cd "`$REMOTE_RELEASE_DIR"
chmod +x installer/linux/install.sh

PANEL_BIND="`$DEFAULT_BIND"
PANEL_USER="`$DEFAULT_ADMIN"
PANEL_PASS="`$DEFAULT_PASSWORD"

printf '%s\n%s\n%s\n%s\n' "`$SUDO_PASSWORD" "`$PANEL_BIND" "`$PANEL_USER" "`$PANEL_PASS" | sudo -S bash installer/linux/install.sh
sleep 2
curl -fsS http://127.0.0.1:8787/healthz
"@


  $remoteScriptPath = Join-Path $TmpDir 'deploy_remote.sh'
  Set-Content -Path $remoteScriptPath -Value $remoteScript -NoNewline

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
  Write-Host "URL panel: http://${HostName}:8787" -ForegroundColor Green
}
finally {
  $SudoPassword = $null
}
