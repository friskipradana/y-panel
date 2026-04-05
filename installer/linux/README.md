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
- build `ui-panel-agent`
- build frontend React
- menyalin frontend ke `/opt/ui-panel/frontend`
- tulis konfigurasi `/etc/ui-panel/agent.env`
- install `systemd` service `ui-panel.service`
- install command terminal `ui-panel`
- deploy Portainer container lokal-only

---

## File yang dibuat

- Binary agent: `/usr/local/bin/ui-panel-agent`
- CLI helper: `/usr/local/bin/ui-panel`
- Frontend bundle: `/opt/ui-panel/frontend`
- Config: `/etc/ui-panel/agent.env`
- Service: `/etc/systemd/system/ui-panel.service`
- State: `/var/lib/ui-panel`

---

## Verifikasi

```bash
systemctl status ui-panel
journalctl -u ui-panel -f
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/api/v1/bootstrap/status
```

---

## Portainer

Container Portainer dijalankan sebagai service pendukung internal:

- nama container: `ui-panel-portainer`
- bind: `127.0.0.1:9000`, `127.0.0.1:9443`
- frontend **tidak** mengakses Portainer langsung
- semua akses runtime seharusnya melewati Go agent

Cek status:

```bash
docker ps
docker logs -f ui-panel-portainer
curl http://127.0.0.1:9000/api/status
```

---

## CLI Menu

Setelah install, kamu bisa jalankan:

```bash
ui-panel
```

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

```bash
ui-panel
```

> [!WARNING]
> Script uninstall akan menghapus binary agent, frontend bundle, CLI helper, service, config, state, dan container Portainer yang dipasang oleh installer ini.
