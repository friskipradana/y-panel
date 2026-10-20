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

## Domain milik pembeli lewat server ini

Pengganti Cloudflare for SaaS untuk instalasi yang punya IP publik (`PublicBuyerDomains` dan `PublicProxyTarget` di pengaturan situs; kartu "Domain milik pembeli" di tab IP publik). Bila menyala dan proxy berjalan, domain baru pembeli memakai jalur ini (`provider = direct` di `hosting_custom_domains`, migrasi 34); domain yang sudah lewat Cloudflare tidak berubah, dan terowongan tidak pernah membawa domain `direct`.

1. **Bukti pemilik.** Tiap domain mendapat token. Pembeli membuat record TXT `_reneo-verify.<domain>` berisi `reneo-verify=<token>`. Selama record itu belum ditemukan, domain tidak dilayani dan tidak boleh meminta sertifikat: domain yang kebetulan sudah mengarah ke server ini milik yang mengarahkannya, bukan milik siapa pun yang pertama mengetik namanya.
2. **Arah DNS.** Setelah terbukti, domain harus menunjuk ke alamat tujuan (A, AAAA, atau CNAME ke nama yang mengarah ke sana); yang lain ditolak dengan alasan yang menyebut alamat yang ditemukan.
3. **Sertifikat.** Sertifikat uji dulu, lalu yang asli (`CheckDomain` dan `Obtain`). Kegagalan dicoba lagi paling cepat tiap 5 menit (kecuali pembeli menekan periksa ulang), dan pembacaan DNS dibatasi 15 detik per domain, jadi halaman yang memanggil terus tidak membanjiri DNS atau Let's Encrypt.
4. **Aktif.** Pembeli mendapat notifikasi. Domain menampilkan panel, dan hanya pemilik yang bisa masuk di alamat itu (`hostingHostOwner`); akun yang ditangguhkan tidak dilayani.

Catatan status disimpan sebagai kode (`txt-missing`, `dns-missing`, `dns-wrong:<ip>`, `cert-failed:<alasan>`) dan diterjemahkan di halaman. Rute proxy yang didaftarkan penjual tidak bisa bentrok dengan domain pembeli, dan sebaliknya.

## Siapa yang melayani: Reneo, nginx, atau Apache

Domain dan sertifikatnya sama apa pun pilihannya; yang berbeda hanya siapa yang mendengarkan port web dan siapa yang menulis konfigurasi (`publicEngine` di pengaturan situs, kartu "Siapa yang melayani domain" di tab IP publik; antarmukanya `publicEngine` di `public_engine.go`).

| Mesin | Port web | Sertifikat | Cocok untuk |
| :--- | :--- | :--- | :--- |
| **Reneo sendiri** (bawaan) | Dibuka agent | `autocert`, otomatis | Server yang port 80 dan 443-nya bebas |
| **nginx** | Dibuka nginx | `certbot` (webroot) | Server yang sudah memakai nginx di 80 dan 443 |
| **Apache** | Dibuka Apache | `certbot` (webroot) | Server yang sudah memakai Apache di 80 dan 443 |

**nginx dan Apache** (`internal/webserver`). Reneo tidak membuka port. Ia menulis satu file per domain (`reneo-<domain>.conf`, ditambah satu berkas peta websocket untuk nginx) di folder konfigurasi: `/etc/nginx/conf.d`, `/etc/apache2/sites-available` (dengan tautan di `sites-enabled`), atau `/etc/httpd/conf.d`. Folder itu bisa diganti lewat `PANEL_WEB_CONF_DIR`, `PANEL_WEB_ENABLED_DIR`, dan `PANEL_WEB_LIVE_DIR` untuk distribusi yang menyimpannya di tempat lain. Hanya file `reneo-*.conf` yang disentuh; sisa konfigurasi tidak pernah dibaca atau diubah.

- **Aman diterapkan.** Konfigurasi diuji dulu (`nginx -t`, `apachectl -t`) sebelum dimuat ulang. Bila ujinya gagal, semua file dikembalikan seperti semula (yang diubah ditulis ulang, yang baru dihapus, tautan dibersihkan), tidak ada reload, dan keluaran uji menjadi pesan galat yang tampil di panel. Tidak ada perubahan bila tidak ada yang berubah; ketidakcocokan port atau sertifikat diperiksa tiap 30 detik, dan perubahan rute ditulis setelah jeda 0,7 detik.
- **Sebelum ada sertifikat**, alamat polos domain hanya menjawab tantangan Let's Encrypt (`/.well-known/acme-challenge/`) dan 404 untuk yang lain. Setelah sertifikat ada, ia mengalihkan ke HTTPS dan sisi HTTPS meneruskan ke `127.0.0.1:<port>`, dengan header penerusan yang sama aturannya dengan proxy bawaan (yang dikirim pengunjung dibuang; `X-Forwarded-For` dan `X-Real-IP` diisi alamat peer), WebSocket, dan unggahan tanpa batas ukuran.
- **Sertifikat.** `certbot certonly --webroot` ke folder `acme` di folder state; tombol Cek memakai `--dry-run` (layanan uji), sertifikat asli memakai `--deploy-hook` yang memuat ulang web server, dan perpanjangan dikerjakan timer certbot sendiri. Reneo membaca sertifikat dari `/etc/letsencrypt/live/<domain>/`.
- **Syarat.** Web server dan `certbot` terpasang. Untuk Apache, modul `proxy`, `proxy_http`, `proxy_wstunnel`, `rewrite`, `headers`, `ssl`, dan `setenvif` harus aktif: di Debian atau Ubuntu Reneo mengaktifkannya dengan `a2enmod`, di tempat lain ia menyebut modul yang kurang. Bila ada yang kurang, proxy tidak menyala dan pesannya menyebut apa yang perlu dilakukan.
- **Mati.** File domain tetap di web server (domain tetap dilayani walau panel berhenti) dan ditulis ulang saat panel menyala lagi.
- Kebutuhan tiap mesin dan apakah port web bebas ditampilkan oleh `GET /api/v1/public-proxy/engines`; bila port dipakai nginx atau Apache, panel menyarankan memilih mesin itu.

## Cloudflare dan server sendiri, bersama atau sendiri-sendiri

| | Port dibuka | Untuk |
| :--- | :--- | :--- |
| Cloudflare Tunnel | Tidak ada | Domain proyek dan alamat panel (cara bawaan di home lab) |
| Cloudflare for SaaS | Tidak ada | Domain milik pembeli, bila akun penjual punya kuotanya |
| Server sendiri (Reneo, nginx, atau Apache) | 80 dan 443 | Domain penjual, dan domain milik pembeli tanpa Cloudflare for SaaS |

Semuanya bisa menyala bersamaan atau sendiri-sendiri. Saat jalur server dan Cloudflare for SaaS sama-sama siap, pembeli memilih cara menyambungkan domainnya di dialog tambah domain (jalur server menjadi bawaan); bila hanya satu yang siap, itu satu-satunya cara. Domain yang sudah tersambung tidak berpindah sendiri. Cloudflare juga bisa dipakai hanya untuk DNS: tombol "Buat record di Cloudflare" di baris domain membuat record A (AAAA, atau CNAME bila alamatnya nama) di zona yang memuat domain itu, tanpa proksi dan tidak pernah menimpa record lain (`POST /api/v1/public-proxy/routes/{id}/dns`).

## Belum ada

- Sertifikat wildcard (HTTP-01 tidak mendukungnya).
- Domain pembeli yang dilayani nginx atau Apache sudah memakai jalur yang sama, tetapi pemeriksaan DNS dan TXT dilakukan agent, bukan web server.
- Pemakaian nginx atau Apache sungguhan belum dicoba di mesin ini: konfigurasi dan alurnya diuji dengan perintah tiruan, jadi perilaku dengan nginx, Apache, dan certbot asli perlu dicoba di server Linux.
