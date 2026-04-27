param(
  [switch]$SkipFrontendBuild
)

$ErrorActionPreference = 'Stop'

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptPath
$DeployDir = Join-Path $ProjectRoot 'deploy'
$LibDir = Join-Path $DeployDir 'lib'
$BuildDir = Join-Path $DeployDir 'productions'
$FrontendDir = Join-Path $BuildDir 'frontend'
$BackendDir = Join-Path $BuildDir 'backend'
$InstallerDir = Join-Path $BuildDir 'installer'
$TmpDir = Join-Path $DeployDir 'tmp'
$ArchivePath = Join-Path $TmpDir 'ypanel-bundle.tar.gz'
$RunPath = Join-Path $TmpDir 'ypanel-installer.run'
$ReleaseDir = Join-Path $ProjectRoot 'dist-release'
$ReleaseInstaller = Join-Path $ReleaseDir 'ypanel-installer.run'

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' tidak ditemukan."
  }
}

Require-Command tar
if (-not $SkipFrontendBuild) {
  Require-Command bun
  Push-Location $ProjectRoot
  try { & bun run build; if ($LASTEXITCODE -ne 0) { throw 'bun run build gagal.' } }
  finally { Pop-Location }
}

foreach ($dir in @($BuildDir, $FrontendDir, $BackendDir, $InstallerDir, $TmpDir, $ReleaseDir)) {
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

$distDir = Join-Path $ProjectRoot 'dist'
if (-not (Test-Path $distDir)) { throw 'dist/ tidak ditemukan. Jalankan bun run build terlebih dahulu.' }

Remove-Item "$FrontendDir\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item "$distDir\*" $FrontendDir -Recurse -Force

Remove-Item "$BackendDir\*" -Recurse -Force -ErrorAction SilentlyContinue
foreach ($item in @('go.mod', 'go.sum', 'cmd', 'internal', 'main.go')) {
  $source = Join-Path $ProjectRoot $item
  if (Test-Path $source) { Copy-Item $source $BackendDir -Recurse -Force }
}

Remove-Item "$InstallerDir\*" -Recurse -Force -ErrorAction SilentlyContinue
$sourceInstaller = Join-Path $ProjectRoot 'installer\linux'
if (Test-Path $sourceInstaller) { Copy-Item "$sourceInstaller\*" $InstallerDir -Recurse -Force }

if (Test-Path $ArchivePath) { Remove-Item $ArchivePath -Force }
if (Test-Path $RunPath) { Remove-Item $RunPath -Force }

Push-Location $BuildDir
try { & tar -czf $ArchivePath .; if ($LASTEXITCODE -ne 0) { throw 'tar gagal.' } }
finally { Pop-Location }

$remoteInstall = Join-Path $LibDir 'remote_install.sh'
if (-not (Test-Path $remoteInstall)) { throw 'deploy/lib/remote_install.sh tidak ditemukan.' }

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
Copy-Item $RunPath $ReleaseInstaller -Force

$sizeMB = [math]::Round((Get-Item $ReleaseInstaller).Length / 1MB, 1)
Write-Host "Installer artifact: $ReleaseInstaller (${sizeMB}MB)"
