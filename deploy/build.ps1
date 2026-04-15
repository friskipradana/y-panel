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

# ── Win32 WriteConsoleW — simple CR-based overwrite ───────────────────────────
$consoleNativeSource = @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

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

    private static readonly object Sync = new object();
    private static Timer SpinnerTimer = null;
    private static IntPtr SpinnerHandle = IntPtr.Zero;
    private static string SpinnerTemplate = "";
    private static string[] SpinnerFrames = new[] {"|", "/", "-", "\\"};
    private static int FrameIdx = 0;

    private static int GetWidth(IntPtr h) {
        CONSOLE_SCREEN_BUFFER_INFO info;
        if (GetConsoleScreenBufferInfo(h, out info))
            return Math.Max(40, info.Size.X);
        return 120;
    }

    private static string Pad(string text, int width) {
        if (text == null) text = "";
        if (text.Length > width) text = text.Substring(0, Math.Max(0, width - 3)) + "...";
        return text.PadRight(width);
    }

    private static void WriteRaw(IntPtr h, string text) {
        uint written;
        WriteConsoleW(h, text, (uint)text.Length, out written, IntPtr.Zero);
    }

    // Overwrite the current line using \r + padded text (no newline)
    public static void OverwriteLine(IntPtr h, string text) {
        lock (Sync) {
            StopSpinnerUnsafe();
            int w = GetWidth(h) - 1;
            WriteRaw(h, "\r" + Pad(text, w));
        }
    }

    // Commit: write \n so next output starts on a new line
    public static void CommitLine(IntPtr h) {
        lock (Sync) {
            StopSpinnerUnsafe();
            WriteRaw(h, "\n");
        }
    }

    // Start animated spinner: timer overwrites the same line with \r
    public static void StartSpinner(IntPtr h, string template, string frameList) {
        lock (Sync) {
            StopSpinnerUnsafe();
            SpinnerHandle = h;
            SpinnerTemplate = template ?? "{spinner}";
            SpinnerFrames = string.IsNullOrWhiteSpace(frameList)
                ? new[] {"|", "/", "-", "\\"}
                : frameList.Split('\n');
            FrameIdx = 0;

            // Render first frame immediately
            int w = GetWidth(h) - 1;
            WriteRaw(h, "\r" + Pad(SpinnerTemplate.Replace("{spinner}", SpinnerFrames[0]), w));

            SpinnerTimer = new Timer(_ => {
                lock (Sync) {
                    if (SpinnerTimer == null || SpinnerHandle == IntPtr.Zero) return;
                    FrameIdx++;
                    string frame = SpinnerFrames[FrameIdx % SpinnerFrames.Length];
                    int ww = GetWidth(SpinnerHandle) - 1;
                    WriteRaw(SpinnerHandle, "\r" + Pad(SpinnerTemplate.Replace("{spinner}", frame), ww));
                }
            }, null, 120, 120);
        }
    }

    public static void StopSpinner() {
        lock (Sync) { StopSpinnerUnsafe(); }
    }

    private static void StopSpinnerUnsafe() {
        if (SpinnerTimer != null) {
            SpinnerTimer.Dispose();
            SpinnerTimer = null;
        }
        SpinnerHandle = IntPtr.Zero;
    }
}
'@

if (-not ([System.Management.Automation.PSTypeName]'ConsoleNative').Type) {
  try { Add-Type -TypeDefinition $consoleNativeSource -ErrorAction Stop }
  catch { <# type already loaded in this session #> }
}

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
        Write-Host '    pwsh -File .\build.ps1 -HostName <host> -SshPassword <password>' -ForegroundColor Cyan
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
  $clean = [regex]::Replace([string]$Text, "`e\[[\d;?]*[A-Za-z]", '')
  return $clean.Trim()
}

function Get-TerminalWidth {
  try { return [Math]::Max([Console]::WindowWidth, 80) }
  catch { return 120 }
}

function Get-SpinnerFrames {
  if ($Script:IsLegacyPS) { return @('|', '/', '-', '\') }
  return @([string][char]0x280B, [string][char]0x2819, [string][char]0x2839,
           [string][char]0x2838, [string][char]0x283C, [string][char]0x2834,
           [string][char]0x2826, [string][char]0x2827, [string][char]0x2807,
           [string][char]0x280F)
}

# Overwrite the active line (\r + padded text, no newline)
function Write-ActiveLine {
  param([string]$Text)
  $clean = if ([string]::IsNullOrWhiteSpace($Text)) { '' }
           else { [regex]::Replace([string]$Text, "`e\[[\d;?]*[A-Za-z]", '') }
  if ($Script:LiveEnabled) {
    [ConsoleNative]::OverwriteLine($Script:ConHandle, $clean)
    $Script:ActiveLine = $clean
    $Script:ActiveRendered = $true
  }
  else {
    Write-Host $clean
  }
}

# Start animated spinner on the active line
function Start-ActiveSpinner {
  param([string]$Template)
  $clean = if ([string]::IsNullOrWhiteSpace($Template)) { '{spinner}' }
           else { [regex]::Replace([string]$Template, "`e\[[\d;?]*[A-Za-z]", '') }
  if ($Script:LiveEnabled) {
    $frames = ((Get-SpinnerFrames) | ForEach-Object { [string]$_ }) -join "`n"
    [ConsoleNative]::StartSpinner($Script:ConHandle, $clean, $frames)
    $Script:ActiveLine = $clean
    $Script:ActiveRendered = $true
  }
  else {
    Write-Host ($clean -replace '\{spinner\}', $Script:UiTheme.Pointer)
  }
}

# Commit active line = write \n so the next output starts on a fresh row
function Invoke-CommitLine {
  if ($Script:ActiveRendered -and $Script:LiveEnabled) {
    [ConsoleNative]::CommitLine($Script:ConHandle)
    $Script:ActiveRendered = $false
    $Script:ActiveLine = ''
  }
}

function Build-ProgressPrefix {
  param(
    [ValidateSet('Current', 'Done')]
    [string]$Phase = 'Current'
  )
  $numerator = if ($Phase -eq 'Done') { $Script:StepIndex }
               else { [Math]::Max(0, $Script:StepIndex - 1) }
  $pct = [int]([Math]::Floor(($numerator / $Script:StepTotal) * 100))
  if ($Phase -eq 'Done' -and $Script:StepIndex -ge $Script:StepTotal) { $pct = 100 }
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

# Start step: spinner animates on the same line
function Write-Step {
  param([string]$Label)
  $Script:StepIndex++
  $Script:StepStart = Get-Date
  Start-ActiveSpinner "$(Build-ProgressPrefix)  {spinner} $Label"
}

# Finish step: overwrite spinner with check mark, then commit (\n)
function Write-StepDone {
  param([string]$Detail = '')
  if (-not $Script:StepStart) { return }
  $elapsed = Format-Elapsed $Script:StepStart
  $suffix = if ($Detail) { " $(Normalize-DisplayText $Detail)" } else { '' }
  Write-ActiveLine "$(Build-ProgressPrefix -Phase Done)  $($Script:UiTheme.OkMark)$suffix ($elapsed)"
  Invoke-CommitLine
  $Script:StepStart = $null
}

# Info detail disembunyikan agar output deploy tetap ringkas.
# Jika nanti butuh mode verbose, fungsi ini bisa diaktifkan kembali.
function Write-Info {
  param([string]$Msg)
  return
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

Require-Command bun
Require-Command tar

# ── Path resolution ──────────────────────────────────────────────────────────
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $DeployDir
$ProductionsDir = Join-Path $DeployDir 'productions'
$ProdFrontendDir = Join-Path $ProductionsDir 'frontend'
$ProdBackendDir = Join-Path $ProductionsDir 'backend'
$ProdInstallerDir = Join-Path $ProductionsDir 'installer'
$TmpDir = Join-Path $DeployDir 'tmp'
$ArchivePath = Join-Path $TmpDir 'ui-panel-installer.tar.gz'
$RunInstallerPath = Join-Path $TmpDir 'ui-panel-installer.run'
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
  $buildOut = & cmd /c "cd /d `"$ProjectRoot`" && bun run build 2>&1"
  $buildExitCode = $LASTEXITCODE
  if ($buildExitCode -ne 0) { throw 'Build frontend gagal.' }
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

  $distDir = Join-Path $ProjectRoot 'dist'
  if (-not (Test-Path $distDir)) { throw "Folder dist/ tidak ditemukan setelah build." }
  if (Test-Path $ProdFrontendDir) { Remove-Item "$ProdFrontendDir\*" -Recurse -Force -ErrorAction SilentlyContinue }
  Copy-Item "$distDir\*" $ProdFrontendDir -Recurse -Force

  if (Test-Path $ProdBackendDir) { Remove-Item "$ProdBackendDir\*" -Recurse -Force -ErrorAction SilentlyContinue }
  Copy-Item (Join-Path $ProjectRoot 'go.mod') $ProdBackendDir -Force
  Copy-Item (Join-Path $ProjectRoot 'go.sum') $ProdBackendDir -Force
  Copy-Item (Join-Path $ProjectRoot 'cmd') $ProdBackendDir -Recurse -Force
  Copy-Item (Join-Path $ProjectRoot 'internal') $ProdBackendDir -Recurse -Force

  if (Test-Path $ProdInstallerDir) { Remove-Item "$ProdInstallerDir\*" -Recurse -Force -ErrorAction SilentlyContinue }
  $srcInstaller = Join-Path $ProjectRoot 'installer\linux'
  Copy-Item "$srcInstaller\*" $ProdInstallerDir -Recurse -Force

  $prodSizeBytes = (Get-ChildItem $ProductionsDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
  $prodSizeMB = [math]::Round($prodSizeBytes / 1MB, 1)
  Write-StepDone "productions $prodSizeMB MB"

  # ── [3] Buat installer .run ───────────────────────────────────
  Write-Step 'Membuat installer Linux (.run)'
  if (Test-Path $ArchivePath) { Remove-Item $ArchivePath -Force }
  if (Test-Path $RunInstallerPath) { Remove-Item $RunInstallerPath -Force }

  Push-Location $ProductionsDir
  try {
    & tar -czf $ArchivePath . 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Gagal membuat payload installer.' }
  }
  finally { Pop-Location }

  $payloadBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($ArchivePath))
  $installerStub = @'
#!/usr/bin/env bash
set -euo pipefail

SELF_PATH="$0"
if [ ! -f "$SELF_PATH" ]; then
  SELF_PATH="$(command -v "$0" 2>/dev/null || printf '%s' "$0")"
fi
WORK_DIR="$(mktemp -d /tmp/ui-panel-installer.XXXXXX)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

ARCHIVE_PATH="$WORK_DIR/payload.tar.gz"
awk 'found { print } /^__ARCHIVE_BELOW__$/ { found = 1; next }' "$SELF_PATH" | base64 -d > "$ARCHIVE_PATH"

tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"
cd "$WORK_DIR"

mkdir -p installer/linux
mv installer/*.sh installer/linux/ 2>/dev/null || true
mv installer/*.tpl installer/linux/ 2>/dev/null || true

if [ -d frontend ]; then
  mv frontend dist
fi

if [ -d backend ]; then
  cp -r backend/* . 2>/dev/null || true
  rm -rf backend
fi

find installer -type f \( -name '*.sh' -o -name '*.service.tpl' \) -exec sed -i 's/\r$//' {} +
chmod +x installer/linux/install.sh
chmod +x installer/linux/uninstall.sh

bash installer/linux/install.sh
exit 0
__ARCHIVE_BELOW__
'@
  $installerContent = ($installerStub -replace "`r`n", "`n") + "`n" + $payloadBase64 + "`n"
  [System.IO.File]::WriteAllText($RunInstallerPath, $installerContent, (New-Object System.Text.UTF8Encoding($false)))

  $installerMB = [math]::Round((Get-Item $RunInstallerPath).Length / 1MB, 1)
  Write-StepDone "installer $installerMB MB"

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

      $joinedHint = (($remoteLines | Select-Object -First 20) -join ' | ')
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
  $RemoteInstallerPath = "$ResolvedRemoteBaseDir/ui-panel-installer.run"
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

  if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
    if ($ExistingEnv.ContainsKey('PANEL_ADMIN_PASSWORD') -and -not [string]::IsNullOrWhiteSpace($ExistingEnv['PANEL_ADMIN_PASSWORD'])) {
      $AdminPassword = $ExistingEnv['PANEL_ADMIN_PASSWORD']
    } else {
      $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      $randomString = ''
      for ($i = 0; $i -lt 20; $i++) {
        $randomString += $chars[(Get-Random -Minimum 0 -Maximum $chars.Length)]
      }
      $AdminPassword = $randomString
    }
  }

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

  # ── [8] Upload installer ──────────────────────────────────────
  Write-Step "Upload installer (.run) $installerMB MB"
  $( Set-SCPItem -ComputerName $HostName -Credential $credential `
      -Path $RunInstallerPath -Destination $ResolvedRemoteBaseDir `
      -AcceptKey -Force -WarningAction SilentlyContinue 3>$null 4>$null 5>$null 6>$null ) | Out-Null
  Write-StepDone 'Upload selesai'

  # ── [9] Instalasi di server ───────────────────────────────────
  Write-Step 'Instalasi panel di server'

  $escapedRemoteBase = $ResolvedRemoteBaseDir.Replace("'", "'\''")
  $escapedRemoteInstaller = $RemoteInstallerPath.Replace("'", "'\''")
  $escapedRemoteLogPath = ("$ResolvedRemoteBaseDir/ui-panel-run-installer.log").Replace("'", "'\''")
  $escapedBind = $BindAddress.Replace("'", "'\''")
  $escapedAdmin = $AdminUsername.Replace("'", "'\''")
  $escapedPanelPassword = $AdminPassword.Replace("'", "'\''")
  $escapedAllowedHosts = ($AllowedHosts -join ',').Replace("'", "'\''")
  $escapedAllowedOrigins = ($AllowedOrigins -join ',').Replace("'", "'\''")

  $remoteScript = @"
set -euo pipefail
REMOTE_BASE_DIR='$escapedRemoteBase'
REMOTE_INSTALLER_PATH='$escapedRemoteInstaller'
DEFAULT_BIND='$escapedBind'
DEFAULT_ADMIN='$escapedAdmin'
DEFAULT_PASSWORD='$escapedPanelPassword'
DEFAULT_ALLOWED_HOSTS='$escapedAllowedHosts'
DEFAULT_ALLOWED_ORIGINS='$escapedAllowedOrigins'
SUDO_PASSWORD='$escapedSudo'
PANEL_PORT='$PanelPort'
ENV_FILE='/etc/ui-panel/agent.env'
REMOTE_LOG_PATH='$escapedRemoteLogPath'

mkdir -p "`$REMOTE_BASE_DIR"
: > "`$REMOTE_LOG_PATH"

for cmd in bash awk base64 tar mktemp sed; do
  if ! command -v "`$cmd" >/dev/null 2>&1; then
    echo "missing command: `$cmd" >&2
    exit 127
  fi
done

chmod +x "`$REMOTE_INSTALLER_PATH"
set +e
printf '%s\n' "`$SUDO_PASSWORD" | sudo -S -p '' bash -c "rm -rf /usr/local/go; export PANEL_BIND_ADDR='`$DEFAULT_BIND'; export PANEL_ADMIN_USERNAME='`$DEFAULT_ADMIN'; export PANEL_ADMIN_PASSWORD='`$DEFAULT_PASSWORD'; bash \"`$REMOTE_INSTALLER_PATH\"" >"`$REMOTE_LOG_PATH" 2>&1
installer_exit=`$?
set -e

if [ "`$installer_exit" -ne 0 ]; then
  echo "installer .run gagal dengan exit code: `$installer_exit"
  echo "log remote: `$REMOTE_LOG_PATH"
  echo "----- tail ui-panel-run-installer.log -----"
  tail -n 160 "`$REMOTE_LOG_PATH" || true
  echo "----- end log -----"
  exit "`$installer_exit"
fi

if ! printf '%s\n' "`$SUDO_PASSWORD" | sudo -S -p '' bash -lc "grep -q '^PANEL_ALLOWED_HOSTS=' \"`$ENV_FILE\""; then
  printf '%s\n' "`$SUDO_PASSWORD" | sudo -S -p '' bash -lc "echo \"PANEL_ALLOWED_HOSTS=`$DEFAULT_ALLOWED_HOSTS\" >> \"`$ENV_FILE\""
fi
if ! printf '%s\n' "`$SUDO_PASSWORD" | sudo -S -p '' bash -lc "grep -q '^PANEL_ALLOWED_ORIGINS=' \"`$ENV_FILE\""; then
  printf '%s\n' "`$SUDO_PASSWORD" | sudo -S -p '' bash -lc "echo \"PANEL_ALLOWED_ORIGINS=`$DEFAULT_ALLOWED_ORIGINS\" >> \"`$ENV_FILE\""
fi
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

    Invoke-Remote "bash $ResolvedRemoteBaseDir/deploy_remote.sh" | Out-Null
  }
  finally {
    Remove-Item $remoteScriptPath -Force -ErrorAction SilentlyContinue
    try {
      Invoke-Remote "rm -f $ResolvedRemoteBaseDir/deploy_remote.sh" | Out-Null
    }
    catch {}
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
