# Terminal Session Lifecycle

Host Terminal memisahkan **shell (PTY)** dari **koneksi WebSocket**. Shell bertahan walau koneksi putus; koneksi bisa dipasang ulang ke shell yang sama.

## Alur

```text
POST /api/v1/terminal/sessions        -> sessionId (PTY dibuat)
GET  /api/v1/terminal/sessions/{id}/ws -> attach (generasi N)
        input / resize / ping  ->  server
        output / pong / closed / error  ->  klien
DELETE /api/v1/terminal/sessions/{id}  -> tutup shell
```

## Backend (`internal/terminal`, `internal/httpserver/handlers_terminal.go`)

| Mekanisme | Perilaku |
| :--- | :--- |
| Detach tanpa menutup shell | Output yang datang saat tidak ada WebSocket disimpan (maks 256 KB) dan dikirim saat attach berikutnya |
| Generasi attach | `Attach` mengembalikan generasi; `Detach(id, gen)` hanya berlaku bila generasi masih milik koneksi tersebut, sehingga koneksi lama tidak menghapus koneksi baru |
| Koneksi pengganti | Attach baru memanggil `onReplaced` koneksi lama sehingga hanya satu koneksi aktif per sesi |
| Tulis gagal | Output tidak dibuang: disimpan ke buffer dan koneksi dilepas |
| Write deadline 10 dtk | Klien setengah-mati tidak lagi menahan pembaca PTY dan `Attach` berikutnya |
| Ping server tiap 25 dtk, read deadline 75 dtk | Menjaga koneksi hidup melewati reverse proxy/CDN dan mendeteksi koneksi mati |
| Pesan `ping` aplikasi | Dibalas `pong` |
| Resize gagal | Dilaporkan sebagai `error`, tidak lagi menutup koneksi |
| Reaper | Sesi tanpa koneksi lebih dari 30 menit ditutup (tidak ada shell yatim) |

## Frontend (`src/hooks/useTerminalSession.ts`)

| Mekanisme | Perilaku |
| :--- | :--- |
| Auto-reconnect | Saat socket putus tak terduga, sambung ulang ke **sesi yang sama** dengan backoff 0,8 → 8 dtk (maks 12 percobaan) |
| Heartbeat | `ping` tiap 20 dtk; watchdog menutup socket yang diam lebih dari 55 dtk agar memicu reconnect |
| Pemulihan cepat | Event `online` dan tab kembali terlihat memicu reconnect segera |
| Antrian input | Ketikan saat koneksi putus (maks 200) dikirim setelah tersambung kembali |
| Status | `connected`, `reconnecting`, `closed`; titik status tab kuning berkedip saat menyambung ulang |
| Sesi berakhir | `closed` dari backend atau `session not found` menghentikan reconnect; tombol **Reconnect** membuat sesi baru |

## Kapan sesi baru dibuat

Hanya saat: pertama kali window dibuka, tombol Reconnect ditekan, atau shell sudah berakhir (`exit`, direap, atau server restart). Gangguan jaringan tidak lagi membuat shell baru.
