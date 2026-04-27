# YPanel Public Assets

Folder ini berisi aset visual publik untuk **YPanel**, termasuk logo, favicon,
brand preview, dan material social/marketing yang disajikan langsung oleh
frontend Vite dari path `/`.

> Contoh: file `public/favicon.svg` akan tersedia sebagai `/favicon.svg` saat
> aplikasi berjalan.

## Filosofi Brand

**YPanel** adalah desktop-style Linux server control panel. Identitas visualnya
menggabungkan tiga ide utama:

1. **Y sebagai pusat kendali**  
   Huruf `Y` merepresentasikan satu titik kontrol yang bercabang ke banyak
   fungsi server: Docker, Projects, Terminal, Files, Cloudflare, Users,
   Database, dan Logs.

2. **Server workspace, bukan dashboard biasa**  
   UI YPanel memakai konsep window, taskbar, dan workspace seperti desktop OS.
   Karena itu aset preview sebaiknya menampilkan window aplikasi asli, bukan
   dashboard generik buatan AI.

3. **Teknis, tenang, dan premium**  
   Palet dark navy dengan aksen cyan-indigo memberi kesan infrastructure,
   terminal, network, dan developer tool yang modern tanpa terasa gaming.

## Palet Warna

| Token      | Hex       | Penggunaan                             |
| ---------- | --------- | -------------------------------------- |
| Deep Navy  | `#020617` | Background utama gelap                 |
| Slate Navy | `#0B1120` | Panel/background sekunder              |
| Cyan       | `#38BDF8` | Aksen utama, highlight, gradient start |
| Indigo     | `#6366F1` | Aksen sekunder, gradient end           |
| Soft White | `#F8FAFC` | Teks utama di background gelap         |
| Muted Text | `#94A3B8` | Tagline, caption, teks sekunder        |

Gradient brand utama:

```css
linear-gradient(135deg, #38BDF8, #6366F1)
```

## Tipografi

Rekomendasi brand:

- **Inter** untuk UI dan body text.
- Wordmark dapat memakai bentuk custom/geometric, tetapi jangan terlalu gaming
  atau sci-fi.
- Tagline utama:

```text
Control your server like a desktop.
```

## Daftar Aset

| File                                          |   Dimensi | Fungsi yang Disarankan                    |
| --------------------------------------------- | --------: | ----------------------------------------- |
| `favicon.svg`                                 | SVG 48x46 | Favicon utama, icon kecil berbasis vector |
| `icons.svg`                                   |       SVG | Set icon/brand vector pendukung           |
| `ChatGPT Image Apr 27, 2026, 10_19_20 AM.png` |  1774x887 | Kandidat brand/logo preview               |
| `ChatGPT Image Apr 27, 2026, 10_20_36 AM.png` |  1983x793 | Kandidat layout logo horizontal/banner    |
| `ChatGPT Image Apr 27, 2026, 10_25_42 AM.png` |  1774x887 | Brand identity sheet/logo guideline       |
| `ChatGPT Image Apr 27, 2026, 11_01_13 AM.png` |  1717x916 | Kandidat social/hero preview              |
| `ChatGPT Image Apr 27, 2026, 11_04_38 AM.png` |  1731x909 | Kandidat social preview berbasis UI asli  |

> Catatan: nama file PNG masih menggunakan nama export mentah dari ChatGPT.
> Untuk production, sebaiknya rename menjadi nama stabil seperti
> `brand-sheet.png`, `social-preview.png`, atau `hero-preview.png`.

## Rekomendasi Naming Production

Saat aset sudah final, gunakan nama yang stabil dan mudah dipakai di kode:

```txt
public/
├── favicon.svg
├── icons.svg
├── ypanel-logo.png
├── ypanel-logo-horizontal.png
├── ypanel-brand-sheet.png
├── ypanel-social-preview.png
├── ypanel-hero-preview.png
└── ypanel-app-preview.png
```

Untuk Open Graph/social sharing, gunakan:

```txt
ypanel-social-preview.png
```

Target ukuran ideal:

```txt
1200x630
```

Jika source lebih besar, simpan source high-res juga, misalnya:

```txt
ypanel-social-preview@2x.png  # 2400x1260
ypanel-social-preview.png     # 1200x630
```

## Penggunaan di HTML

Contoh penggunaan favicon:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

Contoh metadata social preview setelah aset final tersedia:

```html
<meta property="og:title" content="YPanel" />
<meta property="og:description" content="Control your server like a desktop." />
<meta property="og:image" content="/ypanel-social-preview.png" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="YPanel" />
<meta
  name="twitter:description"
  content="Control your server like a desktop."
/>
<meta name="twitter:image" content="/ypanel-social-preview.png" />
```

## Panduan Social Preview

Social preview YPanel sebaiknya memakai **screenshot UI asli** karena nilai
utama produk adalah desktop workspace dengan multi-window.

Komposisi yang direkomendasikan:

- canvas final `1200x630`
- screenshot UI asli sebagai background
- gradient gelap tipis dari kiri ke kanan
- logo YPanel di kiri atau center-left
- tagline pendek di bawah logo
- fitur ringkas opsional:

```text
Docker • Projects • Cloudflare • Terminal • Files
```

Hindari:

- dashboard fiktif/generik
- mockup UI yang tidak sama dengan produk
- glow berlebihan
- warna terlalu ramai
- style gaming/RGB
- teks kecil yang tidak terbaca

## Prompt AI untuk Enhance Social Preview

Gunakan prompt ini jika ingin meningkatkan kualitas gambar tanpa mengubah UI:

```text
Enhance this real YPanel product screenshot for a premium Open Graph social preview.

Preserve the original UI exactly. Do not redesign, repaint, invent, or change
any interface elements. Keep all text, windows, buttons, icons, and layout
faithful to the original screenshot.

Improve only:
- sharpness
- clarity
- subtle contrast
- premium dark navy atmosphere
- soft professional shadows
- slight cyan/indigo accent depth

Make it look crisp and high-resolution for a developer-tool social preview.

Do not:
- alter text
- change the product UI
- add fake dashboard widgets
- distort windows
- over-glow
- make it look gaming
- add noise or artifacts
```

Negative prompt:

```text
fake UI, hallucinated text, distorted text, misspelled labels, extra windows,
cartoon, gaming, neon overload, excessive glow, blurry, noisy, low resolution,
over-sharpened, plastic, unrealistic dashboard, generic SaaS mockup,
changed interface, modified buttons, wrong logo, extra icons, artifacts
```

## Quality Workflow

Untuk hasil paling tajam:

1. Ambil screenshot asli di ukuran `2400x1260` atau lebih tinggi.
2. Compose social preview di Figma/Photoshop pada rasio `1200x630`.
3. Export versi `@2x` (`2400x1260`).
4. Enhance ringan jika perlu.
5. Downscale final ke `1200x630`.

Setting AI enhancer yang aman untuk screenshot UI:

```txt
Creativity / Imagination : Low
Preserve Structure       : High
Preserve Text            : High
Upscale                  : 2x
Sharpen                  : Medium
Noise Reduction          : Low
```

## Do & Don't

### Do

- Gunakan icon `Y` yang tebal dan mudah terbaca.
- Gunakan palet dark navy + cyan/indigo secara konsisten.
- Gunakan screenshot UI asli untuk preview produk.
- Simpan varian transparent, dark, light, dan monochrome jika tersedia.

### Don't

- Jangan gunakan terlalu banyak efek glow.
- Jangan membuat UI preview palsu yang tidak sesuai aplikasi.
- Jangan memakai tagline pada favicon atau app icon.
- Jangan memakai nama file export mentah untuk production final.

## Checklist Asset Final

Sebelum dipakai di production, idealnya tersedia:

- [ ] `favicon.svg`
- [ ] `favicon.ico`
- [ ] `favicon-16.png`
- [ ] `favicon-32.png`
- [ ] `ypanel-icon-192.png`
- [ ] `ypanel-icon-512.png`
- [ ] `ypanel-logo-horizontal.svg/png`
- [ ] `ypanel-social-preview.png` ukuran `1200x630`
- [ ] `ypanel-social-preview@2x.png` ukuran `2400x1260`
- [ ] varian monochrome putih/hitam/slate

## Status Saat Ini

Aset sudah cukup untuk eksplorasi visual dan dokumentasi brand awal. Langkah
berikutnya yang disarankan adalah rename file final, membuat ukuran social
preview standar `1200x630`, lalu menghubungkannya ke metadata `index.html`.
