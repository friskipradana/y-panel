# Mengaktifkan Cloudflare for SaaS untuk domain milik pembeli

Cloudflare for SaaS hanya dibutuhkan satu fitur Reneo: **pembeli memakai domainnya sendiri** (misalnya `toko-dewi.com`) sebagai alamat masuk panelnya. Subdomain panel (`dewi.reneo.my.id`), pesanan, paket, dan fitur lain tidak memerlukannya.

## Cara kerjanya

1. Anda menawarkan satu domain Anda, lalu memilihnya sebagai tujuan CNAME. Reneo membuat nama `cname.<domain-anda>` yang mengarah ke tunnel hosting.
2. Pembeli menambah domainnya di jendela Cloudflare dan mengarahkan CNAME domain itu ke `cname.<domain-anda>`.
3. Reneo mendaftarkan domain pembeli sebagai **custom hostname** di Cloudflare. Cloudflare memeriksa CNAME-nya dan menerbitkan sertifikat HTTPS.
4. Setelah aktif, domain itu menjadi alamat masuk milik pembeli, sama seperti subdomain panel.

Langkah 3 adalah Cloudflare for SaaS, dan itulah yang perlu diaktifkan di akun Anda.

## Yang perlu disiapkan

- Domain yang ditawarkan ada di akun Cloudflare yang tokennya terpasang di Reneo.
- Token punya izin **Zone · SSL and Certificates · Edit** (daftar lengkapnya ada di kartu "Domain milik pembeli").
- Tunnel hosting: Reneo membuatnya sendiri saat Anda menekan Setup, tidak perlu menjual alamat panel dulu.

## Mengaktifkan di Cloudflare

1. Buka dashboard Cloudflare, pilih zona yang akan menjadi tujuan CNAME.
2. Buka **SSL/TLS > Custom Hostnames**.
3. Aktifkan **Cloudflare for SaaS** di halaman itu. Cloudflare biasanya meminta metode pembayaran terdaftar. Menurut Cloudflare, paket Free, Pro, dan Business mendapat 100 custom hostname tanpa biaya, lalu ada tarif per hostname di atasnya. Tarif bisa berubah, jadi baca halaman harga Cloudflare sebelum memakainya untuk banyak pembeli.
4. Kembali ke Reneo, buka **Pengaturan > Hosting > Domain**, pilih domain itu di "Domain milik pembeli", lalu tekan **Setup**. Reneo membuat `cname.<domain>` dan menetapkannya sebagai *fallback origin* di Cloudflare.
5. Tekan **Verify** di kartu token. Baris SSL and Certificates harus bercentang.

## Bila muncul error 1404 ("No quota has been allocated")

Artinya token Anda sudah benar, tetapi akun atau zona belum diberi kuota Cloudflare for SaaS. Menambah izin di token tidak mengubahnya. Yang bisa dilakukan:

- Cek apakah **SSL/TLS > Custom Hostnames** di zona itu punya tombol untuk mengaktifkan, lalu aktifkan.
- Coba zona lain di akun yang sama: pilihan tujuan CNAME tidak terikat ke satu domain.
- Bila tidak ada pilihan mengaktifkannya, ajukan lewat formulir Cloudflare yang tertera di pesan error. Kuota diberikan oleh Cloudflare, bukan oleh Reneo.

Selama kuota belum ada, hanya domain milik pembeli yang tidak jalan. Sisanya tetap berfungsi.

## Masalah umum

| Gejala | Penyebab | Yang dilakukan |
| :--- | :--- | :--- |
| 403 atau tanda seru dengan jawaban `not allowed` | Token tidak punya izin SSL and Certificates | Tambah izinnya di token, lalu Verify lagi |
| `cname.<domain>` sudah dipakai record DNS lain | Ada record dengan nama itu yang bukan milik Reneo | Hapus atau ganti nama record tersebut di Cloudflare |
| Domain pembeli tetap `pending` | CNAME pembeli belum terdeteksi atau belum merambat | Pastikan CNAME mengarah ke `cname.<domain>`, tunggu beberapa menit |

## Tentang repositori cloudflare-saas-stack

[supermemoryai/cloudflare-saas-stack](https://github.com/supermemoryai/cloudflare-saas-stack) **bukan** panduan Cloudflare for SaaS, meski namanya mirip. Itu kerangka awal (*starter kit*) untuk membangun produk SaaS di atas Cloudflare: Next.js, Tailwind, ShadcnUI, database D1 lewat Drizzle, login NextAuth dengan Google, penyimpanan berkas R2, dan dipasang di Cloudflare Pages. README-nya tidak membahas custom hostname, fallback origin, kuota, atau sertifikat domain pelanggan.

Reneo tidak memakainya dan tidak perlu memakainya. Reneo sudah menjalankan bagian domain pembeli sendiri lewat API Cloudflare (`internal/cloudflare/custom_hostnames.go`): mendaftarkan custom hostname, menetapkan fallback origin, dan memantau status sertifikatnya. Repositori itu berguna bila Anda ingin belajar menyusun aplikasi SaaS di Cloudflare, bukan untuk mengaktifkan fitur ini.

Referensi resmi: [Cloudflare for SaaS, getting started](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/).
