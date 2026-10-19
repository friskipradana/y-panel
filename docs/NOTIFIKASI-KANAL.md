# Rancangan: Notifikasi lewat Telegram, WhatsApp Cloud API (Meta), dan WAHA

Status: **tahap 1, 2, 3, 5, dan sebagian 4 sudah dibangun** (bagian 10, 12 sampai 15): antrian realtime yang aman dari race condition, pendeteksi ambang, kanal Telegram untuk superadmin, peristiwa penjual dan kabar keamanan, serta tab Pengaturan > Notifikasi. Tahap 2 dan seterusnya belum. Penyimpangan dari rancangan di bawah dicatat di akhir dokumen. Dokumen ini menjawab apa yang dikirim, ke siapa, lewat apa, dan bagaimana dibuat bertahap. Keputusan pemilik (bagian 11) sudah dimasukkan: WAHA dijalankan Reneo sendiri dengan satu sesi WhatsApp per akun, dan nomor WhatsApp wajib diisi saat memesan.

## 1. Tujuan dan batas

Telegram, WhatsApp Cloud API, dan WAHA adalah **kanal pengiriman**: jalan yang dipakai panel untuk menyampaikan kabar ke orangnya, di luar lonceng panel. Kanalnya sama untuk semua, yang berbeda adalah kabar apa yang lewat dan ke siapa:

1. **Kabar keamanan akun, untuk semua akun** (superadmin, admin, dan pengguna biasa): ada yang mencoba masuk ke akun, login dari perangkat baru, kata sandi berubah, dan sejenisnya. Tiap akun menerimanya di kanal miliknya sendiri.
2. **Kabar pesanan, untuk penjual dan pembeli**: dari pesanan dibuat sampai akun dan alamat panel siap. Penjual (superadmin) menerima semua tahap beserta hal yang perlu ditangani; pembeli menerima tahap yang menyangkut pesanannya.

Hari ini semua pemberitahuan hanya muncul di lonceng panel, jadi pemilik akun tidak tahu ada yang mencoba masuk kalau panelnya tidak sedang dibuka, superadmin tidak tahu ada pesanan atau transfer yang perlu diperiksa, dan pembeli yang baru memesan belum punya akun untuk melihat lonceng. Kegagalan login saat ini hanya dihitung di memori (untuk membatasi percobaan) dan ditulis ke log server; pemilik akun tidak pernah diberi tahu. Rancangan ini menambah tiga kanal luar:

| Kanal | Sifat | Dipakai untuk |
| :--- | :--- | :--- |
| Telegram Bot | Resmi, gratis, paling sederhana | Semua akun yang menyambungkannya (keamanan, dan pesanan bagi penjual dan pembeli) |
| WhatsApp Cloud API | Resmi dari Meta, berbayar per pesan, pesan awal wajib lewat templat yang disetujui | Pesan dari nomor bisnis resmi ke pembeli dan akun lain; wajib templat |
| WAHA (WhatsApp HTTP API) | Tidak resmi, **dijalankan Reneo sendiri sebagai container**, bebas teks, ada risiko nomor diblokir WhatsApp | Kanal WhatsApp bawaan tanpa biaya per pesan; tiap akun menyambungkan WhatsApp-nya sendiri |

Batas: yang dikirim keluar hanya peristiwa penting (bagian 2), bukan setiap notifikasi panel. Lonceng panel tetap seperti sekarang dan tetap jadi catatan utama; kanal luar adalah tambahan, tidak pernah pengganti. Kegagalan kanal luar tidak boleh menggagalkan pesanan, pembayaran, atau tindakan lain.

## 2. Peristiwa yang dikirim keluar

Kode saat ini memanggil satu fungsi untuk semua notifikasi (`notifyUserAction`, dan `notifyAllAdmins` untuk admin). Teksnya bebas dan berisi emoji, jadi tidak cocok dikirim apa adanya. Peristiwa luar diberi kunci tetap dan teks sendiri.

### 2.1 Keamanan akun (semua peran)

Dikirim ke kanal terverifikasi milik akun yang bersangkutan, tidak pernah ke akun lain.

| Kunci | Kapan | Titik di kode |
| :--- | :--- | :--- |
| `security.login_failed` | Ada percobaan masuk gagal ke akun ini. **Tidak pernah dikirim untuk satu percobaan**: baru setelah ambang terlewati (bagian 2.3), memuat jumlah percobaan, jumlah alamat IP, IP terakhir, browser, dan waktu | `handleLoginV2`, jalur gagal |
| `security.login_locked` | Akun terkunci sementara karena terlalu banyak kegagalan | `handleLoginV2`, pemeriksaan `loginFailures` |
| `security.login_new` | Masuk berhasil dari perangkat yang belum dikenal (kombinasi jaringan IP dan jenis browser yang belum pernah terlihat dalam 30 hari). Login pertama sebuah akun tidak memicu pesan | `handleLoginV2`, jalur berhasil |
| `security.host_denied` | Pemilik alamat panel (pembeli): akun lain dengan kata sandi yang benar mencoba masuk di alamat panelnya dan ditolak | `handleLoginV2`, pemeriksaan `userMayUseHost` |
| `security.password_changed` | Kata sandi diganti oleh pemilik, atau direset oleh admin (pesannya menyebut siapa) | `account.password.change`, reset kata sandi |
| `security.token_created` | Token API atau MCP baru dibuat | pembuatan token API |
| `security.account_suspended` | Akun ditangguhkan atau diaktifkan kembali | `handleSuspendUser`, `handleActivateUser`, masa berlaku paket |

Pesan keamanan tidak pernah memuat kata sandi atau token, dan memberi satu langkah jelas ("bukan Anda? ganti kata sandi sekarang di Profil"). Pembatasan percobaan masuk yang ada tidak diubah; kabar ini hanya ditambahkan di sampingnya.

### 2.2 Pesanan dan proses pembelian

| Kunci | Penerima | Kapan | Titik di kode |
| :--- | :--- | :--- | :--- |
| `order.created` | Pembeli (total, rekening, batas waktu), penjual | Pesanan dibuat | `handlePublicCreateOrder` |
| `order.payment_detected` | Pembeli | Transfer dengan jumlah yang cocok terbaca dan menunggu konfirmasi penjual | `matchHostingOrderPayment` |
| `order.review` | Penjual | Transfer cocok menunggu konfirmasi, atau trial perlu persetujuan | `matchHostingOrderPayment`, pesanan trial |
| `order.paid` | Pembeli (akun aktif dan alamat panel), penjual | Pesanan lunas dan akun aktif | `fulfillOrder` |
| `order.subdomain_ready` | Pembeli | Alamat panel sudah aktif dan bisa dibuka | sinkronisasi subdomain |
| `order.attention` | Penjual | Lunas tetapi paket atau alamat gagal dipasang, atau notifikasi bank yang jumlahnya tidak cocok dengan pesanan mana pun | `fulfillOrder`, `giveOrderSubdomain`, `matchHostingOrderPayment` |
| `order.cancelled` / `order.expired` | Pembeli | Pesanan dibatalkan penjual, atau kedaluwarsa tanpa pembayaran | `handleCancelOrder`, `expireOrders` |
| `plan.reminder` | Pembeli | 3 hari sebelum paket berakhir | `remindPlans` |
| `plan.ended` | Pembeli, penjual | Paket berakhir dan akun ditangguhkan | `expirePlans` |
| `trial.started` / `trial.ended` | Pembeli | Trial upgrade mulai dan selesai | `hosting_trials.go` |
| `domain.active` / `domain.error` | Pembeli (aktif), penjual (bermasalah) | Domain milik pembeli | `refreshCustomDomain` |

Peristiwa panel lain (project dibuat, token Cloudflare disimpan, dan seterusnya) tidak dikirim keluar. Bila nanti diminta, cukup ditambah kunci dan teks tanpa mengubah rancangan.

### 2.3 Tanda serangan: ambang dan pengumpulan

Prinsipnya: **satu kegagalan atau satu permintaan yang ditolak tidak pernah menjadi pesan.** Kesalahan ketik kata sandi, satu pemindai yang lewat, atau satu klik ganda tidak boleh membangunkan siapa pun. Pesan keluar hanya bila kejadian yang sama berulang melewati ambang dalam jendela waktu, dan setelah itu satu pesan ringkasan, bukan satu per kejadian.

| Pendeteksi | Menghitung | Ambang bawaan | Penerima | Kunci |
| :--- | :--- | :--- | :--- | :--- |
| Tebakan kata sandi satu akun | Login gagal untuk satu akun yang ada | 3 dalam 10 menit (peringatan), 10 (tinggi), 30 (kritis) | Pemilik akun | `security.login_failed` |
| Pemindaian akun | Nama pengguna berbeda yang dicoba dari satu IP | 10 nama dalam 10 menit | Superadmin | `attack.account_scan` |
| Serangan login terdistribusi | Login gagal di seluruh panel dari banyak IP | 30 dalam 5 menit dari sedikitnya 5 IP | Superadmin | `attack.login_flood` |
| Lonjakan permintaan (indikasi DDoS) | Permintaan yang ditolak pembatas laju (429), seluruh panel | 100 dalam 1 menit | Superadmin | `attack.request_flood` |
| Penyalahgunaan formulir pesanan | Pesanan dan pemeriksaan alamat yang ditolak pembatas | 20 dalam 10 menit | Superadmin | `attack.order_abuse` |
| Percobaan pada pembaca notifikasi | Webhook dengan kunci API salah atau tanda tangan salah | 5 dalam 10 menit | Superadmin | `attack.webhook_probe` |

**Bagaimana peringatan dikirim setelah ambang terlewati**

1. **Satu pesan saat ambang terlewati**, berisi ringkasan: jumlah, jendela waktu, jumlah dan contoh IP (paling banyak lima), jalur yang diserang, dan saran satu baris.
2. **Masa tenang**: selama peringatan itu berlaku, kejadian baru **hanya dihitung**, tidak dikirim. Pesan lanjutan baru keluar bila jumlahnya naik ke tingkat berikutnya (peringatan, tinggi, kritis) atau masa tenang habis (15 menit) dan serangan masih berlangsung, dan isinya "masih berlangsung, N kejadian sejak pesan terakhir".
3. **Pesan pemulihan**: bila 10 menit tanpa kejadian baru, satu pesan "sudah reda" dengan total kejadian dan lama serangan, supaya penerima tahu tidak perlu terus memantau.
4. **Batas pesan per penerima dan per kanal** (mis. 6 pesan peringatan per jam). Di atas itu pesan ditahan dan digabung menjadi satu ringkasan, jadi serangan tidak bisa dipakai membanjiri Telegram atau WhatsApp seseorang, atau menghabiskan kuota berbayar Meta.
5. Ambang dan masa tenang dapat diubah superadmin di Pengaturan > Notifikasi (satu tabel: pendeteksi, ambang, jendela). Nilai bawaan di atas berlaku bila tidak diubah.

**Menghitung dengan aman saat diserang**
- Penghitung berada **di memori**, bukan di database. Setiap permintaan yang ditolak yang menulis baris ke database justru memperbesar serangan. Hari ini `withRateLimit` menulis satu log ke database untuk setiap permintaan yang ditolak; setelah pendeteksi ini ada, penolakan hanya menaikkan penghitung dan log ke database dibatasi (sampel dan ringkasan per menit).
- Penghitung memakai jendela berpetak (per menit) dengan jumlah kunci maksimal dan pembuangan kunci tertua, jadi penyerang yang memakai jutaan IP atau nama pengguna acak tidak bisa menghabiskan memori.
- Keputusan "ambang terlewati" diambil di bawah kunci, sehingga **tepat satu** goroutine yang melewatinya dan mengirim pesan, sebesar apa pun lonjakannya (bagian 3.3).
- Hanya peringatan yang benar-benar dikirim yang masuk ke antrian dan database. Keadaan terakhir tiap peringatan (kapan terakhir dikirim, tingkat) disimpan agar mulai ulang agent tidak mengulang pesan yang baru dikirim.

**Yang tidak dilakukan:** panel tidak mencoba menahan serangan volumetrik yang sebenarnya; itu tugas lapisan depan (Cloudflare) dan pembatas laju yang sudah ada. Peringatan hanya memberi tahu, dan `attack.request_flood` menyebutkan bila lalu lintas masuk lewat Cloudflare sehingga IP yang terlihat bisa saja IP Cloudflare.

## 3. Arsitektur

### 3.1 Alur

```
  titik di kode ──► notify.Emit(event, penerima, data)
                         │  (kejadian berulang lebih dulu lewat pendeteksi ambang, bagian 2.3)
                         ├─► lonceng panel (seperti sekarang)
                         └─► antrian keluar (tabel notification_outbox)
                                    │  INSERT, lalu Wake() seketika
                         pekerja ◄──┘  (juga tiap 5 detik sebagai jaring pengaman)
                                    │
                    ┌───────────────┼────────────────┐
                 Telegram       WhatsApp Cloud      WAHA
```

- **Paket baru `internal/notify`.** Antarmuka kanal, katalog pesan, pendeteksi ambang, pembuat antrian, dan pekerja. Tidak tahu apa-apa soal HTTP handler.
- **Antarmuka kanal**: `Send(ctx, pesan) (idKiriman, error)` dan `Test(ctx)`; satu berkas per kanal (`telegram.go`, `whatsapp_cloud.go`, `waha.go`). Kesalahan dikelompokkan *sementara* (jaringan, 429, 5xx: coba lagi) dan *tetap* (penerima memblokir bot, nomor tidak valid, templat tidak ada: jangan diulang).
- **Pemasangan bertahap pada kode lama.** `notifyUserAction` dibiarkan. Titik di bagian 2 diganti satu per satu menjadi `Emit(...)` yang juga membuat notifikasi lonceng dengan teks yang sama seperti sekarang.

### 3.2 Realtime, dengan antrian

Antrian dan realtime tidak bertentangan: antrian memberi keandalan, dan pekerja dibangunkan seketika supaya tidak ada jeda.

- **Setelah `INSERT` ke antrian, `Emit` langsung membangunkan pekerja** lewat saluran berpenyangga satu (`Wake()` tidak pernah memblokir dan banyak panggilan digabung jadi satu). Pekerja mengambil barisnya pada saat itu juga. Targetnya: dari kejadian sampai permintaan ke kanal keluar **di bawah satu detik**, di luar waktu jawaban kanal itu sendiri.
- **Pekerja juga memeriksa antrian tiap 5 detik.** Itu jaring pengaman untuk pembangunan yang terlewat, percobaan ulang yang waktunya tiba, dan baris yang tertinggal setelah agent mulai ulang. Realtime tidak bergantung padanya.
- **Pekerja paralel**: beberapa goroutine (bawaan 4) mengambil baris secara bersamaan, dibatasi per kanal supaya pembatas laju kanal tetap dihormati.
- **Prioritas**: baris punya `priority`. Peringatan serangan, kabar keamanan, dan hal yang perlu ditangani penjual (0) diambil lebih dulu dari pesan biasa (1), supaya antrean panjang pesan biasa tidak menunda peringatan.
- **Riwayat realtime di panel**: perubahan status baris (menunggu, mengirim, terkirim, gagal) didorong lewat WebSocket notifikasi yang sudah ada, jadi kartu Antrian dan riwayat di Pengaturan > Notifikasi bergerak sendiri tanpa memuat ulang.
- **Pesan yang gagal sementara tidak menahan yang lain**: percobaan ulang memakai jeda bertambah (5 detik, 30 detik, 5 menit, 30 menit, 2 jam, lalu berhenti dan tampil di riwayat), jadi pesan yang baru tetap berjalan seketika.

### 3.3 Race condition dan jaminan

Jaminan yang diberikan: **setiap peristiwa dikirim paling sedikit sekali, dan hampir selalu tepat sekali**. Duplikat hanya mungkin di jendela sempit saat kanal menerima pesan tetapi agent mati atau koneksi putus sebelum hasilnya dicatat; itu dicatat dan dibatasi satu percobaan ulang. Daftar kondisi balapan dan penangkalnya:

| # | Kondisi | Penangkal |
| :--- | :--- | :--- |
| 1 | Dua pekerja mengambil baris yang sama | Satu pernyataan atomik: `UPDATE ... SET status='sending', locked_until=now()+lease WHERE id IN (SELECT id ... WHERE status='pending' AND next_attempt_at<=now() ORDER BY priority, id FOR UPDATE SKIP LOCKED LIMIT n) RETURNING *`. Baris yang sedang dipegang dilewati, bukan ditunggu |
| 2 | Pekerja mati saat mengirim | Sewa (`locked_until`, 60 detik, lebih panjang dari batas waktu HTTP 15 detik). Baris `sending` yang sewanya lewat dikembalikan ke `pending` oleh pekerja lain. Tidak ada baris yang tertinggal selamanya |
| 3 | Satu peristiwa dihasilkan dua kali (pesanan diproses dua kali, pengingat diulang) | Kunci idempoten (`peristiwa + penerima + kanal + id objek`) dengan indeks unik dan `INSERT ... ON CONFLICT DO NOTHING`. Untuk pesanan, hanya pemanggil yang benar-benar menutup pesanan (`MarkOrderPaid` bernilai benar) yang membuat peristiwa |
| 4 | Peristiwa dikirim padahal perubahan bisnisnya dibatalkan, atau perubahan terjadi tanpa peristiwa | Pemasukan ke antrian dilakukan **dalam transaksi yang sama** dengan perubahan bisnis bila perubahannya satu transaksi (pola *transactional outbox*), dan segera setelah perubahan yang menutup bila tidak |
| 5 | Dua pesan ke penerima yang sama saling mendahului (mis. "lunas" setelah "alamat siap") | Urutan per penerima: sebuah baris hanya boleh diambil bila tidak ada baris lebih lama untuk (kanal, alamat) yang masih `pending` atau `sending`. Baris yang gagal permanen tidak menahan antrian |
| 6 | Penerima atau kanal diubah saat pesan menunggu (kanal dimatikan, penerima memblokir, berhenti) | Keadaan diperiksa ulang **saat mengirim**, bukan saat memasukkan; baris yang tidak boleh lagi dikirim ditandai `cancelled` dengan alasannya |
| 7 | Ambang terlewati oleh banyak goroutine sekaligus (lonjakan) | Penghitung dan keputusan di bawah satu kunci per pendeteksi: hanya satu pemanggil yang melihat peralihan "di bawah ambang" menjadi "di atas ambang" dan membuat pesan; yang lain hanya menambah hitungan |
| 8 | Kabar status dari kanal (terkirim, dibaca) tiba sebelum agent mencatat kiriman | Status memiliki peringkat (terkirim < sampai < dibaca) dan tidak pernah mundur; kabar yang tiba lebih awal disimpan di tabel kecil dan disatukan saat ID pesan dari kanal sudah dicatat |
| 9 | Kode verifikasi dicoba paralel untuk melewati batas percobaan | Penghitung dinaikkan atomik: `UPDATE ... SET attempts=attempts+1 WHERE ... AND attempts<5 RETURNING` |
| 10 | Pengguna menekan "Sambungkan WhatsApp" dua kali, atau dua perangkat serentak | `whatsapp_sessions.user_id` unik dengan `INSERT ... ON CONFLICT`; satu kunci per sesi untuk pembuatan dan QR; membuat sesi di WAHA bersifat idempoten |
| 11 | Pembatas laju kanal dipakai bersamaan oleh banyak pekerja | Pembatas (ember token) di bawah satu kunci per kanal. Rancangan mengandaikan **satu proses agent**; bila nanti ada lebih dari satu, pembatas dipindahkan ke database |
| 12 | Agent dimatikan saat ada pesan yang sedang dikirim | Penutupan berhenti mengambil baris baru, menunggu yang sedang berjalan sampai 10 detik, lalu melepas sewa sisanya |

**Pengujian balapan** (database asli, dijalankan dengan `-race`): 50 goroutine mengambil dari antrian berisi 200 baris dan tiap baris dikirim tepat sekali; sewa kedaluwarsa dikembalikan dan dikirim sekali; 100 goroutine memasukkan kunci yang sama menghasilkan satu baris; urutan per penerima terjaga di bawah paralelisme; 1000 kejadian bersamaan melewati ambang menghasilkan tepat satu pesan; kabar status yang datang terbalik menghasilkan status akhir yang benar.

## 4. Data

Tabel baru, dibuat bertahap sesuai tahap kerja (bagian 10):

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

**`known_devices`**, untuk mengenali login dari perangkat baru: `user_id`, `fingerprint` (hash dari jaringan IP, yaitu /24 untuk IPv4 atau /48 untuk IPv6, ditambah jenis browser dan sistem operasi; alamat IP lengkap tidak disimpan di sini), `first_seen`, `last_seen`. Baris yang tidak terlihat 90 hari dihapus.

**`whatsapp_sessions`**, satu baris per akun yang menyambungkan WhatsApp lewat WAHA (bagian 5.3):

| Kolom | Isi |
| :--- | :--- |
| `user_id` | Pemilik sesi (unik) |
| `session_name` | Nama sesi di WAHA, mis. `admin-budi`; disimpan di sini agar mengganti nama pengguna tidak memutus sesi |
| `status` | `stopped`, `scan_qr`, `working`, `failed` (disalin dari WAHA) |
| `phone` | Nomor yang tersambung, setelah terhubung |
| `updated_at` | Waktu status terakhir dibaca |

**`notification_outbox`**: `id`, `event`, `user_id`, `kind`, `address`, `payload` (JSON, dipakai mengisi teks dan variabel templat), `idempotency_key` (unik), `priority` (0 mendesak, 1 biasa), `status` (`pending`, `sending`, `sent`, `failed`, `cancelled`), `attempts`, `next_attempt_at`, `locked_by` dan `locked_until` (sewa pekerja), `provider_id` (ID pesan dari kanal, untuk mencocokkan status pengiriman), `error`, `created_at`, `sent_at`. Indeks: `(status, priority, next_attempt_at)` untuk pengambilan, `(kind, address, id)` untuk urutan per penerima, dan unik pada `idempotency_key`. Baris lama dihapus otomatis setelah 30 hari.

**`notification_alert_state`**: keadaan terakhir tiap peringatan serangan (`detector`, `scope`, `level`, `last_sent_at`, `count_since`), agar mulai ulang agent tidak mengulang pesan yang baru dikirim.

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
- **Sesi superadmin** dipakai sebagai pengirim pesan sistem (kabar keamanan akun, pesanan, pengingat, dan seterusnya ke pembeli, admin, dan pengguna). Karena itu nomor yang dipindai superadmin adalah nomor bisnis, dan peristiwa di bagian 2 tidak dikirim bila sesi itu belum tersambung.
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
| `reneo_security_login` | `security.login_failed`, `security.login_locked`, `security.login_new`, `security.host_denied` | jenis kejadian, jumlah, IP, browser, waktu |
| `reneo_security_change` | `security.password_changed`, `security.token_created`, `security.account_suspended` | jenis perubahan, waktu |
| `reneo_order_process` | `order.payment_detected`, `order.subdomain_ready`, `order.cancelled`, `trial.*`, `domain.*` | judul, ringkasan |
| `reneo_admin_alert` | semua peristiwa penjual | judul, ringkasan |

Peristiwa yang mirip dipadatkan ke templat bersama agar jumlah templat yang harus disetujui Meta sedikit. Pesan keamanan termasuk kategori *utility*, bukan *authentication* (kategori itu khusus kode sekali pakai).

- Pesan pembeli tidak pernah memuat kata sandi atau token. Tautan hanya ke alamat panel pembeli sendiri.

## 7. Penerima, persetujuan, dan penyalahgunaan

Kolom nomor di formulir pesanan bisa dipakai orang untuk memasukkan nomor orang lain. Aturannya:

1. **Setiap akun** (superadmin, admin, pengguna biasa): menyambungkan sendiri dari panel (Telegram lewat tautan Mulai; WhatsApp lewat kode verifikasi yang dikirim ke nomornya, lalu dimasukkan di panel). Hanya penerima terverifikasi yang menerima peristiwa. Kabar keamanan (bagian 2.1) menyala otomatis begitu sebuah kanal terverifikasi, karena itu alasan utama menyambungkannya; pemilik akun boleh mematikannya per peristiwa. Kabar keamanan hanya pernah dikirim ke kanal milik akun itu sendiri, jadi seseorang yang mencoba masuk ke akun orang lain tidak bisa memakainya untuk mengirim pesan ke nomor sembarangan.
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
  - **Antrian dan riwayat**: daftar kiriman terakhir dengan status, kanal, dan galat, dan tombol kirim ulang. Memakai tabel daftar yang sudah ada, dan bergerak sendiri lewat WebSocket.
  - **Ambang peringatan**: satu tabel berisi pendeteksi (bagian 2.3), ambang, jendela, dan masa tenang, dengan nilai bawaan dan tombol Kembalikan bawaan.
- **Profil > Notifikasi saya** (semua peran): sambungkan Telegram atau nomor WhatsApp, verifikasi, pilih peristiwa (kabar keamanan di bagian atas, kabar pesanan dan paket di bawahnya), hentikan. Daftar perangkat yang dikenal untuk akun itu tampil di sini dan bisa dilupakan.
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
| 1 | Paket `notify`, tiga tabel, antrian, pekerja, **Telegram**, peristiwa penjual (bagian 2.2) dan kabar keamanan superadmin (bagian 2.1) dengan **pendeteksi ambang** (bagian 2.3), tab Notifikasi dengan kartu Telegram dan Uji kirim | Tes database dengan `-race` (bagian 3.3: pengambilan paralel, sewa, anti-ganda, urutan per penerima, ambang), server Telegram tiruan, dan pengukuran waktu dari kejadian ke permintaan keluar |
| 2 | **Runtime WAHA** (container yang dikelola agent, engine GOWS, kunci API, kesehatan), kanal WAHA, sesi per akun dengan QR di panel, dasbor khusus superadmin, pembatas laju | Pengecekan edisi WAHA lebih dulu; server WAHA tiruan untuk tes; uji nyata dengan container WAHA di Docker dan satu ponsel |
| 3 | **WhatsApp Cloud**: templat, status templat, webhook status | Server Meta tiruan, uji tanda tangan webhook; uji nyata dengan nomor uji Meta |
| 4 | Peristiwa pembeli, **kabar keamanan untuk semua akun** (pengumpulan percobaan gagal, perangkat dikenal), penerima terverifikasi, Profil, kolom di form pesanan, berhenti | Tes alur penuh terhadap Postgres seperti tes hosting |
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
| Ambang tanda serangan | Tabel di bagian 2.3 (mis. login gagal 3 dalam 10 menit; lonjakan permintaan 100 per menit); dapat diubah superadmin |
| Batas pesan peringatan | 6 per jam per penerima per kanal, selebihnya digabung jadi satu ringkasan |
| Jeda dari kejadian ke pengiriman | Di bawah satu detik (pekerja dibangunkan seketika); pemeriksaan tiap 5 detik hanya jaring pengaman |
| Jumlah pekerja | 4 bawaan |
| Perangkat dikenal | 30 hari untuk menilai "baru", 90 hari baru dilupakan |
| Retensi riwayat kiriman | 30 hari |
| Grup Telegram untuk superadmin | Diterima |

## 12. Yang dibangun di tahap 1, dan penyimpangannya

Dibangun: paket `internal/notify` (peristiwa, katalog id/en, kanal Telegram, pendeteksi, antrian dan pekerja, layanan), migrasi `000021_notifications.sql`, endpoint `/api/v1/notify/*`, pemasangan `Emit` di titik-titik pesanan dan keamanan, dan tab Notifikasi. Pengujian: tes murni, tes antrian terhadap Postgres asli dengan `-race` (pengambilan paralel, sewa, urutan per penerima, idempotensi, percobaan ulang, kecepatan di bawah satu detik), dan tes dari handler sampai Telegram tiruan.

Penyimpangan dari rancangan, dengan alasannya:

| Rancangan | Yang dibangun | Alasan |
| :--- | :--- | :--- |
| Riwayat antrian bergerak lewat WebSocket | Daftar diperbarui tiap 4 detik selagi tab antrian terbuka | Pengiriman itu sendiri sudah realtime; WebSocket untuk tampilan menambah kode tanpa mengubah kecepatan kabar |
| Menyambungkan Telegram lewat webhook | Lewat `getUpdates` yang dibaca saat tautan menunggu | Tidak butuh alamat HTTPS publik, jadi jalan juga di panel yang belum terbuka dari luar. Webhook ditunda ke tahap 5 |
| `order.attention` juga untuk notifikasi bank yang tidak cocok dengan pesanan mana pun | Hanya bila beberapa pesanan menunggu dengan total yang sama | Pembaca membaca semua notifikasi bank di ponsel; setiap belanja pribadi akan menjadi peringatan |
| Pekerja memeriksa antrian tiap 5 detik sebagai jaring pengaman | Sama, ditambah pembangunan tepat pada waktu percobaan ulang tiba | Tanpa itu percobaan ulang menunggu sapuan berikutnya |
| Penerima: semua akun | Tahap 1 hanya superadmin (UI dan API) | Kabar untuk pembeli dan admin ada di tahap 4 |

Saat mengujinya muncul empat cacat yang sudah diperbaiki: percobaan ulang yang baru diambil pada sapuan berikutnya, alamat IP yang salah di pesan pemindaian akun, nama database uji yang bisa kembar di Windows, dan alamat obrolan pendek yang tampil utuh.

## 13. Yang dibangun di tahap 2 (WhatsApp lewat WAHA), dan penyimpangannya

Hasil pengecekan edisi: dokumentasi WAHA terbaru (halaman Support us) menyatakan **tidak ada lagi edisi Plus terpisah**; sesi tanpa batas, engine WEBJS, NOWEB, dan GOWS, dasbor, dan keamanan bawaan semuanya ada di edisi gratis. **Terbukti dengan container sungguhan** (bagian 14): image `devlikeapro/waha:latest` versi 2026.9.2 melapor `tier: CORE`, engine GOWS, dan tiga sesi berjalan bersamaan, masing-masing dengan kode QR sendiri.

Dibangun: migrasi `000022_whatsapp_sessions.sql`; `internal/notify/waha.go` (klien WAHA, saluran per sesi, `ToWhatsApp`, `SessionName`), `service_waha.go` (container `reneo-waha` lewat docker, siklus sesi, kunci per akun), `internal/database/whatsapp.go`; endpoint `/api/v1/notify/waha` (superadmin) dan `/api/v1/me/whatsapp` (semua peran kecuali demo); kartu WAHA dan WhatsApp saya di tab Notifikasi, serta kartu WhatsApp saya di Profil. Pengujian: tes murni, dan tes dari handler lewat WAHA tiruan dan docker tiruan dengan Postgres asli dan `-race` (penyalaan dua kali satu container, penyambungan paralel satu sesi, sesi tiap akun terpisah, sesi hilang, putus, menyalakan ulang tanpa memindai).

| Rancangan | Yang dibangun | Alasan |
| :--- | :--- | :--- |
| Dasbor WAHA hanya lewat rute panel milik superadmin | Dasbor hanya terbuka di `127.0.0.1` server; alamat, pengguna, dan kata sandi ditampilkan ke superadmin | Dibuktikan: dasbor WAHA adalah aplikasi Nuxt di `/dashboard/` yang memanggil `/api/` di akar yang sama, jadi tidak bisa dilayani di bawah subpath panel (`/api/` milik panel). Butuh alamat atau domain sendiri; belum dibuat |
| Pesan sistem dikirim dari sesi superadmin | Tiap akun mengirim dari sesinya sendiri ke nomornya sendiri | Pesan ke pembeli yang belum menyambungkan WhatsApp baru ada di tahap 4 |
| Aksi lewat docker diuji dengan container | Diuji dengan docker tiruan; tidak ada Docker di mesin uji | Wajib dicoba di server sungguhan (bagian 8a di UJI-HOSTING) |
| Sesi akun yang dihapus dibersihkan | Dibersihkan: menghapus akun menghapus sesinya di WAHA lebih dulu (terbukti: 2 sesi menjadi 1). Bila WAHA sedang mati, sesinya tertinggal | Tanpa WAHA yang menjawab tidak ada yang bisa dihapus; penyapuan sesi yatim belum dibuat |
| Ambang kecepatan | 1,5 detik antarpesan, 4 detik ke satu nomor | Mengurangi risiko blokir nomor; angka ini tebakan, bukan aturan WhatsApp |

## 14. Tahap 3 dan 4 (sebagian), dan bukti dengan WAHA sungguhan

**WhatsApp Cloud (tahap 3).** `internal/notify/whatsapp_cloud.go`, `service_cloud.go`, `/api/v1/notify/*whatsapp-cloud*`, kartu "WhatsApp Cloud (Meta)" dan "Nomor WhatsApp Cloud saya" di tab Notifikasi. Token dan Phone number ID diperiksa ke Meta sebelum disimpan. Templat dibuat otomatis dari katalog: satu templat per peristiwa dan bahasa (nama `reneo_<peristiwa>`, kategori Utility, contoh isian disertakan, setiap isi diakhiri baris tetap karena Meta menolak isi yang berakhir dengan variabel), dan tombol "Buat templat" mengirim yang belum ada ke Meta; status tiap templat dibaca dari Meta. Pengiriman memakai templat dan mengisi variabelnya (baris yang berubah pada peringatan serangan menjadi variabel terakhir). Kegagalan dipilah: token salah = masalah kanal, nomor tidak ada di WhatsApp = penerima tidak terjangkau, templat belum disetujui = hanya pesan itu yang gagal, batas laju Meta = coba lagi. Diuji dengan Meta tiruan; **belum diuji dengan akun Meta sungguhan**, dan kode kesalahan Meta yang dikelompokkan berasal dari dokumentasi, bukan dari percobaan.

| Rancangan | Yang dibangun | Alasan |
| :--- | :--- | :--- |
| 10 templat bersama | Satu templat per peristiwa dan bahasa (sekitar 50), dibuat otomatis | Isi persis sama dengan teks katalog, tanpa tabel pemetaan; batas Meta jauh di atas jumlah ini. Kekurangannya: banyak yang harus disetujui |
| Teks bebas dalam jendela 24 jam | Selalu templat | Panel tidak menerima balasan, jadi tidak ada jendela yang bisa dipakai |
| Webhook status Meta | Belum | Butuh alamat publik HTTPS; status akhir (dibaca, gagal) belum terlihat |
| Verifikasi nomor lewat kode | Nomor penjual diketik sendiri lalu diuji dengan pesan uji | Kode verifikasi lewat templat autentikasi memerlukan templat tambahan dan disetujui lebih dulu |

**Pembeli (tahap 4, sebagian).** Form pesanan meminta nomor WhatsApp (wajib bila satu kanal bisa mengantar: WAHA dengan sesi superadmin tersambung, atau WhatsApp Cloud menyala). Nomor ditulis seperti kebiasaan (`0812-3456-7890`, `+62 ...`) dan dinormalkan; yang bukan nomor seluler ditolak sebelum akun dibuat. Pembeli menerima dua pesan: cara bayar tepat sesuai total (`buyer.order_created`) dan akun aktif beserta alamat masuk (`buyer.order_paid`, terkirim sekali walau pembayaran dikonfirmasi dua kali). Lewat WAHA pesan dikirim dari sesi superadmin (kolom `sender_user_id` pada antrian); bila pembeli sudah menyambungkan WhatsApp-nya sendiri, dari sesinya. Nomor yang belum terverifikasi dibatasi 3 pesan sehari. Penyimpangan dari bagian 7: teks pesan belum menyebut cara berhenti (jawaban BERHENTI baru bisa dihormati bila webhook terpasang, bagian 15), jadi tidak menjanjikannya; pembeli yang sudah masuk bisa mematikan kelompok "Pesanan saya" di Profil setelah menyambungkan WhatsApp. Kata BERHENTI sudah ditangani di tahap 5 (bagian 15). Belum dibuat: pesan kedaluwarsa (akun yang tidak membayar dihapus dan ikut menghapus antriannya). Kabar paket dan Telegram untuk semua akun ada di bagian 16.


### Bukti dengan container sungguhan

Dijalankan di Docker dalam WSL Ubuntu di mesin pengembang, memakai kode agent yang sama (bukan tiruan): agent memanggil `docker` lewat perantara yang meneruskan ke WSL, menarik `devlikeapro/waha:latest`, membuat container `reneo-waha`, dan memanggil API-nya.

| Yang diuji | Hasil |
| :--- | :--- |
| Menyalakan runtime dari tombol | Image ditarik dan container dibuat; status `starting` lalu `running` (versi 2026.9.2, engine GOWS, tier CORE) dalam sekitar dua menit termasuk unduhan |
| Port | Container terbuka hanya di `127.0.0.1`, kunci API lewat variabel lingkungan, bukan argumen perintah |
| Tiga akun menyambung bersamaan | Tiga sesi (`superadmin-owner`, `user-wa-andi`, `user-wa-budi`) berstatus `SCAN_QR_CODE` serentak; WAHA melaporkan 3 sesi. Edisi CORE mengizinkan banyak sesi |
| Kode QR | Panel mengembalikan PNG untuk tiap akun (7 KB), kode berbeda, bentuknya sesuai yang dibaca klien |
| Memutus | Sesi hilang dari WAHA (3 menjadi 2) dan dari basis data |
| Menghapus akun | Sesinya ikut hilang dari WAHA (2 menjadi 1) |
| Status saat sesi gagal | Sesi yang tidak bisa menghubungi WhatsApp tampil `FAILED` dan QR ditolak dengan alasan WAHA; klien menafsirkannya sebagai kegagalan sementara |
| Dasbor | `/dashboard/` menjawab 200 dengan Basic auth; menggunakan alamat mutlak sehingga tidak bisa dipasang di bawah subpath |

**Yang belum bisa dibuktikan tanpa ponsel:** memindai kode QR (status `WORKING`), pengiriman pesan nyata, dan apakah GOWS mengantar ke nomor sendiri. Pesan WAHA hanya diuji dengan WAHA tiruan.

**Temuan lingkungan:** bridge Docker di WSL ini tidak punya rute keluar (container tidak bisa menjangkau internet, `web.whatsapp.com` timeout) sehingga sesi berstatus `FAILED`. Untuk pengujian container dibuat ulang dengan `--network host`. Panel menjalankan container dengan jaringan bridge biasa; di server yang jaringan Docker-nya normal ini tidak terjadi, tetapi bila sesi tetap `FAILED`, periksa dulu apakah container bisa menjangkau `web.whatsapp.com`. Pembuatan sesi (`POST /api/sessions`) menunggu sampai WAHA selesai mencoba terhubung (10 sampai 20 detik saat koneksi buntu), jadi batas waktu permintaan pembuatan sesi dinaikkan.

## 15. Tahap 5: jawaban dari orang, dan apa yang dikatakan kanal

Yang dipahami: pesan yang isinya hanya kata itu (`stop`, `berhenti`, `unsubscribe`, `/stop`, `/stop@namabot` untuk berhenti; `mulai`, `start`, `/start`, `lanjut` untuk menyala lagi). Kalimat yang kebetulan memuat kata itu tidak menghentikan apa pun. "Berhenti" dicatat untuk alamatnya sendiri (`notification_optouts`; nomor pembeli belum punya akun) dan mematikan semua kelompok kabar bagi akun yang memakai alamat itu; "mulai" membatalkan keduanya, dan hanya dibalas bila alamat itu memang pernah berhenti atau dikenal, supaya orang asing tidak bisa menyuruh panel mengirim pesan ke sebuah nomor. Pesan untuk pembeli ke nomor yang berhenti tidak lagi diantrikan dan yang sudah menunggu dibatalkan.

| Kanal | Cara pesan masuk diterima | Pemeriksaan |
| :--- | :--- | :--- |
| Telegram | Pemungut latar membaca bot tiap 4 detik selama kanal menyala (menggantikan pembacaan hanya saat tautan menunggu); `/start KODE` tetap menyambungkan | Tidak perlu alamat publik. Kata berhenti hanya berlaku untuk obrolan yang mengirimnya |
| WhatsApp Cloud | `POST /api/v1/public/notify/whatsapp-cloud/webhook` (dan `GET` untuk verifikasi alamat dengan verify token yang dibuat panel) | Tanda tangan `X-Hub-Signature-256` (HMAC-SHA256 dengan App secret, dibandingkan dalam waktu tetap); tanpa App secret tersimpan semua permintaan ditolak. Salah tanda tangan dihitung sebagai percobaan webhook oleh pendeteksi serangan. Status `delivered`, `read`, `failed` (dengan kode galatnya) disimpan di samping pesan dan tampil di antrean. Balasan ke "berhenti" dikirim sebagai teks biasa (boleh karena orang itu baru menulis) |
| WAHA | `POST /api/v1/public/notify/waha/webhook`; container dibuat dengan `WHATSAPP_HOOK_URL` ke `host.docker.internal` (`--add-host ...:host-gateway`), peristiwa `message`, dan kunci HMAC acak | Header `X-Webhook-Hmac` (HMAC-SHA512 badan permintaan, kunci hanya diketahui panel dan container, dikirim lewat variabel lingkungan bukan argumen). Pesan dari kita sendiri, dari grup, dan dari id selain `@c.us` diabaikan; balasan hanya lewat sesi milik akun panel |

Semua rute webhook dibatasi laju per alamat IP (300 per menit) karena terbuka ke internet. Panel yang hanya mendengarkan di `127.0.0.1` tidak bisa dijangkau container, jadi container dibuat tanpa webhook.

**Diuji:** tiga tes dari handler dengan Postgres asli dan `-race` (Telegram `/stop` dan `/start` termasuk kalimat yang memuat kata, Meta: verifikasi alamat, status, tanda tangan salah, berhenti dan mulai, orang asing; WAHA: kunci HMAC dan algoritma yang salah, pesan sendiri dan grup, berhenti dengan balasan lewat sesi), dan satu tes murni untuk pengenalan kata. **Belum diuji dengan Meta atau ponsel sungguhan.** Bentuk muatan webhook Meta dan WAHA ditulis dari dokumentasi masing-masing. Dua hal yang belum pasti: apakah container bisa menjangkau agent lewat `host.docker.internal` di server (di Docker Desktop dan WSL, `host-gateway` menunjuk ke mesin Linux, bukan Windows), dan apakah WAHA GOWS mengirim `from` sebagai `@c.us` (versi terbaru WhatsApp memakai `@lid` untuk sebagian kontak; pesan dari id itu diabaikan).

## 16. Kabar paket untuk pembeli, dan Telegram untuk semua akun

**Paket.** Dua peristiwa pembeli ditambahkan: `buyer.plan_reminder` (sekali per tanggal berakhir, tiga hari sebelumnya, dikirim oleh pemeriksa pengingat yang sudah ada) dan `buyer.plan_ended` (saat akun ditangguhkan karena paketnya berakhir). Keduanya lewat jalur pembeli yang sama (nomor dari form pesanan, WAHA dari sesi superadmin atau WhatsApp Cloud, batas tiga pesan sehari untuk nomor yang belum terverifikasi). Perpanjangan memakai alur pesanan yang sudah ada: pesanan perpanjangan juga memberi cara bayar, dan lunasnya memberi kabar paket aktif.

**Telegram untuk semua peran.** Bot tetap milik superadmin, tetapi tiap akun selain demo menyambungkan obrolannya sendiri dari Profil (kartu "Telegram Pribadi Saya" dengan pesan uji), lewat rute `/api/v1/me/telegram`. Tautan lewat `/start KODE` yang sama; satu obrolan hanya milik satu akun karena kodenya satu kali pakai. Kabar yang dikirim ke akun admin dan user adalah kabar keamanan (login baru, kata sandi diubah, token dibuat, login gagal berulang); `/stop` dan `/start` di Telegram berlaku untuk obrolan itu. Akun tidak pernah melihat token bot, hanya apakah bot sudah diatur. Diuji dengan dua akun yang tersambung ke dua obrolan berbeda: kabar satu akun tidak sampai ke obrolan akun lain atau ke superadmin.

## 17. Image yang lebih kecil, dan kunci API per sesi

**Image.** Container memakai `devlikeapro/waha:gows` (tanpa browser, 3,23 GB, GOWS berjalan, sesi dan QR berfungsi: diuji) bukan `:latest` (4,18 GB, memuat Chromium). Di ARM dipakai `:arm` (belum diuji). Unduhan punya batas 40 menit sendiri dan menunggu WAHA menjawab 3 menit, dan galat docker kini menampilkan baris terakhir outputnya (tempat docker menulis penyebabnya), bukan baris pertama berupa progres.

**Kunci per sesi.** WAHA punya kunci admin (semua sesi) dan kunci sesi (satu sesi, lewat `POST /api/keys` dengan `session`, dikirim di header `X-Api-Key`). Terbukti dengan container sungguhan (tier CORE): kunci sesi s1 membuka s1 (200) dan ditolak untuk s2 (403), daftar sesinya hanya s1, tidak bisa membuat sesi atau kunci, tidak bisa mengirim dari sesi lain. Panel sekarang memakai ini: kunci admin hanya untuk membuat, memulai, dan menghapus sesi serta membaca daftar; mengirim pesan, membaca QR, dan membalas jawaban memakai kunci milik sesi itu, jadi satu kesalahan di panel tidak bisa menjangkau sesi akun lain. Kunci dibuat saat akun menyambungkan WhatsApp, disimpan terenkripsi (`whatsapp_sessions.api_key_*`, migrasi 26), dihapus bersama sesinya, dan dibuat ulang sekali otomatis bila WAHA menolaknya (container dibuat ulang). Tidak ada kunci yang sampai ke pengguna: kunci sesi dipegang agent, bukan akun, karena WAHA hanya terbuka dari server dan akun tidak punya urusan langsung dengannya. Bukti nyata: tiga sesi, tiga kunci berstatus sesi saja, nol panggilan ditolak di log WAHA.

**Container tanpa internet.** Pembuatan sesi menunggu WAHA mencoba menghubungi WhatsApp; bila container tidak punya jalur keluar, WAHA menjawab 500 dan pesan galat kini menyarankan memeriksa internet dan DNS container.

## 18. Dasbor WAHA untuk superadmin

Dasbor WAHA tidak bisa dipasang di bawah sub-path panel: ia aplikasi Nuxt di `/dashboard/` yang memanggil `/api` di akar alamatnya sendiri, dan `/api` di panel milik panel. Karena itu dasbor punya **alamat sendiri**, sebuah domain yang diarahkan pemilik ke panel seperti alamat panel pembeli (mis. route Cloudflare ke panel). Di Pengaturan > Notifikasi > WhatsApp WAHA > Dasbor, superadmin menekan **Hubungkan domain**: dialog yang sama dengan "Atur domain" milik container dan proyek (profil tunnel, domain Cloudflare, subdomain) membuat route Cloudflare dari domain itu ke **panel sendiri** (`localhost:<port panel>`), bukan langsung ke WAHA, supaya hanya superadmin yang lolos pintu tautan di bawah. Begitu route jadi, alamatnya tersimpan otomatis; domain yang sudah mengarah ke panel juga bisa ditulis sendiri. Route di Cloudflare tetap ada sampai dihapus di jendela Cloudflare. Dialognya belum diuji dengan akun Cloudflare sungguhan.

- Tombol meminta panel membuat **tautan sekali pakai** (90 detik, bertanda tangan HMAC dengan kunci turunan kunci enkripsi, dan hanya berlaku bila pembuatnya masih superadmin aktif). Tautan itu di alamat dasbor menukar dirinya dengan cookie sesi 4 jam (`HttpOnly`, `Secure` bila HTTPS, host-only). Tautan yang dipakai ulang, diubah, kedaluwarsa, atau dibuat untuk akun biasa ditolak.
- Di alamat itu panel hanya menjawab dengan WAHA. Tanpa cookie yang sah semua jalur (termasuk `/api`) menjawab 403 tanpa menghubungi WAHA. Bila superadmin ditangguhkan atau berhenti menjadi superadmin, cookie langsung tidak berlaku.
- Panel yang berbicara dengan WAHA: kunci API dan login dasbor milik WAHA dipasang pada setiap permintaan, dan cookie, `Authorization`, `X-Api-Key`, dan `Origin` dari browser dibuang. Tidak ada kunci atau kata sandi yang diketik atau terlihat.
- Alamat tidak boleh sama dengan alamat yang sedang dipakai panel atau alamat panel akun. Pemeriksaan alamat panel lain (host guard) tidak berlaku di sini karena alamat ini punya autentikasinya sendiri.

**Terbukti dengan WAHA sungguhan:** orang asing di alamat dasbor mendapat 403 (halaman maupun `/api/sessions`); tautan dari panel membuka dasbor asli ("Dashboard | WAHA", versi 2026.9.2 GOWS) dan panggilan `/api` lewat alamat itu berhasil; tautan yang sama dipakai ulang mendapat 403. Dasbor menampilkan peringatan merah "WAHA_API_KEY is not set or using a default value": itu datang dari entri worker bawaan dasbor sendiri, bukan dari konfigurasi panel (kunci sudah diatur), dan tidak memengaruhi fungsinya. Akses lewat `127.0.0.1:port` dari server tetap ada sebagai cadangan.

## 19. Batas menunggu pindai, dan mulai ulang sesi

Sebuah sesi yang menunggu pindai tidak boleh menunggu selamanya, dan akun harus selalu bisa memulainya dari awal.

- **Batas.** Menunggu pindai berakhir bila sudah lebih dari 5 menit, atau bila kode QR yang tampil sudah berganti 3 kali tanpa dipindai (kode pertama tidak dihitung; kode yang menggantikannya dihitung; kode yang sama diminta lagi bukan pergantian). Saat batas tercapai panel menghentikan sesi di WAHA supaya berhenti membuat kode, menandainya `EXPIRED` (keadaan milik panel; WAHA hanya tahu sesi itu berhenti), dan menolak kode berikutnya dengan alasan. Keadaan itu bertahan sampai akun memulai ulang, apa pun kata WAHA. `whatsapp_sessions` menyimpan kapan menunggu dimulai, sidik jari kode terakhir, dan jumlah pergantian (migrasi 27); lamanya dan jumlahnya adalah variabel (`ScanWindow`, `ScanMaxQRChanges`). Sesi yang sudah berjalan tidak pernah kedaluwarsa.
- **Mulai ulang sesi** (`POST /api/v1/me/whatsapp/restart`, semua akun selain demo). Sesi yang **berjalan** dihentikan dan dimulai lagi, sehingga ponselnya tetap tertaut. Sesi lain (gagal, kedaluwarsa, atau masih menunggu pindai) dibuat ulang dari nol: kunci dan sesinya dihapus lalu dibuat lagi dengan kunci baru dan kode baru, karena sesi yang gagal tidak pulih hanya dengan dijalankan. Tombolnya ada di kartu "WhatsApp saya" saat menunggu pindai, saat berjalan, dan sebagai tombol utama saat sesi gagal atau kedaluwarsa. Akun yang belum pernah menyambungkan tidak punya sesi untuk dimulai ulang.
- Diuji dengan tiruan (jam diputar maju, kode berganti, sesi gagal, sesi berjalan). Jalur henti-lalu-mulai untuk sesi berjalan belum bisa diuji dengan WAHA sungguhan karena memerlukan ponsel yang tertaut.

## 20. Nomor tujuan WhatsApp: sesi hanya mengirim

Rancangan awal mengirim pesan dari sesi sebuah akun ke nomor sesi itu sendiri. Itu salah: pesan ke nomor sendiri masuk ke obrolan dengan diri sendiri, yang tidak berbunyi di ponsel, dan tidak ada cara memilih nomor lain. Sekarang sesi hanya **pengirim** dan tiap akun memilih **nomor tujuan** (`PUT /api/v1/me/whatsapp/destination`, kartu "WhatsApp saya", tombol Ubah nomor tujuan). Isinya nomor lain, mis. nomor admin; kosong berarti kembali ke nomor sesi. Pesan tetap keluar dari sesi akun itu (kuncinya sendiri), ke nomor yang dipilih.

- Bawaannya nomor sesi, dengan lencana peringatan dan penjelasan bahwa pesan ke nomor sendiri tidak berbunyi. Selama bawaan, nomor tujuan mengikuti sesi (juga bila ponsel lain dipindai nanti); nomor yang sudah dipilih tetap bertahan walau sesi dibaca ulang atau ponsel lain dipindai.
- Nomor ditulis seperti kebiasaan dan dinormalkan; nomor yang bukan nomor seluler ditolak. Akun tanpa sesi yang berjalan tidak bisa memilih.
- Nomor tujuan belum diverifikasi dengan kode. Pesan keluar dari WhatsApp akun itu sendiri dan dibatasi jeda kirim, jadi penyalahgunaan terbatas pada akunnya; verifikasi kode ke nomor tujuan belum dibuat.
- Dasar penjadwalan, kelompok kabar, dan pesan uji memakai nomor tujuan yang sama. Kabar untuk pembeli lewat sesi superadmin ke nomor dari form pesanan tidak berubah.

## 21. Isi pesan: terstruktur, berlabel Reneo, dan dua bahasa

Setiap notifikasi punya judul tebal, lalu fakta satu per baris (`Pembeli:`, `Paket:`, `Total:`, `Tujuan:`), lalu langkah berikutnya, dan ditutup `- Reneo`. Kata yang berasal dari kode (jenis pesanan, lama langganan, cara pembayaran, alasan) dikirim sebagai `notify.Localized` berisi `id` dan `en`, sehingga tiap penerima membaca bahasanya sendiri, juga setelah peristiwa disimpan sebagai JSON di antrean. Waktu ditulis `dd/mm/yyyy jj:mm` agar sama di kedua bahasa.

- **Tautan pembeli** (status pesanan) memakai `RENEO_PUBLIC_URL` bila diisi, kalau tidak domain utama hosting (`https://<domain utama>`), dan alamat tempat formulir dibuka hanya bila belum ada domain. Formulir yang dibuka dari domain utama atau nama di bawahnya tetap memakai alamat itu.
- **WhatsApp Cloud:** Meta menyimpan templat apa adanya saat disetujui, jadi teks yang berubah harus menjadi templat baru. Nama templat memuat revisi (`reneo_<peristiwa>_r2`): setelah pembaruan ini, buka Pengaturan > Notifikasi > WhatsApp Cloud dan tekan "Buat templat yang belum ada", lalu tunggu persetujuan Meta. Sebelum disetujui, kabar lewat Cloud untuk peristiwa itu gagal terkirim; Telegram dan WAHA tidak terpengaruh. Menaikkan `templateRevision` di `whatsapp_cloud.go` setiap kali teks katalog berubah.
