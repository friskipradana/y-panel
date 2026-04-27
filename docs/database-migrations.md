# Database Migrations

YPanel sekarang memakai **versioned SQL migrations** untuk PostgreSQL.

## Prinsip

- schema **tidak lagi dimutasi otomatis** saat runtime biasa membuka koneksi database
- migrasi dijalankan secara **eksplisit**
- setiap migration punya bagian `Up` dan `Down`
- rollback yang didukung saat ini adalah **1 migration terakhir**
- deploy akan **gagal lebih awal** jika migration gagal

## Lokasi Migration

Semua file migration ada di:

- `internal/database/migrations/*.sql`

Format file:

```sql
-- +goose Up
-- SQL apply

-- +goose Down
-- SQL rollback
```

## Perintah CLI

### Buat template migration baru

```bash
ui-panel-agent migrate create add_example_table
```

### Jalankan semua migration pending

```bash
ui-panel-agent migrate up
```

### Lihat status migration

```bash
ui-panel-agent migrate status
```

### Rollback 1 migration terakhir

```bash
ui-panel-agent migrate rollback
```

Alias yang didukung:

```bash
ui-panel-agent migrate down
```

## Runtime Linux CLI

Perintah `ui-panel` sekarang punya menu untuk:

- jalankan migrasi database
- rollback migrasi terakhir
- lihat status migrasi

## Workflow Development

1. buat migration baru dengan `migrate create`
2. isi SQL `Up` dan `Down`
3. jalankan `migrate up`
4. test rollback dengan `migrate rollback`
5. commit migration file sebagai artefak immutable

## Aturan Penting

- **jangan edit migration lama** yang sudah pernah dipakai di environment lain
- jika ada perbaikan, buat migration baru
- untuk perubahan data/backfill, tulis SQL yang aman dan deterministic
- untuk constraint/index unik di data lama, lakukan cleanup data dulu di migration sebelum create constraint

## Deploy

Deploy script dan installer Linux sekarang akan menjalankan:

```bash
ui-panel-agent migrate up
```

sebelum service dianggap siap.

Jika migration gagal:
- deploy dihentikan
- service tidak dianggap healthy
- error schema terlihat lebih awal, bukan saat runtime path tertentu dipanggil

## Kompatibilitas untuk Server Existing

Jika ada server yang **sudah pernah menjalankan migration lama** saat skema masih berada di satu file besar, status migration sekarang bisa menampilkan version berikut sebagai `pending`:

- `000002_projects_and_tunnels`
- `000003_operations_and_docs`
- `000004_docker_compose_templates`

Itu normal.

Karena SQL di migration split sudah dibuat idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... IF NOT EXISTS`, dan cleanup aman), server existing cukup menjalankan sekali:

```bash
ui-panel-agent migrate up
```

Tujuannya agar histori version di `goose_db_version` ikut mengejar layout migration terbaru tanpa merusak schema yang sudah ada.
