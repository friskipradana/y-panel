---
name: anti-slop
description: >-
  Gunakan setiap kali membuat atau mengubah UI, copy, komentar, atau mockup YPanel
  (komponen React, SCSS, halaman landing/login, window baru). Melarang elemen macOS,
  dekorasi AI generik, dan kode berisik; memandu review dengan checklist yang bisa diperiksa.
---

# Anti-Slop YPanel

Slop adalah output yang terlihat "sudah jadi" tetapi tidak membawa informasi atau fungsi. Tujuan skill ini: setiap piksel dan baris kode punya alasan. Konteks desain lengkap: [DESIGN.md](../../../DESIGN.md). Aturan teknis: [design-system.md](../../../.agents/rules/design-system.md).

## Cara Pakai

1. Sebelum menulis: baca [component-list.md](../../../.agents/rules/component-list.md), pakai ulang.
2. Setelah menulis: jalankan checklist bagian 6 pada diff Anda.
3. Laporkan pelanggaran yang ditemukan, termasuk yang sudah ada sebelumnya (lihat DESIGN.md bagian 10), tanpa memperluas cakupan perubahan.

## 1. Identitas Platform

- Dilarang tiga bulatan merah/kuning/hijau gaya macOS di window, dialog, landing, atau mockup.
- Window controls: ikon garis (`Minus`, `Square`/`Copy`, `Maximize`, `X`, `strokeWidth 1.75`).
- Header berorientasi server: `root@host`, `[agent/sys]`, badge status teknis.

## 2. Visual Slop

1. **Kartu melayang** yang menumpuk di atas screenshot/hero tanpa fungsi. Informasi masuk ke layout, bukan overlay.
2. **Ilustrasi/gambar generik AI** (orb, mesh abstrak, 3D blob, orang tersenyum). Ganti dengan tampilan produk asli atau mockup yang hidup.
3. **Lencana kepercayaan palsu**: perisai, centang dalam lingkaran, "Enterprise-grade", "Bank-level security", sertifikasi yang tidak ada.
4. **Gradient dekoratif** multi-warna pada teks, tombol, avatar, atau latar kartu. Gradient hanya untuk data (grafik, progress), wallpaper pilihan user, atau transisi tonal satu warna dari token.
5. **Glow & blur berlebihan**: `box-shadow` berwarna besar, `blur` di luar taskbar/modal/window.
6. **Emoji sebagai ikon UI** atau penghias judul.
7. **Kartu bersarang** (card di dalam card di dalam card) dan grid tiga kartu identik berisi ikon + judul + kalimat.
8. **Angka fiktif**: uptime, jumlah user, statistik "10x lebih cepat" tanpa sumber. Pakai data nyata atau jangan tampilkan.

## 3. Copy Slop

- Dilarang kata kosong: "seamless", "powerful", "next-generation", "revolutionize", "cutting-edge", "all-in-one solution", "unleash".
- Tombol dan label memakai kata kerja konkret: "Restart container", "Buat tunnel", bukan "Mulai perjalanan".
- Pesan error menyebut apa yang gagal, objeknya, dan langkah berikutnya. Bukan "Terjadi kesalahan".
- Empty state menjelaskan cara mengisi, bukan "Tidak ada data".
- Semua teks UI melalui `t()` dengan `id` dan `en`.

## 4. Kode Slop

- Komentar satu baris `// Judul`. Tanpa banner `===`/`---`, tanpa komentar yang mengulang kode, tanpa mojibake.
- Tanpa barrel `index.ts` kosong, tanpa wrapper/abstraksi untuk satu pemakai.
- Tanpa hex/rgba lepas: pakai token. Token baru wajib di light dan dark.
- Tanpa `!important`, tanpa `z-index` baru di luar tangga yang ada (lihat DESIGN.md bagian 5).
- Tanpa kode mati, `console.log`, atau fallback untuk skenario yang tidak mungkin terjadi.
- Jangan ubah perilaku lama saat refactor tampilan (fidelity 100%).

## 5. Layout

- Halaman publik harus scrollable (`overflow-y-auto`). Jangan kunci viewport di root konten.
- Kerapatan informasi tinggi: padding window `12px 14px`, baris tabel `10px 14px`. Jangan membengkakkan spacing demi "lega".
- Hover tidak menggeser layout.

## 6. Checklist Review

Centang semua sebelum menyatakan selesai:

- [ ] Tidak ada bulatan macOS.
- [ ] Tidak ada kartu melayang, lencana kepercayaan, atau ilustrasi generik baru.
- [ ] Tidak ada gradient dekoratif baru; tidak ada emoji ikon.
- [ ] Semua warna dari token; token baru ada di `:root` dan `[data-theme="dark"]`.
- [ ] Data teknis memakai font mono.
- [ ] Kotak ikon, header seksi, toggle, kartu terpilih memakai `components/ui/` (bukan className salinan).
- [ ] State lengkap: hover, fokus, disabled, loading, empty, error.
- [ ] Teks lewat `t()`, `id` dan `en` terisi.
- [ ] Komponen yang sudah ada dipakai ulang; component-list diperbarui bila menambah.
- [ ] Light dan dark dicek; `bun run build`, `bun run lint`, dan `bun run check:ui` bersih.
- [ ] Copy konkret, tanpa kata kosong.
