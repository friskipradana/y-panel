# Linux Installer Guide

## Instalasi satu baris

```bash
curl -fsSL https://install.reneo.my.id | sudo bash
```

Dengan opsi (setelah `--`):

```bash
curl -fsSL https://install.reneo.my.id | sudo bash -s -- --bind 0.0.0.0:8787 --yes
```

Mengunduh dulu untuk diperiksa (sha256 tersedia di halaman rilis sebagai `reneo-installer.run.sha256`):

```bash
wget https://github.com/friskipradana/y-panel/releases/latest/download/reneo-installer.run
sha256sum reneo-installer.run
sudo bash reneo-installer.run
```

Berkas `.run` aman dijalankan lewat pipe: ia membaca payload-nya dari stdin bila bukan berkas. Saat dipipe, installer berjalan non-interaktif dan memakai nilai default atau nilai terpasang.

## Install dari source


Jalankan dari root proyek:

```bash
sudo bash installer/linux/install.sh
```

Installer akan:
- cek root permission
- install package dasar
- install Docker bila belum ada
- install Go bila belum ada
- build `reneo-agent`
- build frontend React
- menyalin frontend ke `/opt/reneo/frontend`
- tulis konfigurasi `/etc/reneo/agent.env`
- install `systemd` service `reneo.service`
- install command terminal `reneo`
- deploy Portainer container lokal-only

---

## File yang dibuat

- Binary agent: `/usr/local/bin/reneo-agent`
- CLI helper: `/usr/local/bin/reneo`
- Frontend bundle: `/opt/reneo/frontend`
- Config: `/etc/reneo/agent.env`
- Service: `/etc/systemd/system/reneo.service`
- State: `/var/lib/reneo`

---

## Verifikasi

```bash
systemctl status reneo
journalctl -u reneo -f
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/api/v1/bootstrap/status
```

---

## Portainer

Container Portainer dijalankan sebagai service pendukung internal:

- nama container: `ypanel-portainer`
- bind: `127.0.0.1:9000`, `127.0.0.1:9443`
- frontend **tidak** mengakses Portainer langsung
- semua akses runtime seharusnya melewati Go agent

Cek status:

```bash
docker ps
docker logs -f ypanel-portainer
curl http://127.0.0.1:9000/api/status
```

---

## CLI Menu

Setelah install, kamu bisa jalankan:

```bash`r`nreneo`r`n```

Menu akan menampilkan info akses panel aktif di bagian atas, termasuk:
- bind address panel
- URL localhost panel
- URL network/IP panel
- hostname panel beserta port aktif

Menu yang tersedia:
- Restart Service
- Stop Service
- Reset Password Admin
- Reset Password Database
- Ubah Port Panel
- Uninstall

---

## Uninstall

```bash
sudo bash installer/linux/uninstall.sh
```

Atau dari menu:

```bash`r`nreneo`r`n```

> [!WARNING]
> Script uninstall akan menghapus binary agent, frontend bundle, CLI helper, service, config, state, dan container Portainer yang dipasang oleh installer ini.


## Compatibility

Installer membuat alias ui-panel dan ui-panel-agent yang menunjuk ke command baru reneo dan reneo-agent.

### Dari ypanel ke reneo

Reneo sebelumnya bernama YPanel. Pemasangan ulang di server lama otomatis:

- memindahkan `/opt/ypanel`, `/etc/ypanel`, dan `/var/lib/ypanel` ke `/opt/reneo`, `/etc/reneo`, dan `/var/lib/reneo`;
- meninggalkan symlink di lokasi lama, sehingga skrip dan konfigurasi cloudflared yang menyebut path lama tetap jalan;
- memasang `reneo.service` dengan `Alias=ypanel.service` dan menghapus unit lama;
- membuat `ypanel` dan `ypanel-agent` sebagai alias dari `reneo` dan `reneo-agent`;
- mempertahankan database, user database, DSN, cookie sesi, dan token API apa adanya.

Nama berkas rilis juga berganti: `reneo-installer.run`. Nama lama `ypanel-installer.run` tetap diunggah dengan isi yang sama, jadi tautan dan redirect lama tidak rusak.

### Variabel lingkungan

Setiap `PANEL_<NAMA>` bisa ditulis sebagai `RENEO_<NAMA>`; bila keduanya ada, `RENEO_` menang. Berlaku di `agent.env`, di shell saat menjalankan installer, dan di unit systemd.

| Variabel | Fungsi |
| :--- | :--- |
| `RENEO_BIND_ADDR`, `RENEO_DATABASE_DSN`, `RENEO_SESSION_SECRET`, ... | Alias dari `PANEL_*` |
| `RENEO_HOME` | Root instalasi (frontend, VERSION). Default `/opt/reneo`, lalu `/opt/ypanel` bila hanya itu yang ada |
| `RENEO_CONFIG_DIR` | Folder `agent.env`. Default `/etc/reneo`, lalu `/etc/ypanel` |
| `RENEO_STATE_DIR` | Folder data. Default `/var/lib/reneo`, lalu `/var/lib/ypanel` |
| `RENEO_SERVICE_NAME` | Nama unit systemd yang dipakai untuk log dan tool service |
| `RENEO_REPO_ROOT` | Hanya installer: lokasi paket yang diekstrak |

## Opsi installer

```bash
sudo bash reneo-installer.run [opsi]
```

| Opsi | Fungsi |
| :--- | :--- |
| `--bind ADDR` | Alamat bind panel, mis. `0.0.0.0:8787` |
| `-y`, `--yes` | Non-interaktif: pakai nilai terpasang/default tanpa bertanya |
| `--skip-start` | Pasang tanpa menjalankan atau me-restart service |
| `--no-color` | Matikan warna output |
| `-h`, `--help` | Bantuan |

Perilaku penting:

- Paket membawa binary agent statis `linux/amd64` dan `linux/arm64`, jadi Go tidak perlu dipasang di server. Go hanya dipasang bila arsitektur tidak tercakup.
- Pemasangan ulang di server yang sudah ada diperlakukan sebagai pembaruan: `agent.env` dicadangkan ke `agent.env.bak`, service di-restart, lalu installer menunggu `/healthz` merespons dan menampilkan log bila gagal.
- `PANEL_DATABASE_DSN` hanya dianggap disediakan bila datang dari lingkungan atau `agent.env`. Tanpa itu, PostgreSQL lokal dipasang dan disiapkan.
- Versi paket tersimpan di `/opt/reneo/VERSION`. Log lengkap: `/tmp/reneo-install.log`.

