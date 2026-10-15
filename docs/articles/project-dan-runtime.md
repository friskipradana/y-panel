# Project dan runtime yang didukung

Window **Projects** menjalankan aplikasi Anda sebagai proses di bawah akun Linux pemiliknya. Tipe yang tersedia:

- `static`: melayani folder dengan `index.html`. Opsi SPA fallback mengarahkan rute tak dikenal ke `index.html`.
- `nodejs`: `npm start` bila ada `package.json`, selain itu `node index.js`.
- `python`: `gunicorn app:app` bila gunicorn terpasang, selain itu `python3 app.py`.
- `php`: `php -S` pada port project.
- `custom`: `start.sh` di direktori kerja.

Aplikasi harus mendengarkan di port dari variabel lingkungan `PORT`. Tiap akun mendapat blok 100 port; port bebas pertama dipakai untuk project baru.

## Aturan

- Direktori kerja harus berada di dalam direktori home akun Anda. Superadmin dapat memakai lokasi lain kecuali direktori sistem.
- Proses hanya menerima environment minimal (`PATH`, `LANG`, `PORT`, `TZ`). Rahasia panel tidak diteruskan.
- Untuk container, gunakan window Docker. Untuk rute publik ke layanan yang sudah ada, gunakan Cloudflare Tunnels.
- Project yang melewati batas kuota akun ditolak dengan pesan jelas.

## Publikasi

Hubungkan project ke domain lewat **Tunnel** di kartu project; Reneo membuat rute Cloudflare ke port project.
