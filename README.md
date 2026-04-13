# 🌌 Homeserver Desktop OS

Panel kontrol server Linux dengan antarmuka bertema Desktop OS yang dibangun menggunakan **React 19** dan **Go**. Proyek ini dirancang untuk memberikan pengalaman mengelola server senyaman menggunakan desktop environment.

## 🚀 Fitur Utama

- **Desktop Experience**: Taskbar, Dock, Window management (drag/resize/minimize), dan wallpaper dinamis.
- **File Manager**: Kelola file server langsung dari browser dengan antarmuka mirip File Explorer.
- **Host Terminal**: Akses shell host Linux secara real-time menggunakan Xterm.js.
- **Database Manager**: Interface untuk mengelola database server.
- **System Monitoring**: Pantau log sistem (`journalctl`) dan status resource server.
- **App Store**: Interface untuk mengelola kontainer Docker/Portainer.

## 🛠️ Stack Teknologi

- **Frontend**: React 19, Vite, Tailwind CSS 4, Framer Motion, Zustand, TanStack Query.
- **Backend**: Go (Golang) - bertindak sebagai agent yang berinteraksi langsung dengan sistem host.
- **UI Components**: Lucide React (icons), Sonner (toasts), SweetAlert2 (dialogs).

## 📥 Instalasi

### Prasyarat
- Node.js (v20+)
- Go (v1.21+)
- Docker (untuk manajemen container)

### Jalankan di Pengembangan

1. Clone repositori:
   ```bash
   git clone <repo-url>
   cd ui-panel
   ```

2. Instal dependensi frontend:
   ```bash
   npm install
   # atau menggunakan bun
   bun install
   ```

3. Jalankan frontend (Vite):
   ```bash
   npm run dev
   ```

4. Jalankan backend agent (di folder `cmd` atau sesuai struktur Go kamu):
   ```bash
   go run cmd/agent/main.go
   ```

## 📦 Deployment

Proyek ini menyertakan script installer untuk sistem Linux.
```bash
sudo bash installer/linux/install.sh
```

## 📄 Lisensi
Private / Proprietary - Renaldi
