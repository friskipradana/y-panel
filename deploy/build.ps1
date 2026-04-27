#Requires -Version 5.1

<#
.SYNOPSIS
  YPanel - Build & Deploy Script v2

.DESCRIPTION
  Melakukan build frontend (bun), bundle backend Go, lalu deploy ke server Linux
  via SSH (Posh-SSH) dengan dukungan:
  - PostgreSQL auto-setup
  - AES-256 encryption key generation
  - Multi-user bootstrap (superadmin)
  - Per-user Cloudflare CF token enkripsi
  - Rollback otomatis jika deploy gagal
  - Mode OnlyFrontend untuk update UI cepat

.EXAMPLE
  .\deploy\build.ps1 -HostName 100.65.152.14 -SshUsername "root" -SshPassword "Renaldi123!@#"

.EXAMPLE
  .\deploy\build.ps1 -HostName 100.65.152.14 -SshUsername "root" -SshPassword "pass" -OnlyFrontend

.EXAMPLE
  .\deploy\build.ps1 -HostName myserver.com -SshUsername "root" -SshPassword "pass" `
    -EncryptionKey "aabbcc..."
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$SshUsername = 'renaldi',
  [string]$SshPassword = '',
  [string]$RemoteBaseDir = '~/ypanel-deploy',
  [string]$BindAddress = '0.0.0.0:8787',
  [string]$DatabaseDSN = '',
  [string]$EncryptionKey = '',

  [switch]$SkipFrontendBuild,
  [switch]$OnlyFrontend,
  [switch]$PackageOnly,

  [ValidateSet('Auto', 'Legacy', 'Modern')]
  [string]$PowerShellMode = 'Auto'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$WarningPreference = 'SilentlyContinue'

# ==================================================================
#  CONSTANTS
# ==================================================================
$SCRIPT_VERSION = '2.1.0'
$SVC_NAME = 'ypanel'
$ENV_FILE = '/etc/ypanel/agent.env'
$INSTALL_DIR = '/opt/ypanel'
$STATE_DIR = '/var/lib/ypanel'
$PANEL_USER = 'root'

# ==================================================================
#  WIN32 CONSOLE HELPER (animated spinner)
# ==================================================================
$consoleNative = @'
using System; using System.Runtime.InteropServices; using System.Threading;
public class ConsoleNative {
    [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern bool WriteConsoleW(IntPtr h,string s,uint l,out uint w,IntPtr r);
    [DllImport("kernel32.dll")] public static extern bool GetConsoleScreenBufferInfo(IntPtr h,out CSBI i);
    [StructLayout(LayoutKind.Sequential)] public struct CSBI { public COORD S;public COORD C;public short A;public SR W;public COORD M; }
    [StructLayout(LayoutKind.Sequential)] public struct COORD  { public short X,Y; }
    [StructLayout(LayoutKind.Sequential)] public struct SR    { public short L,T,R,B; }
    static readonly object Lock=new object(); static Timer T=null; static IntPtr H=IntPtr.Zero;
    static string Tpl=""; static string[] F=new[]{"| ","/ ","- ","\\ "}; static int I=0;
    static int Width(IntPtr h){ CSBI c; return GetConsoleScreenBufferInfo(h,out c)?Math.Max(40,c.S.X):120; }
    static string Pad(string s,int w){ if(s==null)s=""; if(s.Length>w)s=s.Substring(0,Math.Max(0,w-3))+"..."; return s.PadRight(w); }
    static void Raw(IntPtr h,string s){ uint n; WriteConsoleW(h,s,(uint)s.Length,out n,IntPtr.Zero); }
    public static void Over(IntPtr h,string s){ lock(Lock){ Stop0(); Raw(h,"\r"+Pad(s,Width(h)-1)); } }
    public static void Commit(IntPtr h){ lock(Lock){ Stop0(); Raw(h,"\n"); } }
    public static void Spin(IntPtr h,string tpl,string fr){
        lock(Lock){ Stop0(); H=h; Tpl=tpl??""; F=string.IsNullOrEmpty(fr)?new[]{"| ","/ ","- ","\\ "}:fr.Split('\n'); I=0;
        Raw(h,"\r"+Pad(Tpl.Replace("{s}",F[0]),Width(h)-1));
        T=new Timer(_=>{ lock(Lock){ if(T==null||H==IntPtr.Zero)return; string f=F[++I%F.Length]; Raw(H,"\r"+Pad(Tpl.Replace("{s}",f),Width(H)-1)); } },null,130,130); }
    }
    public static void Stop(){ lock(Lock){ Stop0(); } }
    static void Stop0(){ if(T!=null){T.Dispose();T=null;} H=IntPtr.Zero; }
}
'@
if (-not ([System.Management.Automation.PSTypeName]'ConsoleNative').Type) {
  try { Add-Type -TypeDefinition $consoleNative -ErrorAction Stop } catch {}
}
$CON = try {
  $h = [ConsoleNative]::GetStdHandle(-11)
  $i = New-Object ConsoleNative+CSBI
  if ($h -ne [IntPtr]::Zero -and [ConsoleNative]::GetConsoleScreenBufferInfo($h, [ref]$i)) { $h } else { [IntPtr]::Zero }
}
catch { [IntPtr]::Zero }
$LIVE = ($CON -ne [IntPtr]::Zero)

# ═══════════════════════════════════════════════════════════════════
#  UI HELPERS
# ═══════════════════════════════════════════════════════════════════
$Script:IsLegacy = $PSVersionTable.PSVersion.Major -lt 7
$Script:Theme = @{}
$Script:StepN = 0
$Script:StepOf = if ($PackageOnly) { 3 } elseif ($OnlyFrontend) { 5 } else { 10 }
$Script:T0 = Get-Date
$Script:Ts = $null
$Script:Live = $false
$Script:LastOut = @()
$Script:LastErr = @()
$Script:SessId = $null
$Script:Cred = $null

function Init-Theme {
  $u = @{
    L  = [string][char]0x2500
    Ok = [string][char]0x2714
    Er = [string][char]0x2718
    Wa = [string][char]0x26A0
    Fb = [string][char]0x2588
    Fe = [string][char]0x2591
    Ar = [string][char]0x203A
  }
  $a = @{ L = '-'; Ok = '[OK]'; Er = '[ERR]'; Wa = '[!]'; Fb = '#'; Fe = '.'; Ar = '->' }
  if (-not $Script:IsLegacy) { $Script:Theme = $u; return }
  switch ($PowerShellMode) {
    'Legacy' { $Script:Theme = $a; Write-Host '  [Legacy PS / ASCII UI]' -ForegroundColor Yellow; return }
    'Modern' { throw 'PowerShell 7+ diperlukan untuk mode Modern.' }
    default {
      Write-Host '  Terdeteksi Windows PowerShell lama.' -ForegroundColor Yellow
      Write-Host '  [U] Install PowerShell 7  [L] Lanjut ASCII UI' -ForegroundColor DarkGray
      if ((Read-Host '  Pilih [U/L]') -match '^[Uu]') {
        Write-Host '  winget install --id Microsoft.PowerShell && pwsh .\deploy\build.ps1 ...' -ForegroundColor Cyan
        exit 1
      }
      $Script:Theme = $a
    }
  }
}

function fe([double]$s) { if ($s -lt 60) { "${s}s" } else { "$([int]($s/60))m$([int]($s%60))s" } }
function elapsed { fe ([int]((Get-Date) - $Script:T0).TotalSeconds) }
function step-elapsed { if ($Script:Ts) { fe ([int]((Get-Date) - $Script:Ts).TotalSeconds) } else { '' } }
function strip([string]$t) { [regex]::Replace([string]$t, "`e\[[\d;?]*[A-Za-z]", '').Trim() }

function bar([string]$Phase = 'Current') {
  $n = if ($Phase -eq 'Done') { $Script:StepN } else { [Math]::Max(0, $Script:StepN - 1) }
  $pct = [int]([Math]::Min(100, [Math]::Floor($n / $Script:StepOf * 100)))
  $f = [int]([Math]::Floor($pct / 100 * 20)); if ($pct -ge 100) { $f = 20 }
  $b = ($Script:Theme.Fb * $f) + ($Script:Theme.Fe * (20 - $f))
  "  [$b] $pct%  Step $($Script:StepN)/$($Script:StepOf)"
}

function wlive([string]$t) {
  $c = strip $t
  if ($LIVE) { [ConsoleNative]::Over($CON, $c); $Script:Live = $true } else { Write-Host $c }
}
function wspin([string]$tpl) {
  $c = strip $tpl
  if ($LIVE) {
    $fr = if ($Script:IsLegacy) { @('| ', '/ ', '- ', '\ ') } else {
      @([char]0x280B, [char]0x2819, [char]0x2839, [char]0x2838, [char]0x283C, [char]0x2834, [char]0x2826, [char]0x2827, [char]0x2807, [char]0x280F)
    }
    [ConsoleNative]::Spin($CON, $c, ($fr -join "`n"))
    $Script:Live = $true
  }
  else { Write-Host ($c -replace '\{s\}', $Script:Theme.Ar) }
}
function commit {
  if ($Script:Live -and $LIVE) { [ConsoleNative]::Commit($CON); $Script:Live = $false }
}

function step([string]$label) {
  $Script:StepN++; $Script:Ts = Get-Date
  wspin "$(bar)  {s} $label"
}
function ok([string]$detail = '') {
  $sx = step-elapsed
  $d = if ($detail) { " $(strip $detail)" } else { '' }
  wlive "$(bar Done)  $($Script:Theme.Ok)$d ($sx)"
  commit; $Script:Ts = $null
}
function warn([string]$detail = '') {
  $sx = step-elapsed
  wlive "$(bar Done)  $($Script:Theme.Wa) $(strip $detail) ($sx)"
  commit; $Script:Ts = $null
}
function err([string]$Msg) {
  commit
  $icon = if ($Script:Theme -and $Script:Theme.ContainsKey('Er')) { $Script:Theme.Er } else { '[ERR]' }
  Write-Host "  $icon GAGAL: $(strip $Msg)" -ForegroundColor Red
}

function banner {
  $l = $Script:Theme.L * 62
  Write-Host "  $l" -ForegroundColor DarkGray
  Write-Host "   YPanel " -NoNewline -ForegroundColor White
  Write-Host "v$SCRIPT_VERSION" -NoNewline -ForegroundColor Cyan
  Write-Host " — Deploy Script" -ForegroundColor DarkGray
  Write-Host "   Target  : " -NoNewline -ForegroundColor DarkGray; Write-Host "${SshUsername}@${HostName}" -ForegroundColor Cyan
  if ($PackageOnly) {
    Write-Host "   Mode    : " -NoNewline -ForegroundColor DarkGray; Write-Host "Package Only (installer artifact)" -ForegroundColor Yellow
  }
  elseif ($OnlyFrontend) {
    Write-Host "   Mode    : " -NoNewline -ForegroundColor DarkGray; Write-Host "Frontend Only (fast update)" -ForegroundColor Yellow
  }
  Write-Host "  $l" -ForegroundColor DarkGray; Write-Host ""
}

function summary([string]$Url, [bool]$NewInstall) {
  commit
  $l = $Script:Theme.L * 62
  Write-Host ""; Write-Host "  $l" -ForegroundColor DarkGray
  Write-Host "   $($Script:Theme.Ok)  Deploy Berhasil " -NoNewline -ForegroundColor Green
  Write-Host "($(elapsed))" -ForegroundColor DarkGray
  Write-Host "  $l" -ForegroundColor DarkGray
  Write-Host "   YPanel URL      : " -NoNewline -ForegroundColor DarkGray; Write-Host $Url -ForegroundColor Cyan
  Write-Host "   Server         : " -NoNewline -ForegroundColor DarkGray; Write-Host "${SshUsername}@${HostName}" -ForegroundColor White
  if ($NewInstall) {
    Write-Host "   Langkah awal   : " -NoNewline -ForegroundColor DarkGray; Write-Host 'Buka panel lalu buat Admin Pertama di first-run setup.' -ForegroundColor Yellow
  }
  Write-Host "  $l" -ForegroundColor DarkGray; Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════
#  SSH HELPERS
# ═══════════════════════════════════════════════════════════════════
function Invoke-Remote {
  param([string]$Cmd, [int]$Timeout = 600, [switch]$AllowFail)
  $r = Invoke-SSHCommand -SessionId $Script:SessId -Command $Cmd -TimeOut $Timeout `
    3>$null 4>$null 5>$null 6>$null
  $out = @($r.Output | ForEach-Object { if ($null -ne $_) { [string]$_ } })
  $errs = @($r.Error  | ForEach-Object { if ($null -ne $_) { [string]$_ } })
  $Script:LastOut = $out; $Script:LastErr = $errs
  if ($r.ExitStatus -ne 0 -and -not $AllowFail) {
    $lines = (@($out) + @($errs) | ForEach-Object { strip $_ } | Where-Object { $_ } | Select-Object -Unique)
    $hint = ($lines | Select-Object -First 10) -join ' | '
    if ($hint -match 'sudo.*password|not in the sudoers|incorrect password') {
      throw 'Autentikasi sudo gagal. Password SSH harus sama dengan password sudo.'
    }
    throw "Remote command gagal (exit $($r.ExitStatus))$(if($hint){': '+$hint})"
  }
  return $out
}

function Upload-File {
  param([string]$LocalPath, [string]$RemoteDir)
  Set-SCPItem -ComputerName $HostName -Credential $Script:Cred `
    -Path $LocalPath -Destination $RemoteDir `
    -AcceptKey -Force -WarningAction SilentlyContinue 3>$null 4>$null 5>$null 6>$null | Out-Null
}

function Run-RemoteScript {
  # Upload a local .sh file, execute with env vars, then cleanup
  param(
    [string]$LocalScript,
    [hashtable]$Env = @{},
    [string]$RemoteDir,
    [int]$Timeout = 600
  )
  $leaf = Split-Path -Leaf $LocalScript
  $rPath = "$RemoteDir/$leaf"
  Upload-File $LocalScript $RemoteDir

  # Build env prefix command
  $envPrefix = ($Env.GetEnumerator() | ForEach-Object {
      $k = $_.Key; $v = $_.Value.Replace("'", "'\\''")
      "$k='$v'"
    }) -join ' '

  $cmd = ('sed -i ''s/\r$//'' ''{0}''; chmod +x ''{0}''; {1} bash ''{0}''; EXIT_CODE=$?; rm -f ''{0}''; exit $EXIT_CODE' -f $rPath, $envPrefix)
  $out = Invoke-Remote $cmd -Timeout $Timeout
  return $out
}

# ═══════════════════════════════════════════════════════════════════
#  UTILITY
# ═══════════════════════════════════════════════════════════════════
function Require-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "Command '$name' tidak ada di PATH." }
}
function Get-Port([string]$bind) { if ($bind -match ':(\d+)$') { return $Matches[1] }; return '8787' }
function New-RandPass([int]$n = 20) {
  $c = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return -join ((1..$n) | ForEach-Object { $c[(Get-Random -Max $c.Length)] })
}
function New-RandHex([int]$bytes = 32) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $buf = [byte[]]::new($bytes); $rng.GetBytes($buf)
  return [System.BitConverter]::ToString($buf).Replace('-', '').ToLower()
}
function Escape-Sq([string]$s) { $s.Replace("'", "'\\''") }

# ═══════════════════════════════════════════════════════════════════
#  BOOTSTRAP
# ═══════════════════════════════════════════════════════════════════
Init-Theme

if (-not $PackageOnly) {
  # Install Posh-SSH if needed
  if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
    Write-Host "  Installing Posh-SSH..." -ForegroundColor Yellow -NoNewline
    if (-not (Get-PackageProvider NuGet -ErrorAction SilentlyContinue | Where-Object { $_.Version -ge '2.8.5.201' })) {
      Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
    }
    Install-Module Posh-SSH -Scope CurrentUser -Force -AllowClobber -Repository PSGallery | Out-Null
    Write-Host " $($Script:Theme.Ok)" -ForegroundColor Green
  }
  Import-Module Posh-SSH -WarningAction SilentlyContinue -ErrorAction Stop
}
Require-Command bun
Require-Command tar

# Paths
$DeployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjRoot = Split-Path -Parent $DeployDir
$LibDir = Join-Path $DeployDir 'lib'
$ProdsDir = Join-Path $DeployDir 'productions'
$ProdFront = Join-Path $ProdsDir 'frontend'
$ProdBack = Join-Path $ProdsDir 'backend'
$ProdInst = Join-Path $ProdsDir 'installer'
$TmpDir = Join-Path $DeployDir 'tmp'
$ArchivePath = Join-Path $TmpDir 'ypanel-bundle.tar.gz'
$RunPath = Join-Path $TmpDir 'ypanel-installer.run'
$PanelPort = Get-Port $BindAddress

foreach ($d in @($ProdsDir, $ProdFront, $ProdBack, $ProdInst, $TmpDir, $LibDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory $d -Force | Out-Null }
}

if (-not $PackageOnly) {
  # Password
  if ([string]::IsNullOrWhiteSpace($SshPassword)) {
    $sec = Read-Host 'Password SSH/sudo server' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $SshPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  $SudoPass = $SshPassword
  $secPass = ConvertTo-SecureString $SshPassword -AsPlainText -Force
  $Script:Cred = New-Object System.Management.Automation.PSCredential($SshUsername, $secPass)
}

# Secrets
if ([string]::IsNullOrWhiteSpace($EncryptionKey)) { $EncryptionKey = New-RandHex 32 }
$HasExplicitDatabaseDSN = -not [string]::IsNullOrWhiteSpace($DatabaseDSN)

# ═══════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════
banner

try {

  # ── STEP 1: Build frontend ─────────────────────────────────────
  if (-not $SkipFrontendBuild) {
    step 'Build frontend (bun)'
    $bo = & cmd /c "cd /d `"$ProjRoot`" && bun run build 2>&1"
    if ($LASTEXITCODE -ne 0) { throw 'bun run build gagal.' }
    $sum = (($bo -split "`n" | Where-Object { $_ -match 'built in' } | Select-Object -Last 1) | ForEach-Object { $_.Trim() })
    ok $(if ($sum) { $sum } else { 'bun build OK' })
  }

  # ── STEP 2: Bundle productions ────────────────────────────────
  step 'Menyiapkan bundle productions'

  $distDir = Join-Path $ProjRoot 'dist'
  if (-not (Test-Path $distDir)) { throw "dist/ tidak ditemukan. Jalankan bun run build terlebih dahulu." }

  if (Test-Path $ProdFront) { Remove-Item "$ProdFront\*" -Recurse -Force -ErrorAction SilentlyContinue }
  Copy-Item "$distDir\*" $ProdFront -Recurse -Force

  if (-not $OnlyFrontend) {
    if (Test-Path $ProdBack) { Remove-Item "$ProdBack\*" -Recurse -Force -ErrorAction SilentlyContinue }
    foreach ($item in @('go.mod', 'go.sum', 'cmd', 'internal', 'main.go')) {
      $s = Join-Path $ProjRoot $item
      if (Test-Path $s) { Copy-Item $s $ProdBack -Recurse -Force }
    }
    if (Test-Path $ProdInst) { Remove-Item "$ProdInst\*" -Recurse -Force -ErrorAction SilentlyContinue }
    $srcInst = Join-Path $ProjRoot 'installer\linux'
    if (Test-Path $srcInst) { Copy-Item "$srcInst\*" $ProdInst -Recurse -Force }
  }

  $sizeMB = [math]::Round(((Get-ChildItem $ProdsDir -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
  ok "bundle ${sizeMB}MB"

  # ── STEP 3: Create installer .run ────────────────────────────
  if (-not $OnlyFrontend) {
    step 'Buat installer Linux (.run)'
    if (Test-Path $ArchivePath) { Remove-Item $ArchivePath -Force }
    if (Test-Path $RunPath) { Remove-Item $RunPath     -Force }

    Push-Location $ProdsDir
    try { & tar -czf $ArchivePath . 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'tar gagal.' } }
    finally { Pop-Location }

    $payloadB64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($ArchivePath))

    $selfExtract = @'
#!/usr/bin/env bash
set -euo pipefail
WORK=$(mktemp -d /tmp/ypanel.XXXXXX)
trap 'rm -rf $WORK' EXIT
awk 'found{print}/^__ARCHIVE__$/{found=1;next}' "$0" | base64 -d > "$WORK/payload.tar.gz"
tar -xzf "$WORK/payload.tar.gz" -C "$WORK"
cd "$WORK"
[ -d frontend ] && mv frontend dist
[ -d backend  ] && { cp -r backend/* . 2>/dev/null||true; rm -rf backend; }
mkdir -p installer/linux
if [ -d installer ] && [ ! -f installer/linux/install.sh ]; then
  find installer -maxdepth 1 -type f -exec cp {} installer/linux/ \;
fi
find installer -name '*.sh' -exec sed -i 's/\r$//' {} +
chmod +x installer/linux/install.sh installer/linux/uninstall.sh 2>/dev/null||true
bash installer/linux/install.sh
exit 0
__ARCHIVE__
'@
    $content = ($selfExtract -replace "`r`n", "`n") + "`n" + $payloadB64 + "`n"
    [System.IO.File]::WriteAllText($RunPath, $content, (New-Object System.Text.UTF8Encoding($false)))
    $runMB = [math]::Round((Get-Item $RunPath).Length / 1MB, 1)
    ok "installer ${runMB}MB"

    if ($PackageOnly) {
      $ReleaseDir = Join-Path $ProjRoot 'dist-release'
      if (-not (Test-Path $ReleaseDir)) { New-Item -ItemType Directory -Path $ReleaseDir | Out-Null }
      $ReleaseInstaller = Join-Path $ReleaseDir 'ypanel-installer.run'
      Copy-Item $RunPath $ReleaseInstaller -Force
      Write-Host "`n  Installer artifact: $ReleaseInstaller`n" -ForegroundColor Cyan
      return
    }
  }

  # ── STEP 4: SSH connect ───────────────────────────────────────
  step 'Koneksi SSH'
  $sess = New-SSHSession -ComputerName $HostName -Credential $Script:Cred `
    -AcceptKey -Force -WarningAction SilentlyContinue 3>$null 4>$null 5>$null 6>$null
  if (-not $sess) { throw 'Gagal buka koneksi SSH.' }
  $Script:SessId = $sess.SessionId
  ok "terhubung ke $HostName"

  # ── STEP 5: Sudo check ────────────────────────────────────────
  step 'Verifikasi sudo'
  $escSudo = Escape-Sq $SudoPass
  Invoke-Remote "printf '%s\n' '$escSudo' | sudo -S -p '' true" | Out-Null
  ok 'sudo OK'

  # ── Resolve remote base dir ───────────────────────────────────
  $lines = Invoke-Remote "mkdir -p $RemoteBaseDir && cd $RemoteBaseDir && pwd"
  $RemBase = ($lines | Select-Object -Last 1).Trim()
  if (-not $RemBase) { throw 'Gagal resolve remote dir.' }

  $OldEnv = @{}
  $envReadCmd = "printf '%s\n' '$escSudo' | sudo -S -p '' sh -c 'cat $ENV_FILE 2>/dev/null; cat /etc/ui-panel/agent.env 2>/dev/null; true'"
  $envLines = Invoke-Remote $envReadCmd -AllowFail
  foreach ($envLine in $envLines) {
    if ($envLine -match '^([A-Z0-9_]+)=(.*)$') { $OldEnv[$Matches[1]] = $Matches[2] }
  }
  $IsNew = ($OldEnv.Count -eq 0)

  if (-not $IsNew -and $OldEnv.ContainsKey('PANEL_ENCRYPTION_KEY') -and $OldEnv['PANEL_ENCRYPTION_KEY']) {
    $EncryptionKey = $OldEnv['PANEL_ENCRYPTION_KEY']
  }
  if (-not $HasExplicitDatabaseDSN -and $OldEnv.ContainsKey('PANEL_DATABASE_DSN') -and $OldEnv['PANEL_DATABASE_DSN']) {
    $DatabaseDSN = $OldEnv['PANEL_DATABASE_DSN']
    $HasExplicitDatabaseDSN = $true
  }
  if ($HasExplicitDatabaseDSN) {
    step 'PostgreSQL (DSN existing/manual)'
    ok 'Menggunakan DSN existing/manual'

    if ($DatabaseDSN -match '^postgres(?:ql)?://[^:]+:([^@]+)@127\.0\.0\.1:5432/serverpanel') {
      $pgExistingPass = [System.Uri]::UnescapeDataString($Matches[1])
      $escPgExistingPass = Escape-Sq $pgExistingPass
      $alterCmd = "printf '%s\n' '$escSudo' | sudo -S -p '' sudo -u postgres psql -c `"ALTER USER panel_user WITH PASSWORD '$escPgExistingPass';`" >/dev/null"
      Invoke-Remote -Cmd $alterCmd | Out-Null
    }
  }

  if ($OnlyFrontend) {
    step "Upload frontend (${sizeMB}MB)"
    Upload-File $ProdFront $RemBase
    ok 'upload OK'

    step 'Update frontend di server'
    $frontLib = Join-Path $LibDir 'remote_frontend_update.sh'
    if (-not (Test-Path $frontLib)) { throw "lib/remote_frontend_update.sh tidak ditemukan." }
    $fOut = Run-RemoteScript -LocalScript $frontLib -RemoteDir $RemBase -Timeout 60 -Env @{
      SUDO_PASS         = $SudoPass
      REMOTE_FRONT_DIR  = "$RemBase/frontend"
      INSTALL_FRONT_DIR = "$INSTALL_DIR/frontend"
      PANEL_USER        = $PANEL_USER
      SERVICE_NAME      = $SVC_NAME
    }
    if ($fOut -contains 'FRONT_OK') { ok 'Frontend diperbarui' } else { warn 'Perlu restart manual' }

    summary "http://${HostName}:$PanelPort" -NewInstall $false
    return
  }

  if (-not $HasExplicitDatabaseDSN) {
    step 'Setup PostgreSQL'
    $pgPass = New-RandPass 24
    $pgLib = Join-Path $LibDir 'remote_pg_setup.sh'
    if (-not (Test-Path $pgLib)) { throw "lib/remote_pg_setup.sh tidak ditemukan." }

    $pgOut = Run-RemoteScript -LocalScript $pgLib -RemoteDir $RemBase -Timeout 300 -Env @{
      SUDO_PASS = $SudoPass
      PG_USER   = 'panel_user'
      PG_DBNAME = 'serverpanel'
      PG_PASS   = $pgPass
    }

    if ($pgOut -notcontains 'PG_READY') { throw 'Setup PostgreSQL gagal.' }
    $DatabaseDSN = "postgres://panel_user:${pgPass}@127.0.0.1:5432/serverpanel?sslmode=disable"
    $HasExplicitDatabaseDSN = $true
    ok "PostgreSQL ready"
  }

  $serverIPs = Invoke-Remote "hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]' | head -5 || true" -AllowFail
  $allHosts = (@($serverIPs) + @('localhost', '127.0.0.1', $HostName)) | Where-Object { $_ } | Select-Object -Unique
  $allOrigins = $allHosts | ForEach-Object { "http://${_}:$PanelPort" }

  $envContent = @(
    "PANEL_BIND_ADDR=$BindAddress",
    "PANEL_DB_ENABLED=true",
    "PANEL_DATABASE_DSN=$DatabaseDSN",
    "PANEL_ENCRYPTION_KEY=$EncryptionKey",
    "PANEL_STATE_DIR=$STATE_DIR",
    "PANEL_FRONTEND_DIR=$INSTALL_DIR/frontend",
    "PANEL_SESSION_TTL=12h",
    "PANEL_ALLOWED_HOSTS=$($allHosts -join ',')",
    "PANEL_ALLOWED_ORIGINS=$($allOrigins -join ',')"
  )

  $localEnvTmp = Join-Path $TmpDir 'ypanel_env_upload.txt'
  [System.IO.File]::WriteAllLines($localEnvTmp, $envContent, (New-Object System.Text.UTF8Encoding($false)))

  $remEnvTmp = "$RemBase/ypanel_env_content"
  Upload-File $localEnvTmp $RemBase
  Invoke-Remote "mv '$RemBase/ypanel_env_upload.txt' '$remEnvTmp' 2>/dev/null || true" -AllowFail | Out-Null



  $runMB2 = [math]::Round((Get-Item $RunPath).Length / 1MB, 1)
  step "Upload installer (${runMB2}MB)"
  Upload-File $RunPath $RemBase
  ok 'upload OK'

  step 'Instalasi panel di server'
  $remInstaller = "$RemBase/ypanel-installer.run"
  $remLog = "$RemBase/install.log"
  $instLib = Join-Path $LibDir 'remote_install.sh'
  if (-not (Test-Path $instLib)) { throw "lib/remote_install.sh tidak ditemukan." }

  $instOut = Run-RemoteScript -LocalScript $instLib -RemoteDir $RemBase -Timeout 1200 -Env @{
    SUDO_PASS            = $SudoPass
    INSTALLER_PATH       = $remInstaller
    PANEL_BIND_ADDR      = $BindAddress
    PANEL_DATABASE_DSN   = $DatabaseDSN
    PANEL_ENCRYPTION_KEY = $EncryptionKey
    PANEL_STATE_DIR      = $STATE_DIR
    PANEL_FRONTEND_DIR   = "$INSTALL_DIR/frontend"
    ENV_CONTENT_FILE     = $remEnvTmp
    LOG_PATH             = $remLog
  }

  if ($instOut -notcontains 'INSTALLER_OK') {
    $log = Invoke-Remote "tail -n 60 '$remLog' 2>/dev/null || true" -AllowFail
    throw "Installer gagal.`n$($log -join "`n")"
  }
  ok 'Instalasi selesai'

  step 'Konfigurasi env & restart service'
  $svcLib = Join-Path $LibDir 'remote_svc_config.sh'
  if (-not (Test-Path $svcLib)) { throw "lib/remote_svc_config.sh tidak ditemukan." }

  $svcOut = Run-RemoteScript -LocalScript $svcLib -RemoteDir $RemBase -Timeout 60 -Env @{
    SUDO_PASS        = $SudoPass
    ENV_FILE         = $ENV_FILE
    ENV_CONTENT_FILE = $remEnvTmp
    SERVICE_NAME     = $SVC_NAME
    PANEL_USER       = $PANEL_USER
  }
  Remove-Item $localEnvTmp -Force -ErrorAction SilentlyContinue

  step 'Menjalankan migrasi database'
  $migrationCmd = "env PANEL_ENV_FILE='$ENV_FILE' /usr/local/bin/ypanel-agent migrate up"
  $migrationOut = Invoke-Remote $migrationCmd -AllowFail
  $migrationText = ($migrationOut -join "`n").Trim()
  if ($Script:LastErr.Count -gt 0 -or [string]::IsNullOrWhiteSpace($migrationText)) {
    throw "Migrasi database gagal.`n$($migrationOut -join "`n")`n$($Script:LastErr -join "`n")"
  }
  ok ($migrationText -split "`n" | Select-Object -Last 1)

  if ($svcOut -contains 'SERVICE_FAIL') { warn 'Service gagal start — cek: journalctl -u ypanel -n 50' }
  else { ok 'Service berjalan' }

  step 'Healthcheck'
  $hc = Invoke-Remote "curl -fsS http://127.0.0.1:$PanelPort/healthz 2>&1 || echo HC_FAIL" -AllowFail
  $hcStr = ($hc -join '').Trim()
  if ($hcStr -match 'HC_FAIL|curl.*failed') { warn "Healthcheck gagal: $hcStr" }
  else { ok $hcStr }

  summary "http://${HostName}:$PanelPort" -NewInstall $IsNew
}
catch {
  $msg = $_.Exception.Message
  if ($msg -like 'Remote command gagal*' -and (@($Script:LastOut) + @($Script:LastErr)).Count -gt 0) {
    $extra = (@($Script:LastOut) + @($Script:LastErr) | ForEach-Object { strip $_ } | Where-Object { $_ } | Select-Object -Unique -First 5)
    if ($extra) { $msg += ' | ' + ($extra -join ' | ') }
  }
  err $msg
  exit 1
}
finally {
  if ($Script:SessId -and (Get-Command Get-SSHSession -ErrorAction SilentlyContinue)) {
    Get-SSHSession -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-SSHSession -SessionId $_.SessionId -ErrorAction SilentlyContinue | Out-Null }
  }
  $SudoPass = $null; $SshPassword = $null
}


