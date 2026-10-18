# Uji Hosting di Server Nyata

Daftar langkah untuk mencoba seluruh alur jual hosting di server Anda: pembeli memesan, memilih subdomain, membayar, akunnya aktif otomatis, lalu masuk lewat alamat panelnya sendiri. Bagian terakhir menguji domain milik pembeli.

Bagian yang sudah diuji otomatis (database, pesanan, trial, pengingat, tampilan) tidak diulang di sini. Daftar ini hanya untuk yang bergantung pada Cloudflare, server nyata, dan perangkat pembaca notifikasi bank.

Perkiraan waktu: 45 menit, ditambah menunggu DNS dan sertifikat (biasanya beberapa menit).

## 0. Yang perlu disiapkan

| Kebutuhan | Keterangan |
| :--- | :--- |
| Akun Cloudflare | Dengan satu domain cadangan berstatus aktif. Jangan pakai domain produksi. |
| Domain kedua | Untuk uji domain sendiri (bagian 7). Boleh di penyedia DNS mana pun. |
| Reneo versi terbaru | Migrasi database harus sampai versi 20. Cek dengan `bun run db:migrate:status` (atau `panel-agent migrate status`); bila belum, jalankan `migrate up`. |
| Rekening untuk transfer uji | Dengan jumlah kecil. Pesanan termurah cukup, mis. paket Rp 10.000. |
| Pembaca notifikasi bank (opsional) | Aplikasi listener Android yang terdaftar di Pengaturan > Pembayaran. Tanpanya, pakai cara simulasi di bagian 5. |
| Dua peramban atau satu jendela samaran | Satu untuk superadmin, satu untuk pembeli. |

## 1. Token Cloudflare dan izinnya

Setiap pengguna memakai token dan akun Cloudflare miliknya sendiri. Panduan yang sama tampil di Pengaturan > Cloudflare (tombol "Lihat panduan izin token" bila token sudah tersimpan), dan tanda hijau muncul per izin setelah token diverifikasi.

Buat token di Cloudflare: **My Profile > API Tokens > Create Token > Create Custom Token**, lalu tambahkan izin berikut.

| Izin | Untuk siapa | Fungsi |
| :--- | :--- | :--- |
| Account · Cloudflare Tunnel · Edit | Semua | Membuat tunnel dan route |
| Zone · Zone · Read | Semua | Membaca daftar domain |
| Zone · DNS · Edit | Semua | Membuat record DNS (route, subdomain, alamat tujuan CNAME) |
| Zone · Single Redirect · Edit | Opsional | Hanya untuk fitur redirect |
| Zone · SSL and Certificates · Edit | **Superadmin penjual hosting** | Mendaftarkan domain milik pembeli (Custom Hostnames) |

Cakupan token:

- **Account Resources:** Include, pilih akun Cloudflare Anda.
- **Zone Resources:** Include, pilih "All zones", atau tiap domain yang Anda tawarkan ke pembeli. Domain yang tidak tercakup token tidak bisa dipilih.

Pembeli biasa cukup empat izin pertama, hanya untuk domain mereka sendiri. Izin SSL and Certificates hanya dibutuhkan superadmin.

Token hanya ditampilkan sekali oleh Cloudflare, jadi salin sebelum menutup halaman. Account ID ada di halaman utama domain, di kolom kanan bagian API.

**Langkah**

1. Buat token superadmin dengan lima izin di atas.
2. Pengaturan > Cloudflare: tempel token dan Account ID, simpan, lalu verifikasi.
3. Harapan: status "Aktif". Tiga izin wajib bertanda hijau. Izin "SSL and Certificates" bertanda hijau hanya bila Custom Hostnames sudah aktif (bagian 2); sebelum itu merah dan itu wajar.

## 2. Mengaktifkan Custom Hostnames

Hanya untuk domain sendiri (bagian 7). Boleh dilewati kalau fitur itu belum dicoba.

1. Dasbor Cloudflare > domain cadangan > **SSL/TLS > Custom Hostnames**.
2. Pilih "Enable Cloudflare for SaaS". Cloudflare bisa meminta metode pembayaran. Menurut dokumentasi Cloudflare saat ini 100 domain pertama gratis; pastikan di dasbor.
3. Kembali ke Pengaturan > Cloudflare dan verifikasi ulang. Tanda "SSL and Certificates" harus menjadi hijau.

## 3. Menyiapkan penjualan di panel superadmin

Semua di Pengaturan > Hosting. Kartu "Siap dijual" di atas halaman menunjukkan apa yang masih kurang; selesaikan sampai tidak ada yang wajib tersisa.

1. Nyalakan **Mode hosting**. Tiga paket contoh dibuat sekali.
2. Tab **Domain**: pilih domain cadangan dan tawarkan. Harapan: domain muncul di daftar "ditawarkan".
3. Tab **Paket**: buat atau ubah satu paket murah untuk uji.
   - Subdomain minimal 1.
   - Isi "Percobaan gratis (hari)", mis. 3, untuk uji trial.
   - Isi "Domain sendiri" minimal 1 bila ingin menguji bagian 7.
4. Tab **Pembayaran**:
   - Isi bank, nomor rekening, dan atas nama.
   - Nyalakan **Buka pemesanan mandiri**. Tombol tidak bisa disimpan aktif tanpa rekening.
   - **Aktifkan otomatis saat transfer cocok**: matikan dulu untuk uji manual (bagian 4), nyalakan untuk uji otomatis (bagian 5).
   - Atur batas waktu bayar bila perlu (bawaan 24 jam; untuk uji 1 jam cukup).
5. Pengaturan > Umum: pastikan halaman publik (landing) menyala.

Harapan: di halaman utama, kartu paket menampilkan tombol "Pesan {paket}" (dan "Coba gratis N hari" bila ada). Bila tombolnya masih "Salin pesan pemesanan", salah satunya belum terpenuhi: pemesanan mandiri mati, belum ada domain yang ditawarkan, atau mode hosting mati.

## 4. Pesan dan bayar secara manual

Dengan peramban kedua (belum masuk).

1. Buka halaman utama, tekan tombol pesan pada paket uji.
2. Di form: pilih nama subdomain.
   - Ketik nama yang sudah dipakai atau terlalu pendek: harus muncul keterangan "tidak tersedia" atau "tidak valid".
   - Ketik nama bebas: harus muncul "Nama ini tersedia" dan alamat lengkap `https://nama.domain`.
3. Isi nama pengguna, email, dan kata sandi, lalu buat pesanan.
4. Harapan di halaman pembayaran:
   - Total tepat (harga ditambah kode unik), bank, nomor rekening, atas nama, masing-masing bisa disalin.
   - Hitung mundur berjalan.
5. Coba masuk di `/login` dengan akun baru. Harapan: ditolak dengan pesan akun menunggu pembayaran (bukan "kata sandi salah").
6. Sebagai superadmin: Pengaturan > Hosting > **Pesanan**.
   - Pesanan tampil dengan status "Menunggu bayar".
   - Notifikasi "Pesanan hosting baru" masuk ke lonceng.
7. Transfer **jumlah persis** dari halaman pesanan, lalu tekan konfirmasi (centang) di tab Pesanan.
8. Harapan:
   - Halaman pesanan milik pembeli berganti ke "Akun aktif" sendiri dalam beberapa detik, menampilkan alamat panel.
   - Subdomain muncul di Pengaturan > Hosting > Alamat panel dengan status "Menunggu", lalu "Aktif" dalam beberapa menit.
   - Cloudflare: record CNAME `nama.domain` proxied menuju `<id>.cfargotunnel.com`, dan tunnel `reneo-hosting` dibuat.
   - Pembeli punya notifikasi "Akun aktif" di panel yang menyebut alamat masuknya.
9. Buka `https://nama.domain/login` dan masuk sebagai pembeli. Harapan: panel pembeli terbuka dan kuotanya sesuai paket.
10. Coba masuk sebagai akun lain di alamat itu. Harapan: ditolak (alamat hanya untuk pemiliknya).

Bila alamat tidak terbuka, lihat bagian 8.

## 5. Pembayaran otomatis

1. Pengaturan > Hosting > Pembayaran: nyalakan "Aktifkan otomatis saat transfer cocok".
2. Buat pesanan baru seperti bagian 4 (nama subdomain berbeda).
3. Transfer jumlah persis. Dua cara agar notifikasinya sampai ke Reneo:
   - **Listener Android:** daftarkan perangkat di Pengaturan > Pembayaran. Aplikasi harus mengirim kolom jumlah (`amountDetected`); tanpa itu notifikasi tersimpan tetapi tidak dicocokkan.
   - **Simulasi** (tanpa transfer asli), dengan kunci API perangkat yang sama:

     ```bash
     curl -X POST https://<alamat-panel>/api/v1/webhooks/notifications \
       -H "X-API-Key: <kunci perangkat>" -H "Content-Type: application/json" \
       -d '{"packageName":"com.bank","appName":"Bank","title":"Transfer masuk","text":"Terima Rp 10.123","amountDetected":"Rp 10.123"}'
     ```
4. Harapan: pesanan menjadi lunas tanpa tindakan Anda, akun aktif, subdomain dibuat, notifikasi "Pesanan terbayar" untuk admin dan "Akun aktif" untuk pembeli.
5. Pengujian negatif:
   - Jumlah lain (mis. selisih satu rupiah): pesanan tetap "Menunggu bayar".
   - Notifikasi yang sama dikirim dua kali: masa berlaku paket tidak bertambah dua kali.
   - Dua pesanan menunggu: masing-masing hanya cocok dengan totalnya sendiri.
6. Dengan "Aktifkan otomatis" mati: transfer yang cocok membuat pesanan berstatus "Perlu diperiksa" dan notifikasi "Pembayaran cocok, perlu konfirmasi" masuk; angka di tab Pesanan bertambah.

## 6. Perpanjangan, trial, dan pengingat

1. **Perpanjangan oleh pembeli:** masuk sebagai pembeli, buka Profil. Kartu "Paket hosting" menampilkan masa berlaku.
   - Tekan "Perpanjang paket": instruksi transfer muncul di kartu itu juga.
   - Tekan lagi: pesanan yang sama ditampilkan, bukan dibuat ganda.
   - Bayar: masa berlaku bertambah satu periode dari tanggal berakhir yang lama, dan notifikasi "Perpanjangan berhasil" masuk.
2. **Trial gratis:** di halaman utama, pilih "Coba gratis N hari" dengan nama pengguna baru.
   - Harapan: aktif seketika, subdomain dibuat, masa berlaku N hari.
   - Pesanan trial kedua dari alamat IP yang sama dalam sehari ditolak.
   - Bila "Percobaan menunggu persetujuan" menyala di tab Pembayaran, trial masuk antrean Pesanan.
3. **Trial upgrade oleh admin:** Pengguna > buka akun > "Trial upgrade paket", pilih paket lebih besar dan jumlah hari.
   - Selama trial: kuota dan batas subdomain mengikuti paket trial; baris akun menampilkan "Trial ... sampai ...".
   - "Akhiri trial": akun kembali ke paketnya dan masa berlakunya bertambah sebanyak waktu trial yang terpakai.
   - Untuk melihat habisnya trial tanpa menunggu, pakai "Akhiri trial". Trial yang habis sendiri (minimal 1 hari) diproses pemeriksa yang berjalan tiap 15 menit: akun kembali ke paketnya dan notifikasi "Trial paket selesai" masuk.
4. **Pengingat:** di Pengguna, buka akun uji, pilih paketnya, isi "Hari trial" dengan 2, lalu terapkan. Paket itu berakhir dalam 2 hari, jadi dalam 15 menit notifikasi "Paket hosting segera berakhir" masuk ke akun tersebut, satu kali saja (pengingat dikirim untuk paket yang berakhir dalam 3 hari).

## 7. Domain milik pembeli

Syarat: bagian 1 dan 2 selesai, paket pembeli punya "Domain sendiri" minimal 1.

1. Superadmin: Pengaturan > Hosting > **Domain**, kartu "Domain sendiri milik pembeli".
   - Pilih domain cadangan, tekan **Siapkan**.
   - Harapan: lencana "Siap" dan teks "Alamat tujuan CNAME pembeli: cname.<domain>".
   - Cloudflare: record `cname.<domain>` proxied menuju tunnel, dan fallback origin di SSL/TLS > Custom Hostnames menunjuk ke sana.
   - Bila gagal, pesan Cloudflare ditampilkan apa adanya (bagian 8).
2. Pembeli: jendela Cloudflare > panel "Domain sendiri" > **Tambah domain**.
   - Ketik domain kedua. Pemeriksa harus menolak bentuk salah (`https://x.com/`), domain di bawah domain yang kita jual, dan domain yang sudah terdaftar.
   - Domain valid: "Domain ini bisa ditambahkan", dan keterangan apakah CNAME sudah terdeteksi.
3. Di penyedia DNS domain kedua, buat `CNAME <domain> → cname.<domain cadangan>`. Untuk domain tanpa awalan (apex), pakai CNAME flattening atau ALIAS.
4. Harapan:
   - Status di panel berpindah dari "Menunggu" ke "Aktif" dalam beberapa menit (tekan ikon cek ulang untuk mempercepat). Notifikasi "Domain aktif" masuk.
   - `https://<domain kedua>/login` terbuka dengan HTTPS valid, dan hanya pemiliknya yang bisa masuk.
5. Hapus domain dari panel pembeli. Harapan: pendaftarannya hilang dari Cloudflare dan domain berhenti terbuka.
6. Tangguhkan akun pembeli (Pengguna > tangguhkan). Harapan: subdomain dan domain sendirinya berhenti dilayani; aktifkan lagi, keduanya kembali.

## 8. Notifikasi Telegram

Pengaturan > Notifikasi. Hanya superadmin yang melihatnya.

1. **Buat bot:** di Telegram buka @BotFather, kirim `/newbot`, ikuti pertanyaannya, lalu salin token. Tempel di kolom Token bot, nyalakan "Kirim lewat Telegram", simpan. Harapan: lencana "Siap" dan teks "token tersimpan untuk bot @nama". Token yang salah ditolak dengan pesan dari Telegram dan tidak disimpan.
2. **Sambungkan Telegram Anda:** di bagian Tujuan saya tekan "Sambungkan Telegram", tekan "Buka Telegram", lalu tekan Mulai pada bot. Harapan: dalam beberapa detik tampil "Tersambung" dan Telegram membalas pesan konfirmasi. Untuk grup, tambahkan bot ke grup lalu kirim `/start@namabot KODE` di grup.
3. **Uji kirim:** tekan "Uji kirim". Harapan: pesan tiba di Telegram dalam kurang dari satu detik, dan di tab Antrian muncul baris "Uji kirim" berstatus Terkirim.
4. **Kabar pesanan:** buat pesanan dari halaman utama. Harapan: "Pesanan baru" tiba di Telegram. Transfer yang cocok (dengan konfirmasi otomatis mati) memberi "Perlu diperiksa"; lunas memberi "Pesanan terbayar".
5. **Login gagal:** di jendela samaran masukkan kata sandi salah untuk akun Anda tiga kali. Harapan: setelah percobaan ketiga satu pesan "Peringatan keamanan" tiba; dua percobaan pertama tidak mengirim apa pun, dan percobaan berikutnya pada tingkat yang sama tidak menambah pesan.
6. **Perangkat baru:** masuk dengan browser atau jaringan yang belum pernah dipakai. Harapan: "Masuk dari perangkat baru" tiba. Login pertama sebuah akun tidak mengirim apa pun.
7. **Antrian:** blokir bot dari Telegram, picu satu peristiwa lagi, dan lihat di tab Antrian: pesan gagal dengan alasannya, dan penerima ditandai bot diblokir. Sambungkan ulang untuk menerima lagi. Tombol putar di barisnya mengirim ulang pesan yang gagal.
8. **Ambang:** di tab Ambang peringatan ubah satu ambang, simpan, dan lihat berlaku seketika; "Kembalikan bawaan" mengembalikannya.

Pastikan juga **tidak ada** pesan untuk satu percobaan login gagal, dan bahwa mematikan saklar kanal membatalkan pesan yang menunggu.

### 8a. WhatsApp (WAHA)

Perlu Docker di server dan akses internet untuk menarik image `devlikeapro/waha`. Runtime, banyak sesi, kode QR, memutus, dan menghapus akun sudah dibuktikan dengan container sungguhan (lihat NOTIFIKASI-KANAL.md bagian 14); yang belum: memindai QR dengan ponsel dan pengiriman pesan nyata.

1. **Nyalakan:** Pengaturan > Notifikasi > kartu WhatsApp (WAHA), nyalakan "Jalankan WAHA". Harapan: status "Memulai" sambil image diunduh (beberapa menit pertama kali), lalu "Berjalan" dengan engine GOWS, versi, dan jumlah sesi. Bila gagal, alasannya tampil di kartu (mis. Docker tidak terpasang atau image tak bisa ditarik).
2. **Pastikan tertutup:** `docker ps` menunjukkan container `reneo-waha` dengan port `127.0.0.1:...->3000`, bukan `0.0.0.0`. Kunci API tidak tampil di `docker inspect` argumen perintah, hanya sebagai variabel lingkungan.
3. **Sambungkan:** di kartu WhatsApp saya tekan "Sambungkan WhatsApp". Harapan: kode QR tampil dan berganti sendiri; pindai dari WhatsApp > Perangkat tertaut. Dalam beberapa detik status "Tersambung" dan nomor tampil tersamar. Nama sesi di WAHA: `<peran>-<nama pengguna>` huruf kecil.
4. **Uji kirim:** tekan "Kirim Pesan Uji". Harapan: pesan tiba di WhatsApp nomor itu (obrolan dengan diri sendiri) dengan judul tebal. Perlu diperiksa: apakah GOWS mengantar pesan ke nomor sendiri di versi WAHA yang terpasang; bila tidak, uji dengan nomor lain dan laporkan.
5. **Akun lain:** masuk sebagai admin atau user biasa; kartu "WhatsApp saya" ada di Profil (hanya kabar keamanan). Sambungkan dengan ponsel lain, dan pastikan sesi dan kode QR tidak terlihat dari akun lain. Akun demo tidak bisa menyambungkan.
6. **Putuskan:** tombol "Putuskan WhatsApp" mengeluarkan WhatsApp dari ponsel dan menghapus sesi. Mematikan WAHA menghentikan container tetapi sesi tetap tersimpan; menyalakan lagi tidak perlu memindai ulang.
7. **Jeda kirim:** pesan WhatsApp dikirim berjarak (1,5 detik antarpesan, 4 detik ke nomor yang sama) untuk mengurangi risiko nomor diblokir.

### 8b. WhatsApp Cloud (Meta) dan pesan untuk pembeli

Perlu akun Meta Business dengan nomor terdaftar. Bagian ini diuji dengan Meta tiruan, belum dengan Meta sungguhan.

1. **Siapkan:** Pengaturan > Notifikasi > WhatsApp Cloud: tempel Access token, Phone number ID, dan WhatsApp Business Account ID. Harapan: setelah simpan, tampil "Mengirim dari <nomor> (<nama terverifikasi>)". Token salah ditolak dengan pesan dari Meta dan tidak disimpan.
2. **Templat:** tekan "Buat templat yang belum ada". Harapan: status berubah ke Menunggu, lalu Disetujui dalam beberapa menit sampai jam. Templat yang Ditolak perlu dibaca alasannya di Meta Business Manager.
3. **Nomor penjual:** di kartu "Nomor WhatsApp Cloud saya" simpan nomor Anda lalu "Kirim Pesan Uji". Harapan: pesan tiba setelah templat `reneo_test` disetujui.
4. **Pembeli:** buka halaman pesanan. Harapan: kolom Nomor WhatsApp muncul dan wajib; nomor yang salah ditolak dengan alasan. Buat pesanan dengan nomor ponsel lain. Harapan: cara bayar tiba di nomor itu (dari sesi WAHA superadmin bila tersambung, atau lewat WhatsApp Cloud) dan, setelah pesanan dikonfirmasi, pesan "akun aktif" dengan alamat masuk.
5. **Batas:** pesanan berulang ke nomor yang sama tidak mengirim lebih dari tiga pesan sehari.

### 8c. Jawaban BERHENTI dan status pesan

1. **Telegram:** kirim `/stop` ke bot dari obrolan yang tersambung. Harapan: dalam beberapa detik bot membalas dihentikan dan semua saklar kabar di kartu "Telegram Pribadi Saya" mati. Kirim `/start` untuk menyalakannya lagi. Kalimat biasa yang memuat kata stop tidak mengubah apa pun.
2. **WhatsApp Cloud:** isi App secret, salin alamat callback dan verify token ke Meta (WhatsApp > Configuration), langgananlah `messages`. Harapan: Meta menerima alamatnya; status terkirim, dibaca, atau gagal tampil di baris antrean. Balas BERHENTI dari nomor pembeli: dibalas teks biasa dan pesan berikutnya ke nomor itu tidak dikirim; MULAI menyalakannya lagi.
3. **WAHA:** nyalakan ulang WAHA setelah memperbarui panel agar container dibuat dengan webhook. Balas BERHENTI dari nomor pembeli ke nomor sesi superadmin. Harapan: dibalas dan pesan berikutnya ke nomor itu tidak dikirim. Bila tidak ada reaksi, periksa log container (`docker logs reneo-waha`) untuk kegagalan menghubungi `host.docker.internal`, dan pastikan panel mendengarkan di alamat yang bukan `127.0.0.1`.

## 9. Bila ada yang gagal

| Gejala | Kemungkinan penyebab |
| :--- | :--- |
| Telegram menolak token | Token salah atau bot dihapus di BotFather; salin ulang tanpa spasi |
| Tautan Telegram tidak pernah selesai | Mulai belum ditekan pada bot yang benar, kode sudah lewat 10 menit, atau bot memakai webhook lain (getUpdates tidak bisa dipakai bersamaan dengan webhook) |
| Pesan tertahan di Antrian berstatus Menunggu | Kanal mati, atau Telegram sedang gagal dan pesan menunggu percobaan ulang (5 detik, 30 detik, 5 menit, 30 menit, 2 jam) |
| Daftar domain di tab Domain gagal dimuat | Cloudflare superadmin belum tersambung atau belum diverifikasi (Pengaturan > Cloudflare) |
| Domain tidak bisa dipilih untuk ditawarkan | Token tidak mencakup zona itu (Zone Resources) |
| Tombol di landing masih "Salin pesan pemesanan" | Pemesanan mandiri mati, belum ada domain ditawarkan, atau mode hosting mati |
| Form pesanan: "layanan alamat belum siap" | Cloudflare superadmin tidak bisa dihubungi; cek token dan koneksi |
| Subdomain menempel di "Menunggu" atau "Bermasalah" | Lihat catatan di barisnya. Penyebab umum: nama sudah dipakai record DNS lain, token tanpa izin DNS Edit, atau `cloudflared` gagal berjalan (lihat Log sistem) |
| "Siapkan" gagal dengan pesan soal tunnel | Tunnel hosting dibuat bersama subdomain pertama; selesaikan bagian 4 dulu |
| "Siapkan" ditolak Cloudflare | Custom Hostnames belum aktif di zona itu, atau token tanpa izin SSL and Certificates |
| Domain sendiri menempel di "Menunggu" | CNAME belum terbaca di DNS publik (cek dengan `nslookup -type=CNAME <domain>`), atau domain kedua masih proxied di Cloudflare lain |
| Pesanan tidak otomatis lunas | Listener tidak mengirim `amountDetected`, jumlah tidak persis sama, pesanan sudah kedaluwarsa, atau ada dua pesanan menunggu dengan total sama (dibiarkan untuk diperiksa) |
| Pesanan lunas tetapi alamat tidak ada | Notifikasi admin "Pesanan perlu ditangani" memuat alasannya; buat alamatnya dari jendela Pengguna |

## 10. Membersihkan setelah uji

1. Hapus akun uji dari jendela Pengguna. Subdomain dan domain sendirinya ikut dilepas dari Cloudflare.
2. Periksa di dasbor Cloudflare bahwa tidak ada record CNAME atau custom hostname tersisa, dan hapus `cname.<domain>` bila tidak dipakai lagi.
3. Matikan "Buka pemesanan mandiri" bila belum siap menerima pembeli sungguhan.
4. Kembalikan "Aktifkan otomatis saat transfer cocok" sesuai kebijakan Anda.
