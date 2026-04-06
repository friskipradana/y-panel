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
$WarningPreference     = 'SilentlyContinue'   # Sembunyikan WARNING Posh-SSH

# ═══════════════════════════════════════════════════════════════
#  UI HELPERS
# ═══════════════════════════════════════════════════════════════

$Script:DeployStart  = Get-Date
$Script:StepIndex    = 0
$Script:StepTotal    = 9     # jumlah step utama
$Script:StepStart    = $null

function Format-Elapsed {
  param([datetime]$Since)
  $e = (Get-Date) - $Since
  if ($e.TotalSeconds -lt 60) { return "$([int]$e.TotalSeconds)s" }
  return "$([int]$e.TotalMinutes)m$($e.Seconds)s"
}

function Write-Banner {
  $line = '─' * 60
  Write-Host ""
  Write-Host "  $line" -ForegroundColor DarkGray
  Write-Host "   UI-Panel Deploy " -NoNewline -ForegroundColor White
  Write-Host "v$(Get-Date -Format 'yyyyMMdd')" -ForegroundColor DarkGray
  Write-Host "   Target  : " -NoNewline -ForegroundColor DarkGray
  Write-Host "${SshUser}@${HostName}" -ForegroundColor Cyan
  Write-Host "  $line" -ForegroundColor DarkGray
  Write-Host ""
}

function Write-Step {
  param([string]$Label)

  # Tutup step sebelumnya
  if ($Script:StepStart -and $Script:StepIndex -gt 0) {
    $elapsed = Format-Elapsed $Script:StepStart
    Write-Host "  $([char]0x2714) " -NoNewline -ForegroundColor Green
    Write-Host "selesai " -NoNewline -ForegroundColor DarkGray
    Write-Host "($elapsed)" -ForegroundColor DarkGray
  }

  $Script:StepIndex++
  $Script:StepStart = Get-Date
  $pct = [int](($Script:StepIndex - 1) / $Script:StepTotal * 100)

  # Bar progress
  $barWidth  = 20
  $filled    = [int]($pct / 100 * $barWidth)
  $empty     = $barWidth - $filled
  $bar       = ('█' * $filled) + ('░' * $empty)

  Write-Host ""
  Write-Host "  [$bar] " -NoNewline -ForegroundColor DarkCyan
  Write-Host "$pct%" -NoNewline -ForegroundColor Cyan
  Write-Host "  Step $($Script:StepIndex)/$($Script:StepTotal)" -ForegroundColor DarkGray
  Write-Host "  ➤ " -NoNewline -ForegroundColor Yellow
  Write-Host $Label -ForegroundColor White
}

function Write-StepDone {
  param([string]$Detail = '')
  if ($Script:StepStart) {
    $elapsed = Format-Elapsed $Script:StepStart
    Write-Host "  $([char]0x2714) " -NoNewline -ForegroundColor Green
    if ($Detail) {
      Write-Host "$Detail " -NoNewline -ForegroundColor Gray
    }
    Write-Host "($elapsed)" -ForegroundColor DarkGray
    $Script:StepStart = $null
  }
}

function Write-Info {
  param([string]$Msg)
  Write-Host "    · $Msg" -ForegroundColor DarkGray
}

function Write-Success {
  param([string]$Msg)
  Write-Host "    $([char]0x2714) $Msg" -ForegroundColor Green
}

function Write-Err {
  param([string]$Msg)
  Write-Host ""
  Write-Host "  $([char]0x2718) GAGAL: $Msg" -ForegroundColor Red
}

function Write-Summary {
  param([string]$Url, [string]$User, [string]$Host)
  $total = Format-Elapsed $Script:DeployStart
  $line  = '─' * 60
  Write-Host ""
  Write-Host "  $line" -ForegroundColor DarkGray
  Write-Host "   $([char]0x2714) Deploy Berhasil " -NoNewline -ForegroundColor Green
  Write-Host "(total: $total)" -ForegroundColor DarkGray
  Write-Host "  $line" -ForegroundColor DarkGray
  Write-Host "   Panel URL  : " -NoNewline -ForegroundColor DarkGray
  Write-Host $Url -ForegroundColor Cyan
  Write-Host "   Server     : " -NoNewline -ForegroundColor DarkGray
  Write-Host "${User}@${Host}" -ForegroundColor White
  Write-Host "  $line" -ForegroundColor DarkGray
  Write-Host ""
}

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' tidak ditemukan di PATH."
  }
}

function Get-PortFromBindAddress {
  param([string]$Value)
  if ($Value -match ':(\d+)$') { return $matches[1] }
  return '8787'
}

# ═══════════════════════════════════════════════════════════════
#  INSTALL POSH-SSH JIKA BELUM ADA
# ═══════════════════════════════════════════════════════════════

if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
  Write-Host "  ⟳ Menginstall Posh-SSH..." -ForegroundColor Yellow -NoNewline
  if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue |
            Where-Object { $_.Version -ge '2.8.5.201' })) {
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
  }
  Install-Module -Name Posh-SSH -Scope CurrentUser -Force -AllowClobber -Repository PSGallery | Out-Null
  Write-Host " $([char]0x2714)" -ForegroundColor Green
}
Import-Module Posh-SSH -WarningAction SilentlyContinue -ErrorAction Stop

Require-Command npm
Require-Command tar

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TmpDir      = Join-Path $ProjectRoot 'tmp'
$ArchivePath = Join-Path $TmpDir 'ui-panel-deploy.tar.gz'
$PanelPort   = '8787'

if (-not (Test-Path $TmpDir)) {
  New-Item -ItemType Directory -Path $TmpDir | Out-Null
}

if ([string]::IsNullOrWhiteSpace($SshPassword)) {
  $secPwd      = Read-Host 'Masukkan password SSH/sudo server' -AsSecureString
  $bstr        = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPwd)
  $SshPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$SudoPassword = $SshPassword

# ═══════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════

Write-Banner

try {

  # ── [1] Build frontend ────────────────────────────────────────
  Write-Step 'Build frontend production'
  $buildOut = & npm run build 2>&1
  if ($LASTEXITCODE -ne 0) {
    $buildOut | ForEach-Object { Write-Info $_ }
    throw 'Build frontend gagal.'
  }
  # Ambil baris ringkasan vite
  $builtLine = $buildOut | Where-Object { $_ -match '✓ built in' } | Select-Object -Last 1
  Write-StepDone ($builtLine ? $builtLine.Trim() : 'npm build OK')

  # ── [2] Buat archive ──────────────────────────────────────────
  Write-Step 'Membuat archive project'
  if (Test-Path $ArchivePath) { Remove-Item $ArchivePath -Force }
  Push-Location $ProjectRoot
  try {
    & tar -czf $ArchivePath --exclude=node_modules --exclude=.git --exclude=tmp . 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Gagal membuat archive deploy.' }
  }
  finally { Pop-Location }
  $archiveMB = [math]::Round((Get-Item $ArchivePath).Length / 1MB, 1)
  Write-StepDone "archive $archiveMB MB"

  # ── [3] Koneksi SSH ───────────────────────────────────────────
  Write-Step 'Membuka koneksi SSH'
  $securePass = ConvertTo-SecureString $SshPassword -AsPlainText -Force
  $credential = New-Object System.Management.Automation.PSCredential($SshUser, $securePass)

  $session = New-SSHSession -ComputerName $HostName -Credential $credential `
             -AcceptKey -Force -WarningAction SilentlyContinue
  if (-not $session) { throw 'Gagal membuka koneksi SSH.' }
  $sessionId = $session.SessionId

  function Invoke-Remote {
    param([string]$Cmd)
    $result = Invoke-SSHCommand -SessionId $sessionId -Command $Cmd -TimeOut 600
    if ($result.ExitStatus -ne 0) {
      $result.Output | ForEach-Object { Write-Info $_ }
      $result.Error  | ForEach-Object { Write-Info $_ }
      throw "Remote command gagal (exit $($result.ExitStatus))"
    }
    return $result.Output
  }

  Write-StepDone "terhubung ke $HostName"

  # ── [4] Siapkan direktori remote ──────────────────────────────
  Write-Step 'Siapkan direktori remote'
  $resolvedLines         = Invoke-Remote "mkdir -p $RemoteBaseDir && cd $RemoteBaseDir && pwd"
  $ResolvedRemoteBaseDir = ($resolvedLines | Select-Object -Last 1).Trim()
  if ([string]::IsNullOrWhiteSpace($ResolvedRemoteBaseDir)) {
    throw 'Gagal me-resolve path remote deploy directory.'
  }
  $RemoteReleaseDir  = "$ResolvedRemoteBaseDir/ui-panel"
  $RemoteArchivePath = "$ResolvedRemoteBaseDir/ui-panel-deploy.tar.gz"
  Write-StepDone $ResolvedRemoteBaseDir

  # ── [5] Baca konfigurasi lama ─────────────────────────────────
  Write-Step 'Membaca konfigurasi panel sebelumnya'
  $escapedSudo    = $SudoPassword.Replace("'", "'\\''")
  $ExistingEnvRaw = Invoke-Remote "printf '%s\n' '$escapedSudo' | sudo -S cat /etc/ui-panel/agent.env 2>/dev/null || true"
  $ExistingEnv    = @{}
  foreach ($line in $ExistingEnvRaw) {
    if ($line -match '^(?<key>[A-Z0-9_]+)=(?<value>.*)$') {
      $ExistingEnv[$matches.key] = $matches.value
    }
  }

  if ([string]::IsNullOrWhiteSpace($AdminPassword)  -and $ExistingEnv.ContainsKey('PANEL_ADMIN_PASSWORD'))  { $AdminPassword = $ExistingEnv['PANEL_ADMIN_PASSWORD'] }
  if ([string]::IsNullOrWhiteSpace($AdminUsername)  -and $ExistingEnv.ContainsKey('PANEL_ADMIN_USERNAME'))  { $AdminUsername = $ExistingEnv['PANEL_ADMIN_USERNAME'] }
  if ([string]::IsNullOrWhiteSpace($BindAddress)    -and $ExistingEnv.ContainsKey('PANEL_BIND_ADDR'))       { $BindAddress   = $ExistingEnv['PANEL_BIND_ADDR'] }
  if ([string]::IsNullOrWhiteSpace($BindAddress))   { $BindAddress = '0.0.0.0:8787' }
  $PanelPort = Get-PortFromBindAddress $BindAddress

  $AllowedHosts = @()
  if ($ExistingEnv.ContainsKey('PANEL_ALLOWED_HOSTS') -and -not [string]::IsNullOrWhiteSpace($ExistingEnv['PANEL_ALLOWED_HOSTS'])) {
    $AllowedHosts += ($ExistingEnv['PANEL_ALLOWED_HOSTS'] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  } else {
    $AllowedHosts += @('localhost', '127.0.0.1', $HostName)
  }
  $AllowedHosts = $AllowedHosts | Select-Object -Unique

  $AllowedOrigins = @()
  if ($ExistingEnv.ContainsKey('PANEL_ALLOWED_ORIGINS') -and -not [string]::IsNullOrWhiteSpace($ExistingEnv['PANEL_ALLOWED_ORIGINS'])) {
    $AllowedOrigins += ($ExistingEnv['PANEL_ALLOWED_ORIGINS'] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  } else {
    $AllowedOrigins += @(
      "http://127.0.0.1:$PanelPort",
      "http://localhost:$PanelPort",
      "http://${HostName}:$PanelPort"
    )
  }
  $AllowedOrigins = $AllowedOrigins | Select-Object -Unique

  $found = if ($ExistingEnv.Count -gt 0) { 'konfigurasi lama ditemukan' } else { 'instalasi baru' }
  Write-StepDone $found

  # ── [6] Upload archive ────────────────────────────────────────
  Write-Step "Upload archive ke server ($archiveMB MB)"
  Set-SCPItem -ComputerName $HostName -Credential $credential `
    -Path $ArchivePath -Destination $ResolvedRemoteBaseDir `
    -AcceptKey -Force -WarningAction SilentlyContinue
  Write-StepDone 'upload selesai'

  # ── [7/8/9] Install di server ─────────────────────────────────
  Write-Step 'Menginstall & mengkonfigurasi panel di server'

  $escapedRemoteBase     = $ResolvedRemoteBaseDir.Replace("'", "'\\''")
  $escapedRemoteRelease  = $RemoteReleaseDir.Replace("'", "'\\''")
  $escapedRemoteArchive  = $RemoteArchivePath.Replace("'", "'\\''")
  $escapedBind           = $BindAddress.Replace("'", "'\\''")
  $escapedAdmin          = $AdminUsername.Replace("'", "'\\''")
  $escapedPanelPassword  = $AdminPassword.Replace("'", "'\\''")
  $escapedAllowedHosts   = ($AllowedHosts -join ',').Replace("'", "'\\''")
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
  $utf8NoBom        = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($remoteScriptPath, $remoteScriptUnix, $utf8NoBom)

  try {
    Set-SCPItem -ComputerName $HostName -Credential $credential `
      -Path $remoteScriptPath -Destination $ResolvedRemoteBaseDir `
      -AcceptKey -Force -WarningAction SilentlyContinue

    # Jalankan & filter log server agar rapi
    $installOut = Invoke-Remote "bash $ResolvedRemoteBaseDir/deploy_remote.sh"
    foreach ($ln in $installOut) {
      $clean = $ln -replace '^\[ui-panel\]\s*', ''
      if ($clean -and $clean -notmatch '^{"') {
        Write-Info $clean
      }
    }
  }
  finally {
    Remove-Item $remoteScriptPath -Force -ErrorAction SilentlyContinue
    try { Invoke-Remote "rm -f $ResolvedRemoteBaseDir/deploy_remote.sh" | Out-Null } catch {}
  }

  Write-StepDone 'instalasi & restart selesai'

  # ── Selesai ───────────────────────────────────────────────────
  Write-Summary -Url "http://${HostName}:$PanelPort" -User $SshUser -Host $HostName

}
catch {
  Write-Err $_.Exception.Message
  exit 1
}
finally {
  if (Get-Command Get-SSHSession -ErrorAction SilentlyContinue) {
    Get-SSHSession -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-SSHSession -SessionId $_.SessionId -ErrorAction SilentlyContinue | Out-Null }
  }
  $SudoPassword = $null
}
