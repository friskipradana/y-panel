---
name: anti-slop
description: >-
  Enforces strict anti-slop design and engineering guidelines for YPanel.
  Prohibits macOS-style elements (traffic light dots), prevents AI-generated visual clutter,
  and mandates clean Linux/Developer infrastructure aesthetic standards.
---

# Anti-Slop & Design Integrity Guidelines for YPanel

## 1. Zero macOS Aesthetics (Strict Prohibition)
- **DILARANG menggunakan 3 tombol bulat macOS (Merah, Kuning, Hijau / Traffic Light Dots)** di seluruh komponen window, dialog, landing page, atau mockup.
- Gunakan style **Linux / Developer Infrastructure native**:
  - Tombol kontrol minimalis (`_` minimize, `□` maximize, `✕` close) atau tab teknis bersih tanpa dekorasi Mac.
  - Header berorientasi server: `[agent/sys]`, `root@server`, status badge teknis.

## 2. Zero AI Visual Slop
- **Dilarang menambahkan floating badge / card menumpuk** yang tidak memiliki fungsi nyata atau menghalangi konten.
- **Dilarang memakai gambar ilustrasi generik AI** yang tidak merepresentasikan fungsi software sebenarnya.
- **Dilarang menggunakan icon klise AI slop** seperti generic shield badges, checkmark circle trust seals, atau fake certification badges. Gunakan tipografi monospaced / developer plain text yang bersih.
- Utamakan **data real, tipografi tajam, kontras tinggi, dan layout fungsional** yang nyaman dibaca operator server.

## 3. Layout & Scrollability
- Halaman Landing, dokumentasi, dan log panjang **wajib bisa di-scroll secara mulus (`overflow-y-auto`)**.
- Jangan mengunci viewport dengan `overflow-hidden` di level root pada halaman konten/landing.

## 4. Estetika Developer Infrastructure
- Terinspirasi dari standar desain teknis seperti **Cloudflare Zero Trust, Linux Terminals, Grafana, dan Supabase**.
- Palet warna: Dark Slate / Deep Charcoal / True Black dengan aksen Cyan/Indigo yang fungsional.
