# declaude: membersihkan atribusi AI dari repo GitHub

Skrip `scripts/declaude.ts` menghapus jejak Claude/AI (trailer `Co-Authored-By: Claude`, "Generated with Claude Code") dari seluruh riwayat, force-push hasilnya, lalu memaksa GitHub menghitung ulang daftar Contributors.

Konsepnya mengikuti alat `declaude` (ediiloupatty/declaude) dan ditulis ulang untuk proyek ini tanpa dependensi Python.

## Prasyarat

- `git` dan Bun
- GitHub CLI `gh`, sudah login: `gh auth login` (Windows: `winget install GitHub.cli`, lalu buka terminal baru)
- Hak tulis ke repo (cek lewat `gh repo view`)

## Pemakaian

```bash
# lihat rencana saja, tidak mengubah apa pun
bun run declaude friskipradana/y-panel --local --dry-run

# riwayat lokal sudah bersih: dorong branch dan tag lokal, lalu segarkan Contributors
bun run declaude friskipradana/y-panel --local

# bersihkan dari clone baru remote (tanpa menyentuh working copy)
bun run declaude friskipradana/y-panel
```

| Opsi | Arti |
| :--- | :--- |
| `--local` | pakai working copy ini; cocok bila riwayat lokal sudah dibersihkan |
| `--dry-run` | pindai dan tampilkan rencana, tidak mengubah apa pun |
| `-y` | lewati konfirmasi (tanpa ini harus mengetik `OWNER/REPO`) |
| `--no-refresh` | lewati penyegaran Contributors |
| `--no-backup` | lewati bundle cadangan (tidak disarankan) |
| `--remote NAME` | remote tujuan pada `--local` (default: yang menunjuk ke repo itu) |
| `--pattern RX` | baris yang dihapus (default: co-author Claude/Anthropic dan footer "Generated with") |

## Urutan kerja

1. **Preflight**: `git`, `gh`, login, dan hak tulis diperiksa sebelum apa pun disentuh.
2. **Sumber**: clone baru dari remote, atau working copy ini (`--local`).
3. **Pindai**: semua branch dan tag; tag cadangan lokal `backup/*` dilewati.
4. **Cadangan**: bundle di `~/.declaude-backups/`, dipulihkan dengan `git -C <repo> fetch <bundle> '*:*'`.
5. **Bersihkan**: hanya pesan commit yang ditulis ulang (`git filter-branch --msg-filter`); kode, author, dan committer tidak diubah. Tag ikut ditulis ulang.
6. **Verifikasi**: bila masih ada atribusi di ref mana pun, tidak ada yang di-push.
7. **Push**: `--force` untuk branch dan tag (tag `backup/*` tidak pernah dikirim).
8. **Segarkan**: branch default diganti nama lalu dikembalikan (mereset cache grafik), satu commit kosong `chore: refresh GitHub contributors` dibuat lewat API, lalu daftar kontributor dipantau sampai akun AI hilang; diulang sampai 3 kali.

## Catatan

- **Menimpa riwayat remote.** Klon lain harus `git fetch --all --prune --tags --force` lalu mereset branch. PR terbuka perlu dibuat ulang.
- **Satu commit kosong** tertinggal di branch default dengan nama akun `gh` Anda.
- **Identitas author atau committer Claude** hanya diperingatkan, tidak diubah. Untuk itu pakai `git filter-repo --mailmap`.
- **Branch protection atau aturan tag** dapat menolak push atau rename; skrip menghentikan push dengan pesan jelas, dan hanya melewati rename.
- **Cache GitHub** bisa lambat. Jika skrip berakhir dengan "daftar masih menampilkan akun", riwayatnya sudah bersih; cek lagi di jendela privat beberapa menit kemudian atau jalankan ulang.
- **PR lama** menyimpan commit di `refs/pull/N/head` yang tidak bisa dihapus pengguna. Grafik dihitung dari branch default, jadi biasanya tetap bersih; bila tidak, hanya GitHub Support yang dapat membersihkannya.
- **Verifikasi independen:** `git clone --mirror https://github.com/OWNER/REPO.git /tmp/check` lalu `git -C /tmp/check log --all --format='%s%n%b' | grep -ci 'claude\|anthropic'` harus mencetak `0` (cocokkan "Claude Desktop" atau `CLAUDE.md` di isi yang sah secara manual).
- Untuk menghentikan Claude Code menambah trailer di masa depan: set `"includeCoAuthoredBy": false` di `~/.claude/settings.json`.
