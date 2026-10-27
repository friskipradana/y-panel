# Arsitektur Sistem Reneo

Gambaran rinci cara bagian-bagian Reneo bekerja sama. Diagram di README adalah ringkasannya. Dokumen ini memakai [Mermaid](https://mermaid.js.org); GitHub menggambarnya otomatis, sedangkan pratinjau Markdown bawaan editor perlu ekstensi Mermaid.

Struktur berkas ada di [repository-structure.md](repository-structure.md), struktur paket Go di [backend-go-structure.md](backend-go-structure.md), dan frontend di [frontend-structure.md](frontend-structure.md).

## 1. Komponen

Satu proses, `reneo-agent` (Go), menjalankan semuanya: menyajikan frontend, melayani API, mengawasi proses project, mengatur container, dan membuka port web publik. Agent berjalan sebagai service systemd dengan hak root.

```mermaid
flowchart TB
    subgraph Client["Klien"]
        direction LR
        Browser["Browser: desktop atau ponsel"]
        AI["Agen AI: klien MCP"]
        Phone["Ponsel Android: pembaca notifikasi bank"]
    end

    subgraph Agent["Agent Go: antarmuka"]
        direction LR
        Static["Penyaji frontend: bundel React, gzip"]
        API["REST /api/v1 + WebSocket"]
        MCP["Server MCP /mcp"]
        Auth["Sesi, role, kuota, audit"]
    end

    subgraph Workers["Agent Go: pekerja"]
        direction LR
        Run["Pengawas proses project + gateway"]
        UDB["Pengelola database user"]
        Pub["Proxy publik :80 dan :443"]
        Notify["Antrian notifikasi"]
        Jobs["Tugas berkala"]
    end

    subgraph Host["Server Linux: data dan proses"]
        direction LR
        PG[("PostgreSQL panel")]
        Docker["Docker: container, image, volume"]
        Accounts["Akun Linux per user: runuser"]
        Files[("State dan konfigurasi")]
    end

    subgraph Net["Server Linux: jaringan"]
        direction LR
        FW["iptables DOCKER-USER, ufw"]
        Cfd["cloudflared per tunnel"]
        Web["nginx atau Apache"]
    end

    subgraph External["Layanan luar"]
        direction LR
        CF["Cloudflare API"]
        LE["Let's Encrypt"]
        GH["GitHub: rilis, artikel resmi"]
        Chat["Telegram, WhatsApp"]
        Pay["Midtrans, Xendit"]
    end

    Client -->|"HTTPS, WebSocket, token API, webhook"| Agent
    Agent -->|"sesi dan data"| PG
    Agent -->|"menjalankan aksi"| Workers
    Workers -->|"docker, runuser, berkas"| Host
    Workers -->|"firewall, tunnel, web server"| Net
    Workers -->|"API dan pesan keluar"| External
```

## 2. Satu permintaan API

Semua keputusan akses dibuat di backend. Frontend hanya menyembunyikan apa yang tidak boleh dipakai akun itu.

```mermaid
sequenceDiagram
    autonumber
    actor U as Pengguna
    participant B as Browser React
    participant M as Middleware agent
    participant H as Handler
    participant S as Layanan Docker, projects, userdb
    participant DB as PostgreSQL

    U->>B: Aksi di window
    B->>M: HTTPS /api/v1/... dengan cookie sesi
    M->>DB: Cek sesi dan akun
    M->>M: Role dan capability, batas laju
    alt tidak boleh
        M-->>B: 401 atau 403
    else boleh
        M->>H: Teruskan dengan akun di konteks
        H->>DB: Cek kepemilikan dan kuota
        H->>S: Jalankan aksi
        S-->>H: Hasil atau galat asli
        H->>DB: Catat audit untuk aksi sensitif
        H-->>B: JSON, atau aliran NDJSON dan WebSocket
    end
    B->>B: TanStack Query memperbarui cache, Zustand mengatur UI
```

Role: `superadmin`, `admin`, `user`, dan `demo` (hanya baca, endpoint baru ditolak secara bawaan). Admin hanya mengelola user biasa. Daftar bertabel (container, project, database, file, pengguna, dan lainnya) dihitung di backend: cari, urut, dan filter kolom dikerjakan `internal/listquery`, bukan di browser.

## 3. Project dan proses

Proses project dijalankan sebagai akun Linux pemiliknya (`runuser`), dengan environment minimal dan direktori kerja yang dikunci ke home pemilik.

```mermaid
flowchart TB
    Req["Permintaan ke alamat project"] --> GW["Gateway di port project<br/>meneruskan jalur terpanjang yang cocok"]
    GW -->|"/api"| P2["Proses api"]
    GW -->|"/"| P1["Proses web atau folder statis"]

    subgraph Sup["Pengawas agent"]
        Start["Skrip mulai: install sekali, build sekali<br/>tanda .reneo/installed dan .reneo/built"]
        Keep["Restart otomatis sampai 5 kali berturut-turut<br/>jeda bertambah, satu process group per project"]
    end
    Start --> P1
    Start --> P2
    Keep -.-> P1
    Keep -.-> P2
    P1 --> Log["Log project"]
    P2 --> Log
```

Project satu proses memakai port yang dialokasikan dari blok milik akun dan terikat ke `127.0.0.1`. Tipe `stack` menjalankan beberapa proses di satu alamat lewat gateway. Variabel lingkungan project disimpan terenkripsi.

## 4. Database milik user dan aksesnya

Tiap database adalah container terpisah dengan volume sendiri, memakai port dari rentang `20000` sampai `29999`. Bawaannya hanya terbit di `127.0.0.1`.

```mermaid
flowchart TB
    Create["Buat database"] --> Quota{"Kuota akun cukup?"}
    Quota -->|tidak| Err["Ditolak"]
    Quota -->|ya| Local["Container terbit di 127.0.0.1:port<br/>restart unless-stopped"]

    Local --> Mode{"Mode akses diubah?"}
    Mode -->|"hanya localhost"| Local
    Mode -->|"IP tertentu"| Rules["Langkah 1: pasang rantai iptables RENEO-DB-id<br/>di DOCKER-USER, ACCEPT per IP lalu DROP"]
    Rules -->|gagal| Local
    Rules -->|berhasil| Remote["Langkah 2: container dibuat ulang, data tetap<br/>terbit di 0.0.0.0:port, restart no"]

    Remote --> Watch["Agent memeriksa tiap 2 menit<br/>dan memasang ulang aturan yang hilang"]
    Remote --> Boot["Saat agent mulai atau server reboot:<br/>aturan dipasang dulu, lalu container dinyalakan<br/>hanya bila autostart menyala"]
    Boot -->|aturan gagal| Stop["Database dihentikan, ditandai error"]
```

Pembatasan memakai rantai `DOCKER-USER` karena port yang diterbitkan Docker melewati aturan `INPUT` ufw. Penjelasan lebih lengkap di [IP-PUBLIK.md](../IP-PUBLIK.md) dan artikel [mengelola-database](../articles/mengelola-database.md).

## 5. Domain dan alamat publik

Ada dua jalan agar sebuah domain sampai ke panel atau project, dan keduanya bisa dipakai bersamaan.

```mermaid
flowchart LR
    V(["Pengunjung"])

    subgraph T["Jalan 1: Cloudflare Tunnel"]
        CFE["Edge Cloudflare"] --> CFD["cloudflared milik akun<br/>di server"]
    end

    subgraph P["Jalan 2: IP publik, tanpa tunnel"]
        Engine{"Siapa yang melayani"}
        Built["Proxy bawaan Reneo<br/>autocert, :80 dan :443"]
        Ng["nginx + certbot"]
        Ap["Apache + certbot"]
        Engine --> Built
        Engine --> Ng
        Engine --> Ap
    end

    V --> CFE
    V -->|"DNS A ke IP server"| Engine
    CFD --> Dest
    Built --> Dest
    Ng --> Dest
    Ap --> Dest
    Dest{"Tujuan"} --> Panel["Panel"]
    Dest --> Proj["Project"]
    Dest --> Port["Port di mesin ini"]
```

Pada jalan 2, ufw yang aktif harus membuka port web. Agent membukanya saat proxy dinyalakan, dan kartu IP publik menampilkan keadaannya. Domain pembeli: lewat Cloudflare for SaaS atau lewat server ini dengan bukti kepemilikan record TXT.

## 6. Hosting, pembayaran, dan notifikasi

```mermaid
flowchart LR
    Buyer(["Pembeli"]) -->|"/order"| Order["Pesanan + harga: promo, voucher, durasi"]
    Order --> Inst["Instruksi bayar: total + kode unik"]
    Seller(["Ponsel Android penjual"]) -->|"notifikasi bank, webhook"| Match["Pencocokan transfer ke pesanan"]
    Gateway["Midtrans / Xendit"] --> Match
    Inst --> Match
    Match --> Active["Akun dan paket aktif, subdomain dibuat"]
    Active --> Sync["Sinkron DNS dan tunnel hosting"]
    Active --> Emit["Peristiwa"]
    Order --> Emit
    Emit --> Outbox[("Outbox: urutan per penerima, sewa, kirim ulang")]
    Outbox --> Telegram["Telegram"]
    Outbox --> WA["WhatsApp: WAHA atau Cloud"]
    Checker["Pemeriksa tiap 15 menit"] -->|"paket habis: tangguhkan setelah masa tenggang"| Active
```

## 7. Pemasangan, migrasi, dan pembaruan

```mermaid
flowchart TB
    I["curl ... /install | sudo bash"] --> Dep["Pasang Docker, iptables, cloudflared, PostgreSQL bila belum ada"]
    Dep --> Bin["Pasang biner agent, frontend, CLI reneo"]
    Bin --> Svc["Tulis /etc/reneo/agent.env dan service systemd"]
    Svc --> Start["Agent mulai"]
    Start --> Mig["Migrasi SQL berversi dijalankan"]
    Mig --> Restore["Pulihkan: proyek, tunnel, proxy publik, aturan firewall database"]
    Restore --> Ready["Layanan siap di :8787"]

    Rel["bun run release:patch atau minor"] --> Tag["Tag + GitHub Actions membangun installer .run"]
    Tag --> Upd["sudo reneo update atau tombol Perbarui di panel"]
    Upd -->|"unduh dari GitHub Releases"| Bin
```

## 8. Data

| Data | Tempat | Catatan |
| :--- | :--- | :--- |
| Akun, sesi, kuota, paket, pesanan, domain, rute publik, database user | PostgreSQL panel | Migrasi di `internal/database/migrations` |
| Rahasia (token Cloudflare, kredensial database user, variabel project, token bot) | PostgreSQL, terenkripsi dengan `PANEL_ENCRYPTION_KEY` | `internal/crypto` |
| Konfigurasi agent | `/etc/reneo/agent.env` | Dibuat installer |
| State agent (riwayat metrik, klien Ookla, dan lainnya) | `/var/lib/reneo` | |
| Isi database milik user | Volume Docker `reneo-db-<id>-data` | Satu volume per database |
| Tata letak widget, catatan, preferensi | PostgreSQL per akun, cache di localStorage browser | `GET/PUT /api/v1/me/widgets` |

Dokumen lanjutan: [Security Hardening](../security-hardening.md), [Database Migrations](../database-migrations.md), [Installer Architecture](../installer-architecture.md).
