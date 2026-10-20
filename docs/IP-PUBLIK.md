# IP publik: proxy bawaan untuk server yang punya alamat publik

Catatan teknis. Panduan untuk pengguna ada di artikel resmi "Melayani domain langsung dari IP publik" (`docs/articles/ip-publik-tanpa-tunnel.md`).

## Tujuan

Reneo dibuat untuk home lab, jadi domain lewat Cloudflare Tunnel. Instalasi komunitas yang punya IP publik mendapat jalur kedua: agent sendiri mendengarkan port web, menerbitkan sertifikat Let's Encrypt, dan meneruskan ke yang berjalan di `127.0.0.1`. Mode ini mati bawaannya dan tidak mengubah apa pun untuk instalasi yang memakai tunnel.

## Bagian-bagiannya

- **`internal/publicproxy`**: pendengar port 80 (tantangan ACME dan pengalihan ke HTTPS) dan 443 (`autocert` dengan TLS-ALPN-01 dan HTTP-01, lalu `httputil.ReverseProxy`). Tidak tahu apa pun tentang database; ia menerima `Resolver(host) (Route, bool)`.
- **`internal/httpserver/public_proxy.go`**: pengaturan (`publicProxyEnabled`, `publicProxyEmail` di pengaturan situs), daur hidup (nyala, mati, nyala lagi setelah restart lewat `RestorePublicProxy`), cache rute 3 detik, dan API superadmin.
- **Tabel `public_routes`** (migrasi 33): domain unik, jenis (`panel`, `project`, `port`), proyek atau port tujuan, saklar, catatan, dan hasil pengecekan terakhir. Rute proyek ikut terhapus bersama proyeknya.
- **Tab Pengaturan > IP publik**: kartu status (saklar, email, alamat mesin, cek alamat publik) dan tabel domain dengan aksi cek, nyala atau mati, dan hapus.

## Keamanan

- **Konfirmasi superadmin.** Proxy hanya menyala setelah superadmin mengonfirmasi bahwa server memiliki IP publik atau penerusan port (`confirmPublicIp` di `PUT /api/v1/public-proxy`, wajib setiap kali dari mati ke nyala; di panel berupa dialog dengan kotak centang). Server menolak tanpa itu (400), mencatat siapa dan kapan (`publicProxyConfirmedBy` dan `publicProxyConfirmedAt`, juga di audit), dan `RestorePublicProxy` tidak pernah memulai proxy yang tidak punya konfirmasi.
- **Hanya domain terdaftar** yang meminta sertifikat (`HostPolicy` membaca rute yang menyala), jadi pihak lain tidak bisa memakai batas laju Let's Encrypt atau memenuhi disk dengan sertifikat.
- **Header penerusan hanya ditulis proxy.** `Forwarded`, `X-Forwarded-*`, `X-Real-IP`, `CF-Connecting-IP`, dan `True-Client-IP` dari pengunjung dibuang, lalu `X-Forwarded-For` dan `X-Real-IP` diisi alamat peer sebenarnya. Panel mempercayai header itu hanya dari peer loopback atau privat (`clientIP`), jadi pengunjung tidak bisa menyamar sebagai alamat lain.
- **Cookie sesi bertanda `Secure`** bila koneksinya HTTPS, langsung atau lewat proxy yang mengatakannya (`requestIsHTTPS`).
- Domain yang sudah menjadi alamat panel pembeli (lewat Cloudflare) ditolak; domain panel yang didaftarkan diterima `isHostAllowed`.
- Tujuan jenis port hanya `127.0.0.1`, dan port milik proxy sendiri ditolak. Pengaturan ini khusus superadmin, dan tiap perubahan tercatat di audit.
- Batas dasar: `ReadHeaderTimeout` 10 detik, `MaxHeaderBytes` 32 KB (80) dan 64 KB (443), `IdleTimeout` 60 dan 120 detik. Belum ada batas laju per alamat di proxy; panel tetap memakai batas lajunya sendiri.

## Pengecekan dengan layanan uji

Kegagalan validasi di Let's Encrypt asli dihitung (5 per jam per domain). Tombol Cek karena itu memakai **layanan uji (staging)** dengan manager `autocert` kedua dan cache terpisah: ia hanya mau mengurus domain yang sedang dicek, dan tantangan HTTP-01 dan TLS-ALPN-01 dijawab oleh pendengar yang sama (`pickCertificate` memilih manager). Sebelumnya, nama dicari di DNS: tanpa record, pesannya langsung menyebut itu.

## Alamat dan port

Bawaan `:80` dan `:443`; agent berjalan sebagai root di instalasi Linux, jadi tidak perlu `setcap`. `PANEL_PUBLIC_HTTP_ADDR` dan `PANEL_PUBLIC_HTTPS_ADDR` (atau `RENEO_*`) mengubahnya, misalnya ke port tinggi di belakang pengalihan firewall. Bila salah satu port tidak bisa dibuka, tidak ada yang tetap terikat dan pesannya menyebut port yang bentrok (nginx atau Apache yang sudah memakai 80 dan 443 adalah penyebab paling sering).

## Cek alamat publik

Tombol "Cek alamat publik" (`POST /api/v1/public-proxy/detect`) menanyakan alamat yang terlihat dari internet ke `https://1.1.1.1/cdn-cgi/trace`, hanya saat diminta, lalu membandingkannya dengan alamat milik mesin. Bila berbeda, alamat itu milik router atau penyedia: port harus diteruskan, dan CGNAT tidak bisa dipakai.

## Belum ada

- Domain per pembeli lewat jalur ini (pengganti Cloudflare for SaaS) dan A record otomatis lewat Cloudflare.
- Adapter nginx dan Apache (membuat konfigurasi vhost dan perintah certbot untuk instalasi yang sudah memakai port web itu).
- Sertifikat wildcard (HTTP-01 tidak mendukungnya).
