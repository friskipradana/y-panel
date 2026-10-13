# Linux Installer Guide

## Install

Jalankan dari root proyek:

```bash
sudo bash installer/linux/install.sh
```

Installer akan:
- cek root permission
- install package dasar
- install Docker bila belum ada
- install Go bila belum ada
- build `ypanel-agent`
- build frontend React
- menyalin frontend ke `/opt/ypanel/frontend`
- tulis konfigurasi `/etc/ypanel/agent.env`
- install `systemd` service `ypanel.service`
- install command terminal `ypanel`
- deploy Portainer container lokal-only

---

## File yang dibuat

- Binary agent: `/usr/local/bin/ypanel-agent`
- CLI helper: `/usr/local/bin/ypanel`
- Frontend bundle: `/opt/ypanel/frontend`
- Config: `/etc/ypanel/agent.env`
- Service: `/etc/systemd/system/ypanel.service`
- State: `/var/lib/ypanel`

---

## Verifikasi

```bash
systemctl status ypanel
journalctl -u ypanel -f
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

```bash`r`nypanel`r`n```

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

```bash`r`nypanel`r`n```

> [!WARNING]
> Script uninstall akan menghapus binary agent, frontend bundle, CLI helper, service, config, state, dan container Portainer yang dipasang oleh installer ini.


## Compatibility

Installer membuat alias sementara ui-panel dan ui-panel-agent yang menunjuk ke command baru ypanel dan ypanel-agent. Alias ini menjaga server existing tetap bisa memakai command lama selama fase transisi.

## Opsi installer

```bash
sudo bash ypanel-installer.run [opsi]
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
- Versi paket tersimpan di `/opt/ypanel/VERSION`. Log lengkap: `/tmp/ypanel-install.log`.

