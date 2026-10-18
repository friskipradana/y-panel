# Rancangan: Notifikasi lewat Telegram, WhatsApp Cloud API (Meta), dan WAHA

Status: rancangan, belum dikerjakan. Dokumen ini menjawab apa yang dikirim, ke siapa, lewat apa, dan bagaimana dibuat bertahap. Keputusan pemilik (bagian 11) sudah dimasukkan: WAHA dijalankan Reneo sendiri dengan satu sesi WhatsApp per akun, dan nomor WhatsApp wajib diisi saat memesan.

## 1. Tujuan dan batas

Hari ini semua pemberitahuan hanya muncul di lonceng panel, jadi superadmin tidak tahu ada pesanan atau transfer yang perlu diperiksa kalau panelnya tidak sedang dibuka, dan pembeli yang baru memesan belum punya akun untuk melihat lonceng. Rancangan ini menambah tiga kanal luar:

| Kanal | Sifat | Dipakai untuk |
| :--- | :--- | :--- |
| Telegram Bot | Resmi, gratis, paling sederhana | Superadmin, dan pembeli yang memilihnya |
| WhatsApp Cloud API | Resmi dari Meta, berbayar per pesan, pesan awal wajib lewat templat yang disetujui | Pembeli (terutama), superadmin |
| WAHA (WhatsApp HTTP API) | Tidak resmi, **dijalankan Reneo sendiri sebagai container**, bebas teks, ada risiko nomor diblokir WhatsApp | Kanal WhatsApp bawaan tanpa biaya per pesan; tiap akun menyambungkan WhatsApp-nya sendiri |

Batas: yang dikirim keluar hanya peristiwa penting (bagian 2), bukan setiap notifikasi panel. Lonceng panel tetap seperti sekarang dan tetap jadi catatan utama; kanal luar adalah tambahan, tidak pernah pengganti. Kegagalan kanal luar tidak boleh menggagalkan pesanan, pembayaran, atau tindakan lain.

## 2. Peristiwa yang dikirim keluar

Kode saat ini memanggil satu fungsi untuk semua notifikasi (`notifyUserAction`, dan `notifyAllAdmins` untuk admin). Teksnya bebas dan berisi emoji, jadi tidak cocok dikirim apa adanya. Peristiwa luar diberi kunci tetap dan teks sendiri.

| Kunci | Penerima | Kapan | Titik di kode |
| :--- | :--- | :--- | :--- |
| `order.created` | Pembeli, superadmin | Pesanan dibuat; pembeli menerima total, rekening, dan batas waktu | `handlePublicCreateOrder` |
| `order.review` | Superadmin | Transfer cocok tetapi menunggu konfirmasi; atau trial perlu persetujuan | `matchHostingOrderPayment`, pembuatan pesanan trial |
| `order.paid` | Pembeli, superadmin | Pesanan lunas, akun aktif, alamat panel | `fulfillOrder` |
| `order.attention` | Superadmin | Lunas tetapi paket atau alamat gagal dipasang | `fulfillOrder`, `giveOrderSubdomain` |
| `order.expired` | Pembeli | Pesanan kedaluwarsa tanpa pembayaran | `expireOrders` |
| `plan.reminder` | Pembeli | 3 hari sebelum paket berakhir | `remindPlans` |
| `plan.ended` | Pembeli, superadmin | Paket berakhir dan akun ditangguhkan | `expirePlans` |
| `trial.started` / `trial.ended` | Pembeli | Trial upgrade mulai dan selesai | `hosting_trials.go` |
| `domain.active` / `domain.error` | Pembeli (aktif), superadmin (bermasalah) | Domain milik pembeli | `refreshCustomDomain` |
| `payment.unmatched` | Superadmin | Notifikasi bank dengan jumlah yang tidak cocok dengan pesanan mana pun, atau ganda | `matchHostingOrderPayment` |

Peristiwa panel lain (project dibuat, token Cloudflare disimpan, dan seterusnya) tidak dikirim keluar. Bila nanti diminta, cukup ditambah kunci dan teks tanpa mengubah rancangan.

## 3. Arsitektur

```
  titik di kode ──► notify.Emit(event, penerima, data)
                         │
                         ├─► lonceng panel (seperti sekarang)
                         └─► antrian keluar (tabel notification_outbox)
                                    │
                         pekerja (tiap beberapa detik)
                                    │
                    ┌───────────────┼────────────────┐
                 Telegram       WhatsApp Cloud      WAHA
```

Pokok rancangan:

- **Paket baru `internal/notify`.** Berisi antarmuka kanal, katalog pesan, pembuat antrian, dan pekerja. Isinya tidak tahu apa-apa soal HTTP handler.
- **Antarmuka kanal**: `Send(ctx, pesan) (idKiriman, error)` dan `Test(ctx)`. Tiap kanal satu berkas: `telegram.go`, `whatsapp_cloud.go`, `waha.go`. Kesalahan dikelompokkan jadi *sementara* (coba lagi: jaringan, 429, 5xx) dan *tetap* (jangan diulang: penerima memblokir bot, nomor tidak valid, templat tidak ada).
- **Antrian keluar (outbox) di database**, bukan kirim langsung di handler. Alasannya: pesanan dibuat dalam satu transaksi dan handler harus cepat; kanal luar bisa lambat atau mati; dan antrian memberi riwayat serta percobaan ulang.
- **Pekerja** berjalan di proses agent, memakai pola yang sama dengan pemeriksa masa berlaku yang ada. Mengambil baris berstatus menunggu dengan `FOR UPDATE SKIP LOCKED`, mengirim, lalu menandai terkirim atau gagal. Percobaan ulang dengan jeda bertambah (1, 5, 30 menit, 2 jam, 12 jam), lima kali, lalu berhenti dan tampil di riwayat.
- **Anti-ganda.** Tiap baris punya kunci idempoten (`peristiwa + penerima + kanal + id objek`) dengan indeks unik, jadi pesanan yang diproses dua kali atau pengingat yang diulang tidak mengirim dua pesan.
- **Pemasangan bertahap pada kode lama.** `notifyUserAction` dibiarkan. Titik-titik di bagian 2 diganti satu per satu menjadi `Emit(...)` yang juga membuat notifikasi lonceng dengan teks yang sama seperti sekarang, sehingga perilaku panel tidak berubah.

## 4. Data

Tiga tabel baru (satu migrasi):

**`notification_channels`**, satu baris per kanal, milik panel (superadmin):

| Kolom | Isi |
| :--- | :--- |
| `kind` | `telegram`, `whatsapp_cloud`, `waha` |
| `enabled` | Menyala atau tidak |
| `config` | JSON berisi isian non-rahasia (nama bot, ID nomor telepon, alamat WAHA, nama sesi, versi API) |
| `secret_encrypted` | Token atau kunci, dienkripsi AES-GCM dengan `PANEL_ENCRYPTION_KEY`, sama seperti token Cloudflare |
| `status`, `last_error`, `checked_at` | Hasil uji terakhir |

**`notification_recipients`**, tujuan per akun per kanal:

| Kolom | Isi |
| :--- | :--- |
| `user_id`, `kind` | Pemilik dan kanal |
| `address` | ID obrolan Telegram, atau nomor WhatsApp format internasional tanpa `+` (mis. `62812...`) |
| `verified_at` | Terisi setelah dibuktikan (bagian 7) |
| `events` | Daftar kunci peristiwa yang diizinkan penerima |
| `locale` | `id` atau `en`, memilih bahasa pesan dan templat |
| `blocked_at` | Terisi bila kanal melaporkan penerima memblokir; pengiriman berhenti |

**`whatsapp_sessions`**, satu baris per akun yang menyambungkan WhatsApp lewat WAHA (bagian 5.3):

| Kolom | Isi |
| :--- | :--- |
| `user_id` | Pemilik sesi (unik) |
| `session_name` | Nama sesi di WAHA, mis. `admin-budi`; disimpan di sini agar mengganti nama pengguna tidak memutus sesi |
| `status` | `stopped`, `scan_qr`, `working`, `failed` (disalin dari WAHA) |
| `phone` | Nomor yang tersambung, setelah terhubung |
| `updated_at` | Waktu status terakhir dibaca |

**`notification_outbox`**: `id`, `event`, `user_id`, `kind`, `address`, `payload` (JSON, dipakai mengisi teks dan variabel templat), `idempotency_key` (unik), `status` (`pending`, `sent`, `failed`, `cancelled`), `attempts`, `next_attempt_at`, `provider_id` (ID pesan dari kanal, untuk mencocokkan status pengiriman), `error`, `created_at`, `sent_at`. Baris lama dihapus otomatis setelah 30 hari.

## 5. Ketiga kanal

### 5.1 Telegram

- **Persiapan:** buat bot lewat @BotFather, salin token. Superadmin menempelkan token di panel; panel memanggil `getMe` untuk menguji dan menyimpan nama bot.
- **Kirim:** `POST https://api.telegram.org/bot<token>/sendMessage` dengan `chat_id`, `text`, `parse_mode: HTML`, `disable_web_page_preview: true`. Teks di-escape sebelum dikirim.
- **Batas:** sekitar 1 pesan per detik per obrolan dan 30 per detik total. Jawaban `429` membawa `retry_after`; pekerja menaatinya. `403` berarti pengguna memblokir bot: penerima ditandai diblokir.
- **Menyambungkan penerima:** tautan `https://t.me/<bot>?start=<kode>`. Pengguna menekan Mulai, Telegram mengirim pembaruan `/start <kode>` ke bot, dan panel menyimpan `chat_id`. Pembaruan diterima lewat **webhook** (`setWebhook` dengan `secret_token`, header `X-Telegram-Bot-Api-Secret-Token` diperiksa) karena panel sudah punya alamat HTTPS publik. Bila panel tidak bisa dijangkau dari luar, jatuh ke `getUpdates` berkala.
- **Biaya:** gratis.

### 5.2 WhatsApp Cloud API (resmi Meta)

- **Persiapan di Meta:** akun Meta Business, aplikasi dengan produk WhatsApp, nomor telepon yang didaftarkan ke WhatsApp Business Platform, dan *System User* dengan token permanen berizin `whatsapp_business_messaging` (dan `whatsapp_business_management` bila templat dibuat lewat API). Dari situ didapat `Phone Number ID`, `WABA ID`, dan token. Ketiganya diisi di panel; tombol Uji memanggil API untuk memastikan token dan nomor valid.
- **Kirim:** `POST https://graph.facebook.com/<versi>/<phone-number-id>/messages` dengan `Authorization: Bearer <token>`. Versi Graph disimpan sebagai pengaturan, bukan ditanam di kode, supaya bisa dinaikkan tanpa rilis.
- **Aturan inti Meta:** pesan yang *kita* mulai di luar jendela 24 jam sejak pembeli terakhir membalas **wajib memakai templat yang sudah disetujui Meta**; teks bebas hanya boleh di dalam jendela itu. Semua peristiwa di bagian 2 dimulai oleh kita, jadi semuanya dikirim sebagai templat kategori *utility*. Panel menyimpan nama templat dan bahasanya per peristiwa, mengisi variabel dari data peristiwa, dan memakai teks bebas hanya bila ada balasan masuk dalam 24 jam terakhir.
- **Templat:** bagian 6 memuat daftar nama, isi, dan variabelnya untuk dibuat di Meta Business Manager. Persetujuan Meta butuh waktu dan bisa ditolak; panel menandai peristiwa yang templatnya belum disetujui dan tidak mengirimnya lewat kanal ini.
- **Status pengiriman:** webhook Meta (`GET` verifikasi dengan `hub.verify_token`, `POST` dengan tanda tangan `X-Hub-Signature-256` dihitung dari app secret) membawa status terkirim, dibaca, atau gagal. Dipakai untuk mengisi riwayat dan mendeteksi nomor yang tidak punya WhatsApp. Tanpa webhook kanal tetap bisa mengirim; hanya status akhirnya yang tidak terlihat.
- **Biaya:** berbayar per pesan menurut kategori dan negara; lihat halaman harga Meta, angkanya tidak ditulis di sini karena berubah.
- **Format nomor:** internasional tanpa `+` dan tanpa nol di depan, mis. `0812-3456-7890` menjadi `6281234567890`. Panel menormalkan input dan menolak yang bukan nomor.

### 5.3 WAHA sebagai runtime bawaan

Keputusan: WAHA dipasang dan dijalankan oleh Reneo, bukan oleh pengguna. Superadmin hanya menyalakannya; pengguna dan admin tinggal menyambungkan WhatsApp mereka.

**Runtime**
- Agent menjalankan WAHA sebagai **container Docker yang dikelola Reneo**, dengan pola yang sama seperti database milik pengguna (`internal/userdb`): tarik image, buat, jalankan, cek kesehatan, mulai ulang, hapus. Superadmin menyalakan dan mematikannya dari Pengaturan > Notifikasi, dan melihat statusnya (jalan atau tidak, versi, jumlah sesi, pemakaian memori).
- **Engine bawaan GOWS.** Hanya superadmin yang dapat menggantinya.
- Kunci API WAHA dibuat acak oleh agent, disimpan terenkripsi, dan **tidak pernah diberikan ke pengguna mana pun**. Container hanya dibuka ke `127.0.0.1` (atau jaringan Docker internal), tidak lewat tunnel, jadi satu-satunya yang bisa berbicara dengan WAHA adalah agent.
- **Dasbor WAHA hanya untuk superadmin.** Dasbor tidak dipublikasikan; superadmin membukanya lewat rute panel yang memeriksa sesi login superadmin lebih dulu (pengguna lain menerima 404). Bila dasbor tidak bisa dilayani di bawah subpath, dibuat alamat khusus yang diperlakukan seperti alamat panel pembeli: hanya menjawab sesi superadmin.

**Sesi per akun**
- Tiap akun yang menyambungkan WhatsApp mendapat satu sesi WAHA bernama sesuai pengguna dan perannya: `<peran>-<nama pengguna>` dalam huruf kecil, hanya `a-z`, `0-9`, `-` (mis. `superadmin-owner`, `admin-budi`, `user-andi`). Pemetaannya disimpan di `whatsapp_sessions`.
- Menyambungkan dilakukan **di panel**, tanpa menyentuh WAHA: pengguna menekan "Sambungkan WhatsApp", agent membuat sesinya dan menampilkan kode QR (gambar diteruskan dari WAHA), pengguna memindainya dari WhatsApp di ponsel, dan status berubah ke tersambung. "Putuskan" mengeluarkan sesi dan menghapusnya.
- Setiap endpoint panel hanya menyentuh sesi **milik pemanggil**. Superadmin boleh melihat dan memutuskan semua sesi.
- **Sesi superadmin** dipakai sebagai pengirim pesan sistem (pesanan, pengingat, dan seterusnya ke pembeli dan admin). Karena itu nomor yang dipindai superadmin adalah nomor bisnis, dan peristiwa di bagian 2 tidak dikirim bila sesi itu belum tersambung.
- **Sesi pengguna dan admin adalah milik mereka sendiri** dan bukan pengirim pesan sistem. Untuk apa sesi itu dipakai (mis. notifikasi dari proyek atau layanan mereka sendiri) adalah pekerjaan lanjutan; tahap awal hanya menyediakan sambung, putus, dan status.

**Kirim dan status:** agent memanggil `POST /api/sendText` dengan `{"session": "<nama sesi>", "chatId": "<nomor>@c.us", "text": "..."}` dan header `X-Api-Key`. Status sesi dibaca dengan `GET /api/sessions/<sesi>` (`WORKING` berarti siap). Pekerja antrian mengirim hanya bila sesinya `WORKING`; bila tidak, pesan menunggu dan peringatan muncul untuk superadmin.

**Sifat dan risiko**
- Tidak resmi: WhatsApp dapat memblokir nomor yang mengirim pesan otomatis. Pembatas laju (jeda acak antar pesan, batas per menit per sesi) dan aturan persetujuan (bagian 7) wajib, dan kartu kanal menampilkan peringatan ini.
- Semua sesi berjalan di satu container, jadi memori naik per sesi. Superadmin menetapkan **jumlah sesi maksimal** (bawaan misalnya 20), dan sambungan baru ditolak dengan pesan jelas bila penuh.

**Yang harus dicek sebelum dibangun:** edisi WAHA. Yang saya ketahui dari dokumentasinya, beberapa engine dan terutama **banyak sesi sekaligus** dapat dibatasi pada edisi berbayar (Plus), sedangkan edisi gratis (Core) terbatas pada satu sesi. Bila Core hanya mengizinkan satu sesi, rancangan sesi per akun tidak bisa jalan dengan edisi gratis. Ini harus dipastikan lebih dulu di dokumentasi WAHA dan dengan mencoba containernya, sebelum tahap WAHA dimulai.

## 6. Pesan

- **Satu katalog di kode**, kunci peristiwa dan bahasa (`id`, `en`) menghasilkan teks. Tidak ada emoji. Contoh `order.paid` (id):

  > Akun Anda sudah aktif. Paket {plan} berlaku sampai {until}. Masuk di https://{hostname}

- **Telegram dan WAHA** memakai teks katalog langsung.
- **WhatsApp Cloud** memakai templat dengan isi yang sama dan variabel bernomor. Daftar yang perlu dibuat di Meta (kategori Utility, bahasa Indonesia dan Inggris):

| Nama templat | Peristiwa | Variabel |
| :--- | :--- | :--- |
| `reneo_order_created` | `order.created` | paket, total, rekening, atas nama, batas waktu |
| `reneo_order_paid` | `order.paid` | paket, berlaku sampai, alamat panel |
| `reneo_order_expired` | `order.expired` | paket |
| `reneo_plan_reminder` | `plan.reminder` | paket, tanggal berakhir |
| `reneo_plan_ended` | `plan.ended` | paket |
| `reneo_domain_active` | `domain.active` | domain |
| `reneo_admin_alert` | semua peristiwa superadmin | judul, ringkasan |

Pesan untuk superadmin dipadatkan ke satu templat umum agar jumlah templat yang harus disetujui sedikit.

- Pesan pembeli tidak pernah memuat kata sandi atau token. Tautan hanya ke alamat panel pembeli sendiri.

## 7. Penerima, persetujuan, dan penyalahgunaan

Kolom nomor di formulir pesanan bisa dipakai orang untuk memasukkan nomor orang lain. Aturannya:

1. **Superadmin dan admin**: menyambungkan sendiri dari panel (Telegram lewat tautan Mulai; WhatsApp lewat kode verifikasi yang dikirim ke nomornya, lalu dimasukkan di panel). Hanya penerima terverifikasi yang menerima peristiwa.
2. **Pembeli saat memesan**: form pesanan mendapat kolom **nomor WhatsApp yang wajib diisi** (dan pilihan "kirim juga lewat Telegram" yang opsional). Nomor itu hanyalah **tujuan** pesan; ia tidak ada hubungannya dengan sesi WhatsApp milik panel (bagian 5.3), dan pembeli menyambungkan WhatsApp-nya sendiri nanti di pengaturan panelnya. Nomor yang belum diverifikasi hanya boleh menerima **satu pesan `order.created` per pesanan**, dengan batas 3 pesan per nomor per hari dan 5 per alamat IP per jam, dan pesannya menyebut cara berhenti ("balas BERHENTI"). Setelah itu pengiriman berhenti sampai nomor diverifikasi. Format nomor dinormalkan dan diperiksa saat mengetik; nomor yang jelas bukan nomor ponsel ditolak.
3. **Verifikasi pembeli** dilakukan di Profil setelah akun aktif: kode enam angka dikirim ke nomor itu dan dimasukkan di kartu "Notifikasi saya". Setelah terverifikasi, semua peristiwa pembeli di bagian 2 dikirim.
4. **Berhenti**: kata BERHENTI (WhatsApp, lewat webhook masuk) atau perintah `/stop` (Telegram) menandai penerima berhenti. Pengaturan juga bisa dimatikan di Profil. Penerima yang memblokir bot ditandai otomatis.
5. Kode verifikasi berlaku 10 menit, maksimal 5 percobaan, dan pengiriman kode dibatasi per nomor dan per akun.

## 8. Antarmuka

Semua tampil di desktop dan ponsel dengan komponen UI yang sudah ada.

- **Pengaturan > Notifikasi** (tab baru, grup Integrasi, superadmin; nama itu kini kosong karena pembaca notifikasi bank sudah pindah ke Pembayaran):
  - Kartu **Runtime WAHA** (superadmin): saklar jalankan atau matikan, status container, engine (GOWS), versi, jumlah sesi, tombol mulai ulang, dan tombol "Buka dasbor WAHA".
  - Tiga kartu kanal. Tiap kartu: saklar, isian kredensial (rahasia disamarkan setelah disimpan), tombol **Uji kirim** ke tujuan superadmin sendiri, status terakhir, dan panduan singkat persiapan di sisi Telegram, Meta, atau WAHA (seperti panduan izin token Cloudflare). Kartu WAHA memuat peringatan risiko. Kartu WhatsApp Cloud menampilkan status tiap templat (belum dibuat, menunggu, disetujui).
  - **Tujuan saya**: menyambungkan Telegram dan WhatsApp milik sendiri, memilih peristiwa admin.
  - **Antrian dan riwayat**: daftar kiriman terakhir dengan status, kanal, dan galat, dan tombol kirim ulang. Memakai tabel daftar yang sudah ada.
- **Profil > Notifikasi saya** (semua peran): sambungkan Telegram atau nomor WhatsApp, verifikasi, pilih peristiwa, hentikan.
- **Profil > WhatsApp saya** (semua peran, bila WAHA menyala): tombol Sambungkan menampilkan kode QR, status tersambung dan nomornya, dan tombol Putuskan. Pengguna tidak melihat WAHA, kunci API, atau sesi orang lain.
- **Form pesanan**: nomor WhatsApp wajib, pilihan Telegram opsional (bagian 7). Halaman lunas menyebutkan ke mana kabar dikirim.
- **Daftar kesiapan hosting**: langkah opsional baru "Kanal notifikasi aktif".

## 9. Keamanan

- Token dan kunci disimpan terenkripsi dengan kunci yang sama dengan token Cloudflare, tidak pernah dikirim kembali ke browser (hanya tanda sudah terisi), dan perubahan dicatat di jejak audit.
- Endpoint webhook masuk (Telegram, Meta, WAHA) dibuka tanpa login, jadi tiap permintaan wajib lolos pemeriksaan rahasia: header `secret_token` Telegram, tanda tangan HMAC Meta, dan HMAC atau kunci WAHA. Permintaan yang gagal ditolak dan dibatasi lajunya.
- Isi pesan keluar hanya memuat data yang memang untuk penerima itu. Pesan superadmin tidak memuat data pembeli lain selain yang perlu (nama pengguna, paket, jumlah).
- Pengiriman dibatasi laju per kanal, per penerima, dan global, supaya satu bug atau serangan tidak membakar kuota atau nomor.
- Gagal kirim tidak pernah membocorkan token di log atau di galat yang tampil.
- WAHA hanya dapat dijangkau dari agent; dasbornya hanya lewat sesi superadmin; endpoint sesi memeriksa pemilik tiap permintaan dan nama sesi tidak pernah diterima dari klien.

## 10. Tahap kerja dan pengujian

| Tahap | Isi | Pengujian |
| :--- | :--- | :--- |
| 1 | Paket `notify`, tiga tabel, antrian, pekerja, **Telegram**, peristiwa superadmin, tab Notifikasi dengan kartu Telegram dan Uji kirim | Tes database (antrian, anti-ganda, percobaan ulang, `SKIP LOCKED`), server Telegram tiruan |
| 2 | **Runtime WAHA** (container yang dikelola agent, engine GOWS, kunci API, kesehatan), kanal WAHA, sesi per akun dengan QR di panel, dasbor khusus superadmin, pembatas laju | Pengecekan edisi WAHA lebih dulu; server WAHA tiruan untuk tes; uji nyata dengan container WAHA di Docker dan satu ponsel |
| 3 | **WhatsApp Cloud**: templat, status templat, webhook status | Server Meta tiruan, uji tanda tangan webhook; uji nyata dengan nomor uji Meta |
| 4 | Peristiwa pembeli, penerima terverifikasi, Profil, kolom di form pesanan, berhenti | Tes alur penuh terhadap Postgres seperti tes hosting |
| 5 | Webhook masuk Telegram untuk `/start` dan `/stop`, balasan WhatsApp | Tes tanda tangan dan salah-tanda-tangan |

Tahap 1 sudah berguna sendiri: superadmin mendapat kabar pesanan dan transfer di Telegram. Tahap 2 bergantung pada hasil pengecekan edisi WAHA (bagian 5.3). Tahap 3 membutuhkan akun Meta Business dan persetujuan templat, jadi dimulai lebih awal agar menunggunya tidak menahan yang lain.

## 11. Keputusan

Sudah diputuskan pemilik:

1. **WAHA** dipasang dan dijalankan Reneo sebagai container, engine bawaan GOWS. Pengguna dan admin hanya menyambungkan WhatsApp mereka; nama sesi disesuaikan dengan pengguna dan perannya; hanya superadmin yang dapat mengakses dasbor WAHA.
2. **Nomor WhatsApp pembeli wajib** diisi di form pesanan. Nomor itu hanya tujuan pesan, bukan sesi WhatsApp milik panel; pembeli mengatur sesinya sendiri di pengaturan panel.

Masih terbuka (usulan saya):

| Pertanyaan | Usulan |
| :--- | :--- |
| Edisi WAHA mana yang dipakai, dan apakah mengizinkan banyak sesi? | Dicek dulu sebelum tahap 2; bila Core hanya satu sesi, pilih Plus atau batasi sesi pada superadmin |
| Sesi WhatsApp milik pengguna dan admin dipakai untuk apa selain tersambung? | Tahap awal hanya sambung, putus, dan status; kegunaannya ditentukan kemudian |
| Jumlah sesi maksimal | 20 bawaan, dapat diubah superadmin |
| Pengirim pesan sistem | Sesi WhatsApp superadmin |
| Peristiwa `payment.unmatched` | Dikirim ke superadmin saja |
| Retensi riwayat kiriman | 30 hari |
| Grup Telegram untuk superadmin | Diterima |
