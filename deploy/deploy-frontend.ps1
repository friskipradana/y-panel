#Requires -Version 5.1

<#
.SYNOPSIS
  Deploy cepat untuk frontend YPanel.

.DESCRIPTION
  Build frontend lokal, upload hasil dist ke server via SSH/SCP, lalu mengganti
  folder frontend instalasi YPanel di server. Script ini memakai path relatif
  project, kompatibel dengan parameter deploy utama, dan tidak lagi bergantung
  pada hard-coded drive lokal.

.EXAMPLE
  .\deploy\deploy-frontend.ps1 -HostName 100.70.209.107 -SshUsername root -SshPassword "password"

.EXAMPLE
  .\deploy\deploy-frontend.ps1 -HostName 100.70.209.107 -SshUser root -SshPassword "password"
#>

[CmdletBinding()]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingPlainTextForPassword', '')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseApprovedVerbs', '')]
param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [Alias('SshUser')]
  [string]$SshUsername = 'renaldi',

  [string]$SshPassword = '',
  [string]$RemoteBaseDir = '/root/ypanel-deploy',
  [string]$InstallFrontendDir = '/opt/ypanel/frontend',
  [string]$ServiceName = 'ypanel',
  [string]$PanelUser = 'root',
  [switch]$SkipFrontendBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$WarningPreference = 'SilentlyContinue'

function Write-Step([string]$Message) {
  Write-Host "`n> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' tidak ada di PATH."
  }
}

function Escape-Sq([string]$Value) {
  return $Value.Replace("'", "'\''")
}

function Invoke-Remote {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [int]$Timeout = 600
  )

  $result = Invoke-SSHCommand -SessionId $script:SessionId -Command $Command -TimeOut $Timeout `
    3>$null 4>$null 5>$null 6>$null

  $out = @($result.Output | ForEach-Object { if ($null -ne $_) { [string]$_ } })
  $err = @($result.Error | ForEach-Object { if ($null -ne $_) { [string]$_ } })

  if ($result.ExitStatus -ne 0) {
    $details = (@($out) + @($err) | Where-Object { $_ } | Select-Object -First 10) -join ' | '
    throw "Remote command gagal (exit $($result.ExitStatus))$(if ($details) { ': ' + $details })"
  }

  return $out
}

$deployDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $deployDir
$distDir = Join-Path $projectRoot 'dist'
$libUpdateScript = Join-Path $deployDir 'lib\remote_frontend_update.sh'
$script:SessionId = $null
$credential = $null

try {
  Require-Command bun

  if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
    Write-Step 'Menginstall module Posh-SSH'
    if (-not (Get-PackageProvider NuGet -ErrorAction SilentlyContinue | Where-Object { $_.Version -ge '2.8.5.201' })) {
      Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
    }
    Install-Module Posh-SSH -Scope CurrentUser -Force -AllowClobber -Repository PSGallery | Out-Null
  }
  Import-Module Posh-SSH -WarningAction SilentlyContinue -ErrorAction Stop

  if (-not $SkipFrontendBuild) {
    Write-Step 'Build frontend lokal'
    Push-Location $projectRoot
    try {
      bun run build
      if ($LASTEXITCODE -ne 0) { throw 'bun run build gagal.' }
    }
    finally {
      Pop-Location
    }
    Write-Ok 'Build selesai'
  }

  if (-not (Test-Path $distDir)) {
    throw "Folder dist tidak ditemukan: $distDir"
  }
  if (-not (Test-Path $libUpdateScript)) {
    throw "Script helper tidak ditemukan: $libUpdateScript"
  }

  if ([string]::IsNullOrWhiteSpace($SshPassword)) {
    $secureInput = Read-Host 'Password SSH/sudo server' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInput)
    try {
      $SshPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }

  $securePass = ConvertTo-SecureString $SshPassword -AsPlainText -Force
  $credential = New-Object System.Management.Automation.PSCredential($SshUsername, $securePass)

  Write-Step "Koneksi SSH ke ${SshUsername}@${HostName}"
  $session = New-SSHSession -ComputerName $HostName -Credential $credential -AcceptKey -Force `
    -WarningAction SilentlyContinue 3>$null 4>$null 5>$null 6>$null
  if (-not $session) { throw 'Gagal membuka koneksi SSH.' }
  $script:SessionId = $session.SessionId
  Write-Ok 'SSH terhubung'

  Write-Step 'Menyiapkan direktori remote'
  $escapedRemoteBaseDir = Escape-Sq $RemoteBaseDir
  $resolveRemoteCmd = "mkdir -p '$escapedRemoteBaseDir'; cd '$escapedRemoteBaseDir'; pwd"
  $remoteBase = (Invoke-Remote $resolveRemoteCmd | Select-Object -Last 1).Trim()
  if (-not $remoteBase) { throw 'Gagal resolve remote base directory.' }
  $remoteFrontendDir = "$remoteBase/frontend"
  $remoteDistDir = "$remoteBase/dist"
  $escapedRemoteFrontendDir = Escape-Sq $remoteFrontendDir
  $escapedRemoteDistDir = Escape-Sq $remoteDistDir
  Invoke-Remote "rm -rf '$escapedRemoteFrontendDir' '$escapedRemoteDistDir'; mkdir -p '$escapedRemoteFrontendDir' '$escapedRemoteDistDir'" | Out-Null
  Write-Ok $remoteBase

  Write-Step 'Upload dist frontend'
  Set-SCPItem -ComputerName $HostName -Credential $credential -Path $distDir -Destination $remoteBase `
    -AcceptKey -Force -WarningAction SilentlyContinue 3>$null 4>$null 5>$null 6>$null | Out-Null
  Write-Ok 'Upload selesai'

  Write-Step 'Upload dan jalankan updater frontend'
  Set-SCPItem -ComputerName $HostName -Credential $credential -Path $libUpdateScript -Destination $remoteBase `
    -AcceptKey -Force -WarningAction SilentlyContinue 3>$null 4>$null 5>$null 6>$null | Out-Null

  $remoteScript = "$remoteBase/remote_frontend_update.sh"
  $escapedRemoteScript = Escape-Sq $remoteScript
  $envPrefix = @(
    "SUDO_PASS='$(Escape-Sq $SshPassword)'",
    "REMOTE_FRONT_DIR='$(Escape-Sq $remoteFrontendDir)'",
    "INSTALL_FRONT_DIR='$(Escape-Sq $InstallFrontendDir)'",
    "PANEL_USER='$(Escape-Sq $PanelUser)'",
    "SERVICE_NAME='$(Escape-Sq $ServiceName)'"
  ) -join ' '

  $runUpdaterCmd = 'sed -i ''s/\r$//'' ''{0}''; chmod +x ''{0}''; {1} bash ''{0}''; rm -f ''{0}''' -f $escapedRemoteScript, $envPrefix
  $output = Invoke-Remote $runUpdaterCmd -Timeout 120
  $output | Where-Object { $_ } | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

  if ($output -notcontains 'FRONT_OK') {
    throw 'Updater frontend tidak mengembalikan FRONT_OK.'
  }

  Write-Ok "Frontend diperbarui di $InstallFrontendDir"
  Write-Host "`nDeploy frontend berhasil: http://${HostName}:8787" -ForegroundColor Cyan
}
finally {
  if ($script:SessionId -and (Get-Command Get-SSHSession -ErrorAction SilentlyContinue)) {
    Get-SSHSession -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-SSHSession -SessionId $_.SessionId -ErrorAction SilentlyContinue | Out-Null }
  }

  $SshPassword = $null
}
