param(
  [string]$HostName = '192.168.18.103',
  [string]$SshUser = 'renaldi',
  [string]$SshPassword = ''
)

$ErrorActionPreference = 'Stop'

# 1. Build lokal menggunakan bun
Write-Host "🚀 Memulai build frontend lokal..." -ForegroundColor Cyan
bun run build
if ($LASTEXITCODE -ne 0) { throw "Build gagal!" }

# 1.1 Zip folder dist
Write-Host "📦 Mengompres folder dist..." -ForegroundColor Yellow
$zipPath = "D:\Pekerjaan\Programing\React\homeserver-desktop\dist.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath }
Compress-Archive -Path "D:\Pekerjaan\Programing\React\homeserver-desktop\dist\*" -DestinationPath $zipPath

# 2. Persiapkan koneksi SSH
if ([string]::IsNullOrWhiteSpace($SshPassword)) {
    $secPwd = Read-Host 'Masukkan password SSH' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPwd)
    $SshPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$securePass = ConvertTo-SecureString $SshPassword -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential($SshUser, $securePass)

Write-Host "📡 Menghubungkan ke $HostName..." -ForegroundColor Yellow
$session = New-SSHSession -ComputerName $HostName -Credential $credential -AcceptKey -Force

try {
    # 3. Buat folder temporary di remote dan bersihkan jika sudah ada
    Write-Host "🧹 Membersihkan folder temporary di server..." -ForegroundColor Yellow
    Invoke-SSHCommand -SessionId $session.SessionId -Command "rm -rf /tmp/ui-panel-frontend-update && mkdir -p /tmp/ui-panel-frontend-update" | Out-Null

    # 4. Upload file zip dan script
    Write-Host "🚚 Mengupload dist.zip ke server..." -ForegroundColor Yellow
    # Kita arahkan ke direktori tujuannya saja, bukan full path filenya
    Set-SCPItem -ComputerName $HostName -Credential $credential -Path $zipPath -Destination "/tmp/ui-panel-frontend-update/" -Force
    Set-SCPItem -ComputerName $HostName -Credential $credential -Path "D:\Pekerjaan\Programing\React\homeserver-desktop\deploy\update-frontend.sh" -Destination "/tmp/ui-panel-frontend-update/" -Force

    # 5. Jalankan update dengan sudo
    Write-Host "⚙️  Menerapkan update di server..." -ForegroundColor Yellow
    $escapedPwd = $SshPassword.Replace("'", "'\''")
    # Pastikan 'unzip' terpasang
    $cmd = "printf '%s\n' '$escapedPwd' | sudo -S bash -c 'apt-get install -y unzip >/dev/null 2>&1 || true; bash /tmp/ui-panel-frontend-update/update-frontend.sh'"
    $result = Invoke-SSHCommand -SessionId $session.SessionId -Command $cmd
    
    Write-Host $result.Output -ForegroundColor Green
    Write-Host "✨ Berhasil! Frontend telah diperbarui." -ForegroundColor Cyan
}
finally {
    Remove-SSHSession -SessionId $session.SessionId | Out-Null
}
