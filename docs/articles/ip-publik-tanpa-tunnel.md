# Melayani domain langsung dari IP publik (tanpa tunnel)

Reneo dibuat untuk home lab, jadi cara bawaannya adalah Cloudflare Tunnel: tidak ada port yang dibuka ke internet. Bila server Anda punya **IP publik**, atau router Anda meneruskan port 80 dan 443, ada cara kedua: server melayani domain sendiri dan menerbitkan sertifikat HTTPS sendiri lewat Let's Encrypt. Tidak perlu Cloudflare, tidak ada kuota, dan jumlah domain tidak dibatasi.

## Kapan cocok

- Server (VPS atau mesin di rumah) punya IP publik, atau router bisa meneruskan port 80 dan 443 ke mesin ini.
- Anda tidak ingin bergantung pada Cloudflare untuk domain tertentu.

Tidak cocok bila penyedia internet memakai **CGNAT** (tidak ada IP publik dan port tidak bisa diteruskan). Di sana tetap pakai Cloudflare Tunnel; mode ini tidak mengubahnya.

## Cara memakai

1. Buka **Pengaturan > IP publik** dan tekan **Cek alamat publik**. Panel menunjukkan alamat yang dilihat internet, dan apakah alamat itu milik mesin ini. Bila bukan, teruskan port 80 dan 443 ke mesin ini di router.
2. Nyalakan **Layani domain langsung**. Panel meminta Anda **mengonfirmasi** bahwa server ini memiliki IP publik (atau port 80 dan 443 sudah diteruskan ke sini); tanpa konfirmasi itu proxy tidak menyala, dan siapa yang mengonfirmasi serta kapan tercatat. Setelah itu panel membuka port 80 dan 443. Bila port itu dipakai server web lain (nginx atau Apache), panel menyebut port mana yang bentrok dan tetap mati.
3. Tekan **Tambah domain**: isi domain, pilih tujuannya (panel, proyek, atau port di mesin ini), dan simpan.
4. Di DNS domain Anda, buat **A record** yang mengarah ke alamat publik server (AAAA bila IPv6).
5. Tekan ikon **Cek** di baris domain. Panel meminta sertifikat **uji** dari Let's Encrypt lebih dulu, sehingga kesalahan DNS atau port ketahuan tanpa menghabiskan batas layanan asli. Bila lulus, sertifikat asli terbit otomatis saat domain pertama kali dibuka, dan diperpanjang sendiri.

## Tujuan domain

| Tujuan | Isi |
| :--- | :--- |
| Panel | Halaman login Reneo di domain itu. Pastikan kata sandi kuat. |
| Proyek | Sebuah proyek Reneo (statis, Node.js, Python, PHP, custom), mengikuti port proyek itu. |
| Port | Layanan web di `127.0.0.1:<port>`, misalnya container Docker. Layanannya tidak perlu dibuka ke internet. |

## Yang perlu diketahui

- Hanya domain yang Anda daftarkan yang dilayani dan boleh meminta sertifikat. Domain lain mendapat 404.
- Semua yang dilayani tetap terikat ke `127.0.0.1`; hanya proxy yang terbuka di port web.
- Sertifikat disimpan di `public-tls/` di folder state Reneo. Mengganti email Let's Encrypt memulai ulang proxy.
- Port bawaan adalah 80 dan 443. Untuk memakai port lain (misalnya di belakang firewall yang mengalihkan), isi `PANEL_PUBLIC_HTTP_ADDR` dan `PANEL_PUBLIC_HTTPS_ADDR` di `/etc/reneo/agent.env`, lalu mulai ulang Reneo.
- Buka port 80 dan 443 di firewall server (`ufw allow 80,443/tcp`). Port 80 dipakai Let's Encrypt untuk memeriksa domain dan untuk mengalihkan ke HTTPS.

## Bila gagal

| Gejala | Penyebab | Yang dilakukan |
| :--- | :--- | :--- |
| Proxy tidak mau menyala dan menyebut port | Port 80 atau 443 dipakai nginx, Apache, atau yang lain | Hentikan server web itu, atau pakai port lain lewat `PANEL_PUBLIC_*_ADDR` dan arahkan firewall ke sana |
| Cek gagal: belum ada record DNS | A record belum dibuat atau belum menyebar | Buat A record ke alamat publik server, tunggu beberapa menit |
| Cek gagal dengan pesan dari Let's Encrypt | Port 80 atau 443 tidak terjangkau dari internet | Periksa firewall dan penerusan port di router; di belakang CGNAT mode ini tidak bisa dipakai |
| Domain terbuka tetapi "tidak menjawab" | Proyek atau layanan di port itu mati | Jalankan proyeknya, atau periksa port di tujuan domain |
