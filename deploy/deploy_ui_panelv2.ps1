param(
  [string]$HostName = 'node1-ubuntu.taile0346b.ts.net',
  [string]$SshUser = 'renaldi',
  [string]$SshPassword = '',
  [string]$RemoteBaseDir = '~/ui-panel-deploy',
  [string]$BindAddress = '',
  [string]$AdminUsername = 'admin',
  [string]$AdminPassword = '',
  [ValidateSet('Auto', 'Legacy', 'Modern')]
  [string]$PowerShellMode = 'Auto'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$WarningPreference = 'SilentlyContinue'

# ═══════════════════════════════════════════════════════════════
#  UI HELPERS
# ═══════════════════════════════════════════════════════════════

$Script:DeployStart = Get-Date
$Script:StepIndex = 0
$Script:StepTotal = 9
$Script:StepStart = $null
$Script:IsLegacyPS = $PSVersionTable.PSVersion.Major -lt 7
$Script:UiTheme = @{}
$Script:LastRemoteStdout = @()
$Script:LastRemoteStderr = @()
$Script:ActiveLine = ''
$Script:ActiveRendered = $false
$Script:StepCompleted = $false

# ── Win32 WriteConsoleW — bypass semua buffering PowerShell ──────────────────
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ConsoleNative {
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern IntPtr GetStdHandle(int n);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool WriteConsoleW(
        IntPtr h, string buf, uint len, out uint written, IntPtr reserved);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool GetConsoleScreenBufferInfo(
        IntPtr h, out CONSOLE_SCREEN_BUFFER_INFO info);
    [StructLayout(LayoutKind.Sequential)]
    public struct CONSOLE_SCREEN_BUFFER_INFO {
        public COORD Size; public COORD CursorPos; public short Attrs;
        public SMALL_RECT Window; public COORD MaxWindowSize;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct COORD { public short X; public short Y; }
    [StructLayout(LayoutKind.Sequential)]
    public struct SMALL_RECT { public short Left,Top,Right,Bottom; }
}
'@ -ErrorAction SilentlyContinue

$Script:ConHandle = try {
  $h = [ConsoleNative]::GetStdHandle(-11)
  $info = New-Object ConsoleNative+CONSOLE_SCREEN_BUFFER_INFO
  if ($h -ne [IntPtr]::Zero -and [ConsoleNative]::GetConsoleScreenBufferInfo($h, [ref]$info)) { $h }
  else { [IntPtr]::Zero }
}
catch { [IntPtr]::Zero }

$Script:LiveEnabled = ($Script:ConHandle -ne [IntPtr]::Zero)

function Initialize-UiTheme {
  $unicodeTheme = @{
    LineChar           = [string][char]0x2500
    OkMark             = [string][char]0x2714
    ErrorMark          = [string][char]0x2718
    ProgressFilled     = [string][char]0x2588
    ProgressEmpty      = [string][char]0x2591
    Pointer            = [string][char]0x203A
    Bullet             = [string][char]0x00B7
    LoadingMark        = [string][char]0x27F3
    BuildSummaryNeedle = 'built in'
    InstallingLabel    = 'Menginstall & mengkonfigurasi panel di server'
  }
  $asciiTheme = @{
    LineChar           = '-'
    OkMark             = '[OK]'
    ErrorMark          = '[ERROR]'
    ProgressFilled     = '#'
    ProgressEmpty      = '.'
    Pointer            = '->'
    Bullet             = '-'
    LoadingMark        = '[..]'
    BuildSummaryNeedle = 'built in'
    InstallingLabel    = 'Menginstall dan mengkonfigurasi panel di server'
  }

  if (-not $Script:IsLegacyPS) { $Script:UiTheme = $unicodeTheme; return }

  switch ($PowerShellMode) {
    'Legacy' {
      $Script:UiTheme = $asciiTheme
      Write-Host '  Menjalankan dengan Windows PowerShell lama -> UI ASCII aktif.' -ForegroundColor Yellow
      return
    }
    'Modern' {
      throw "Mode Modern membutuhkan PowerShell 7+. Jalankan dengan 'pwsh' atau update PowerShell terlebih dahulu."
    }
    default {
      Write-Host ''
      Write-Host '  Terdeteksi Windows PowerShell lama.' -ForegroundColor Yellow
      Write-Host '  Pilih mode:' -ForegroundColor DarkGray
      Write-Host '   [U] Update / gunakan PowerShell 7 (disarankan)' -ForegroundColor Cyan
      Write-Host '   [L] Lanjut pakai PowerShell lama (UI ASCII)' -ForegroundColor White
      $choice = Read-Host '  Pilihan [U/L]'
      if ($choice -match '^(?i)u') {
        Write-Host ''
        Write-Host '  Update ke PowerShell 7 lalu jalankan ulang dengan:' -ForegroundColor Yellow
        Write-Host '    winget install --id Microsoft.PowerShell --source winget' -ForegroundColor Cyan
        Write-Host '    pwsh -File .\deploy_ui_panel.ps1 -HostName <host> -SshPassword <password>' -ForegroundColor Cyan
        exit 1
      }
      $Script:UiTheme = $asciiTheme
      Write-Host '  Mode legacy dipilih -> UI ASCII aktif.' -ForegroundColor Yellow
    }
  }
}

function Format-Elapsed {
  param([datetime]$Since)
  $e = (Get-Date) - $Since
  if ($e.TotalSeconds -lt 60) { return "$([int]$e.TotalSeconds)s" }
  return "$([int]$e.TotalMinutes)m$($e.Seconds)s"
}

function Normalize-DisplayText {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return $Text }
  # Hanya strip ANSI escape codes, jangan potong konten
  $clean = [regex]::Replace([string]$Text, "`e\[[\d;?]*[A-Za-z]", '')
  return $clean.Trim()
}

function Get-TerminalWidth {
  try { return [Math]::Max([Console]::WindowWidth, 80) }
  catch { return 120 }
}

function Write-Con {
  param([string]$Text)
  $written = 0u
  [ConsoleNative]::WriteConsoleW($Script:ConHandle, $Text, [uint32]$Text.Length, [ref]$written, [IntPtr]::Zero) | Out-Null
}

function Write-ActiveLine {
  param([string]$Text)
  # Strip ANSI escape codes saja, JANGAN Trim leading spaces (bagian dari alignment progress bar)
  $clean = if ([string]::IsNullOrWhiteSpace($Text)) { '' }
           else { [regex]::Replace([string]$Text, "`e\[[\d;?]*[A-Za-z]", '') }

  $width = Get-TerminalWidth
  $maxLen = [Math]::Max(1, $width - 1)
  if ($clean.Length -gt $maxLen) { $clean = $clean.Substring(0, $maxLen - 3) + '...' }
  $padded = $clean.PadRight($maxLen)

  if ($Script:LiveEnabled) {
    $clearLine = (' ' * $maxLen)
    Write-Con "`r$clearLine`r$padded"
    $Script:ActiveLine = $Text
    $Script:ActiveRendered = $true
  }
  else {
    Write-Host $Text
  }
}

function Invoke-CommitLine {
  if ($Script:ActiveRendered -and $Script:LiveEnabled) {
    Write-Con "`n"
    $Script:ActiveRendered = $false
    $Script:ActiveLine = ''
  }
}

function Build-ProgressPrefix {
  param(
    [ValidateSet('Current', 'Done')]
    [string]$Phase = 'Current'
  )

  $numerator = if ($Phase -eq 'Done') {
    $Script:StepIndex
  }
  else {
    [Math]::Max(0, $Script:StepIndex - 1)
  }

  $pct = [int]([Math]::Floor(($numerator / $Script:StepTotal) * 100))
  if ($Phase -eq 'Done' -and $Script:StepIndex -ge $Script:StepTotal) {
    $pct = 100
  }

  $barWidth = 20
  $filled = [int]([Math]::Floor(($pct / 100) * $barWidth))
  if ($pct -ge 100) { $filled = $barWidth }
  $empty = $barWidth - $filled
  $bar = ($Script:UiTheme.ProgressFilled * $filled) + ($Script:UiTheme.ProgressEmpty * $empty)
  return "  [$bar] $pct%  Step $($Script:StepIndex)/$($Script:StepTotal)"
}

function Write-Banner {
  $line = $Script:UiTheme.LineChar * 60
  Write-Host "  $line" -ForegroundColor DarkGray
  Write-Host "   UI-Panel Deploy " -NoNewline -ForegroundColor White
  Write-Host "v$(Get-Date -Format 'yyyyMMdd')" -ForegroundColor DarkGray
  Write-Host "   Target  : " -NoNewline -ForegroundColor DarkGray
  Write-Host "${SshUser}@${HostName}" -ForegroundColor Cyan
  Write-Host "  $line" -ForegroundColor DarkGray
}

function Write-Step {
  param([string]$Label)
  if ($Script:ActiveRendered -and -not $Script:StepCompleted) {
    Invoke-CommitLine
  }
  $Script:StepIndex++
  $Script:StepStart = Get-Date
  $Script:StepCompleted = $false
  Write-ActiveLine "$(Build-ProgressPrefix)  $($Script:UiTheme.Pointer) $Label"
}

function Write-StepDone {
  param([string]$Detail = '')
  if (-not $Script:StepStart) { return }
  $elapsed = Format-Elapsed $Script:StepStart
  $suffix = if ($Detail) { " $(Normalize-DisplayText $Detail)" } else { '' }
  Write-ActiveLine "$(Build-ProgressPrefix -Phase Done)  $($Script:UiTheme.OkMark)$suffix ($elapsed)"
  $Script:StepCompleted = $true
  $Script:StepStart = $null
}

function Write-Info {
  param([string]$Msg)
  Write-ActiveLine "$(Build-ProgressPrefix)  $($Script:UiTheme.Bullet) $(Normalize-DisplayText $Msg)"
}

function Write-Err {
  param([string]$Msg)
  Invoke-CommitLine
  Write-Host "  $($Script:UiTheme.ErrorMark) GAGAL: $(Normalize-DisplayText $Msg)" -ForegroundColor Red
}

function Write-Summary {
  param(
    [string]$Url,
    [string]$User,
    [string]$TargetHost,
    [string]$PanelUser,
    [string]$PanelPassword
  )
  Invoke-CommitLine
  Write-Host ''
  $total = Format-Elapsed $Script:DeployStart
  $line = $Script:UiTheme.LineChar * 60
  Write-Host "  $line" -ForegroundColor DarkGray
  Write-Host "   $($Script:UiTheme.OkMark)  Deploy Berhasil " -NoNewline -ForegroundColor Green
  Write-Host "(total: $total)" -ForegroundColor DarkGray
  Write-Host "  $line" -ForegroundColor DarkGray
  Write-Host "   Panel URL       : " -NoNewline -ForegroundColor DarkGray
  Write-Host $Url -ForegroundColor Cyan
  Write-Host "   Server          : " -NoNewline -ForegroundColor DarkGray
  Write-Host "${User}@${TargetHost}" -ForegroundColor White
  Write-Host "   Panel Username  : " -NoNewline -ForegroundColor DarkGray
  Write-Host $PanelUser -ForegroundColor White
  Write-Host "   Panel Password  : " -NoNewline -ForegroundColor DarkGray
  Write-Host $PanelPassword -ForegroundColor White
  Write-Host "  $line" -ForegroundColor DarkGray
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
#  SETUP PATHS
# ═══════════════════════════════════════════════════════════════

Initialize-UiTheme

if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
  Write-Host "  $($Script:UiTheme.LoadingMark) Menginstall Posh-SSH..." -ForegroundColor Yellow -NoNewline
  if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue |
      Where-Object { $_.Version -ge '2.8.5.201' })) {
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
  }
  Install-Module -Name Posh-SSH -Scope CurrentUser -Force -AllowClobber -Repository PSGallery | Out-Null
  Write-Host " $($Script:UiTheme.OkMark)" -ForegroundColor Green
}
Import-Module Posh-SSH -WarningAction SilentlyContinue -ErrorAction Stop

Require-Command npm
Require-Command tar

# ── Path resolution ──────────────────────────────────────────────────────────
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $DeployDir
$ProductionsDir = Join-Path $DeployDir 'productions'
$ProdFrontendDir = Join-Path $ProductionsDir 'frontend'
$ProdBackendDir = Join-Path $ProductionsDir 'backend'
$ProdInstallerDir = Join-Path $ProductionsDir 'installer'
$TmpDir = Join-Path $DeployDir 'tmp'
$ArchivePath = Join-Path $TmpDir 'ui-panel-deploy.tar.gz'
$PanelPort = '8787'

foreach ($d in @($ProductionsDir, $ProdFrontendDir, $ProdBackendDir, $ProdInstallerDir, $TmpDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

if ([string]::IsNullOrWhiteSpace($SshPassword)) {
  $secPwd = Read-Host 'Masukkan password SSH/sudo server' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPwd)
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
  # Jalankan via cmd /c agar seluruh output npm melewati pipe, bukan langsung ke console
  $buildOut = & cmd /c "cd /d `"$ProjectRoot`" && npm run build 2>&1"
  $buildExitCode = $LASTEXITCODE
  if ($buildExitCode -ne 0) { throw 'Build frontend gagal.' }
  # Gabungkan output, lalu ekstrak ringkasan vite (cari 'built in')
  $buildText = ($buildOut | Out-String)
  $needle = $Script:UiTheme.BuildSummaryNeedle
  $builtLine = ($buildText -split "\n" |
    Where-Object { $_ -match $needle } |
    Select-Object -Last 1)
  if ($builtLine) {
    $idx = $builtLine.IndexOf($needle, [System.StringComparison]::OrdinalIgnoreCase)
    $summary = if ($idx -ge 0) { $builtLine.Substring($idx).Trim() } else { $builtLine.Trim() }
  } else {
    $summary = 'npm build OK'
  }
  Write-StepDone $summary

  # ── [2] Siapkan productions ────────────────────────────────────
  Write-Step 'Menyiapkan folder productions'

  # 2a. Copy frontend dist → productions/frontend/
  $distDir = Join-Path $ProjectRoot 'dist'
  if (-not (Test-Path $distDir)) { throw "Folder dist/ tidak ditemukan setelah build." }
  if (Test-Path $ProdFrontendDir) { Remove-Item "$ProdFrontendDir\*" -Recurse -Force -ErrorAction SilentlyContinue }
  Copy-Item "$distDir\*" $ProdFrontendDir -Recurse -Force

  # 2b. Copy Go source → productions/backend/ (untuk compile di server)
  if (Test-Path $ProdBackendDir) { Remove-Item "$ProdBackendDir\*" -Recurse -Force -ErrorAction SilentlyContinue }
  # Copy go.mod, go.sum
  Copy-Item (Join-Path $ProjectRoot 'go.mod') $ProdBackendDir -Force
  Copy-Item (Join-Path $ProjectRoot 'go.sum') $ProdBackendDir -Force
  # Copy cmd/ dan internal/
  Copy-Item (Join-Path $ProjectRoot 'cmd') $ProdBackendDir -Recurse -Force
  Copy-Item (Join-Path $ProjectRoot 'internal') $ProdBackendDir -Recurse -Force

  # 2c. Copy installer → productions/installer/
  if (Test-Path $ProdInstallerDir) { Remove-Item "$ProdInstallerDir\*" -Recurse -Force -ErrorAction SilentlyContinue }
  $srcInstaller = Join-Path $ProjectRoot 'installer\linux'
  Copy-Item "$srcInstaller\*" $ProdInstallerDir -Recurse -Force

  # Hitung ukuran folder productions
  $prodSizeBytes = (Get-ChildItem $ProductionsDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
  $prodSizeMB = [math]::Round($prodSizeBytes / 1MB, 1)
  Write-StepDone "productions $prodSizeMB MB"

  # ── [3] Buat archive ──────────────────────────────────────────
  Write-Step 'Membuat archive deploy'
  if (Test-Path $ArchivePath) { Remove-Item $ArchivePath -Force }
  Push-Location $ProductionsDir
  try {
    & tar -czf $ArchivePath . 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Gagal membuat archive deploy.' }
  }
  finally { Pop-Location }
  $archiveMB = [math]::Round((Get-Item $ArchivePath).Length / 1MB, 1)
  Write-StepDone "archive $archiveMB MB"

  # ── [4] Koneksi SSH ───────────────────────────────────────────
  Write-Step 'Membuka koneksi SSH'
  $securePass = ConvertTo-SecureString $SshPassword -AsPlainText -Force
  $credential = New-Object System.Management.Automation.PSCredential($SshUser, $securePass)

  $session = $( New-SSHSession -ComputerName $HostName -Credential $credential `
      -AcceptKey -Force -WarningAction SilentlyContinue 3>$null 4>$null 5>$null 6>$null )
  if (-not $session) { throw 'Gagal membuka koneksi SSH.' }
  $sessionId = $session.SessionId

  function Invoke-Remote {
    param([string]$Cmd)
    $result = $( Invoke-SSHCommand -SessionId $sessionId -Command $Cmd -TimeOut 600 `
        3>$null 4>$null 5>$null 6>$null )
    $stdout = @($result.Output | ForEach-Object { if ($null -ne $_) { [string]$_ } })
    $stderr = @($result.Error  | ForEach-Object { if ($null -ne $_) { [string]$_ } })
    $Script:LastRemoteStdout = $stdout
    $Script:LastRemoteStderr = $stderr

    if ($result.ExitStatus -ne 0) {
      $remoteLines = @()
      $remoteLines += ($stdout | ForEach-Object { Normalize-DisplayText $_ } | Where-Object { $_ })
      $remoteLines += ($stderr | ForEach-Object { Normalize-DisplayText $_ } | Where-Object { $_ })
      $remoteLines = $remoteLines | Select-Object -Unique
      foreach ($line in $remoteLines) { Write-Info $line }

      $joinedHint = (($remoteLines | Select-Object -First 3) -join ' | ')
      if ($joinedHint -match '\[sudo\] password|a password is required|not in the sudoers|incorrect password') {
        throw 'Autentikasi sudo di server gagal. Pastikan password SSH sama dengan password sudo untuk user remote.'
      }
      if ($joinedHint) { throw "Remote command gagal (exit $($result.ExitStatus)): $joinedHint" }
      throw "Remote command gagal (exit $($result.ExitStatus))"
    }
    return $stdout
  }

  Write-StepDone "terhubung ke $HostName"

  # ── [5] Verifikasi sudo remote ────────────────────────────────
  Write-Step 'Akses sudo'
  $escapedSudo = $SudoPassword.Replace("'", "'\''")
  Invoke-Remote "printf '%s\n' '$escapedSudo' | sudo -S -p '' true"
  Write-StepDone 'Akses sudo OK'

  # ── [6] Siapkan direktori remote ──────────────────────────────
  Write-Step 'Siapkan direktori remote'
  $resolvedLines = Invoke-Remote "mkdir -p $RemoteBaseDir && cd $RemoteBaseDir && pwd"
  $ResolvedRemoteBaseDir = ($resolvedLines | Select-Object -Last 1).Trim()
  if ([string]::IsNullOrWhiteSpace($ResolvedRemoteBaseDir)) {
    throw 'Gagal me-resolve path remote deploy directory.'
  }
  $RemoteReleaseDir = "$ResolvedRemoteBaseDir/ui-panel"
  $RemoteArchivePath = "$ResolvedRemoteBaseDir/ui-panel-deploy.tar.gz"
  Write-StepDone $ResolvedRemoteBaseDir

  # ── [7] Baca konfigurasi lama ─────────────────────────────────
  Write-Step 'Membaca konfigurasi panel sebelumnya'
  $ExistingEnvRaw = Invoke-Remote "printf '%s\n' '$escapedSudo' | sudo -S cat /etc/ui-panel/agent.env 2>/dev/null || true"
  $ExistingEnv = @{}
  foreach ($line in $ExistingEnvRaw) {
    if ($line -match '^(?<key>[A-Z0-9_]+)=(?<value>.*)$') {
      $ExistingEnv[$matches.key] = $matches.value
    }
  }

  if ([string]::IsNullOrWhiteSpace($AdminPassword) -and $ExistingEnv.ContainsKey('PANEL_ADMIN_PASSWORD')) { $AdminPassword = $ExistingEnv['PANEL_ADMIN_PASSWORD'] }
  if ([string]::IsNullOrWhiteSpace($AdminUsername) -and $ExistingEnv.ContainsKey('PANEL_ADMIN_USERNAME')) { $AdminUsername = $ExistingEnv['PANEL_ADMIN_USERNAME'] }
  if ([string]::IsNullOrWhiteSpace($BindAddress) -and $ExistingEnv.ContainsKey('PANEL_BIND_ADDR')) { $BindAddress = $ExistingEnv['PANEL_BIND_ADDR'] }
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

  $found = if ($ExistingEnv.Count -gt 0) { 'konfigurasi lama ditemukan' } else { 'instalasi baru' }
  Write-StepDone $found

  # ── [8] Upload archive ────────────────────────────────────────
  Write-Step "Upload paket deploy ($archiveMB MB)"
  $( Set-SCPItem -ComputerName $HostName -Credential $credential `
      -Path $ArchivePath -Destination $ResolvedRemoteBaseDir `
      -AcceptKey -Force -WarningAction SilentlyContinue 3>$null 4>$null 5>$null 6>$null ) | Out-Null
  Write-StepDone 'Upload selesai'

  # ── [9/10] Install di server ──────────────────────────────────
  Write-Step 'Instalasi panel di server'

  $escapedRemoteBase = $ResolvedRemoteBaseDir.Replace("'", "'\''")
  $escapedRemoteRelease = $RemoteReleaseDir.Replace("'", "'\''")
  $escapedRemoteArchive = $RemoteArchivePath.Replace("'", "'\''")
  $escapedBind = $BindAddress.Replace("'", "'\''")
  $escapedAdmin = $AdminUsername.Replace("'", "'\''")
  $escapedPanelPassword = $AdminPassword.Replace("'", "'\''")
  $escapedAllowedHosts = ($AllowedHosts -join ',').Replace("'", "'\''")
  $escapedAllowedOrigins = ($AllowedOrigins -join ',').Replace("'", "'\''")

  # Remote script: extract archive yang berisi productions layout
  # Struktur archive:
  #   frontend/     → frontend build
  #   backend/      → Go source (go.mod, cmd/, internal/)
  #   installer/    → install.sh, uninstall.sh, service template
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

# Restruktur layout agar install.sh berfungsi:
# install.sh mengharapkan REPO_ROOT = SCRIPT_DIR/../..
# Kita buat: RELEASE_DIR/installer/linux/install.sh
#            RELEASE_DIR/dist/            (frontend)
#            RELEASE_DIR/go.mod, cmd/, internal/  (Go source)
mkdir -p installer/linux

# Pindahkan installer files ke posisi yang benar
mv installer/*.sh installer/linux/ 2>/dev/null || true
mv installer/*.tpl installer/linux/ 2>/dev/null || true

# Pindahkan frontend ke dist/ (install.sh mengharapkan dist/)
if [ -d frontend ]; then
  mv frontend dist
fi

# Pindahkan Go source ke root (install.sh mengharapkan go.mod di REPO_ROOT)
if [ -d backend ]; then
  cp -r backend/* . 2>/dev/null || true
  rm -rf backend
fi

# Fix line endings & permissions
find installer -type f \( -name '*.sh' -o -name '*.service.tpl' \) -exec sed -i 's/\r$//' {} +
chmod +x installer/linux/install.sh
chmod +x installer/linux/uninstall.sh

ENV_FILE='/etc/ui-panel/agent.env'

printf '%s\n' "`$SUDO_PASSWORD" | sudo -S -p '' bash -c "export PANEL_BIND_ADDR='`$DEFAULT_BIND'; export PANEL_ADMIN_USERNAME='`$DEFAULT_ADMIN'; export PANEL_ADMIN_PASSWORD='`$DEFAULT_PASSWORD'; bash installer/linux/install.sh"
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S -p '' bash -lc "grep -q '^PANEL_ALLOWED_HOSTS=' \"`$ENV_FILE\" && sed -i \"s#^PANEL_ALLOWED_HOSTS=.*#PANEL_ALLOWED_HOSTS=`$DEFAULT_ALLOWED_HOSTS#\" \"`$ENV_FILE\" || echo \"PANEL_ALLOWED_HOSTS=`$DEFAULT_ALLOWED_HOSTS\" >> \"`$ENV_FILE\""
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S -p '' bash -lc "grep -q '^PANEL_ALLOWED_ORIGINS=' \"`$ENV_FILE\" && sed -i \"s#^PANEL_ALLOWED_ORIGINS=.*#PANEL_ALLOWED_ORIGINS=`$DEFAULT_ALLOWED_ORIGINS#\" \"`$ENV_FILE\" || echo \"PANEL_ALLOWED_ORIGINS=`$DEFAULT_ALLOWED_ORIGINS\" >> \"`$ENV_FILE\""
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S -p '' systemctl restart ui-panel.service
sleep 2
curl -fsS "http://127.0.0.1:`$PANEL_PORT/healthz"
"@

  $remoteScriptPath = Join-Path $TmpDir 'deploy_remote.sh'
  $remoteScriptUnix = ($remoteScript -replace "`r`n", "`n")
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($remoteScriptPath, $remoteScriptUnix, $utf8NoBom)

  try {
    $( Set-SCPItem -ComputerName $HostName -Credential $credential `
        -Path $remoteScriptPath -Destination $ResolvedRemoteBaseDir `
        -AcceptKey -Force -WarningAction SilentlyContinue 3>$null 4>$null 5>$null 6>$null ) | Out-Null

    $installOut = Invoke-Remote "bash $ResolvedRemoteBaseDir/deploy_remote.sh"
    foreach ($ln in $installOut) {
      $clean = $ln -replace '^\[ui-panel\]\s*', ''
      if ($clean -and $clean -notmatch '^{"') { Write-Info $clean }
    }
  }
  finally {
    Remove-Item $remoteScriptPath -Force -ErrorAction SilentlyContinue
    try { Invoke-Remote "rm -f $ResolvedRemoteBaseDir/deploy_remote.sh" | Out-Null } catch {}
  }

  Write-StepDone 'Instalasi selesai'

  # ── Selesai ───────────────────────────────────────────────────
  Write-Summary `
    -Url           "http://${HostName}:$PanelPort" `
    -User          $SshUser `
    -TargetHost    $HostName `
    -PanelUser     $AdminUsername `
    -PanelPassword $AdminPassword

}
catch {
  $message = $_.Exception.Message
  if (($message -like 'Remote command gagal*') -and
    (@($Script:LastRemoteStderr).Count -gt 0 -or @($Script:LastRemoteStdout).Count -gt 0)) {
    $details = @()
    $details += ($Script:LastRemoteStdout | ForEach-Object { Normalize-DisplayText $_ } | Where-Object { $_ })
    $details += ($Script:LastRemoteStderr | ForEach-Object { Normalize-DisplayText $_ } | Where-Object { $_ })
    $details = @($details | Select-Object -Unique)
    if (@($details).Count -gt 0) {
      $message = "$message | " + ((@($details) | Select-Object -First 3) -join ' | ')
    }
  }
  Write-Err $message
  exit 1
}
finally {
  if (Get-Command Get-SSHSession -ErrorAction SilentlyContinue) {
    Get-SSHSession -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-SSHSession -SessionId $_.SessionId -ErrorAction SilentlyContinue | Out-Null }
  }
  $SudoPassword = $null
}
