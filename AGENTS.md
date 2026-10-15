# Reneo

Panel server Linux bergaya desktop: React 19 + TypeScript + Vite (frontend), Go agent (backend). Aturan proyek umum ada di [.agents/AGENTS.md](.agents/AGENTS.md).

## Desain UI

Setiap perubahan UI wajib mengikuti aturan berikut dan skill `anti-slop` (`.Codex/skills/anti-slop`).

@.agents/rules/design-system.md
@.agents/rules/component-list.md
@.agents/rules/ui-components.md

Referensi lengkap (baca saat mengerjakan visual): [DESIGN.md](DESIGN.md).

## Perintah

- `bun run dev` menjalankan agent + UI
- `bun run build` harus exit 0 tanpa warning
- `bun run lint`
- `bun run check:ui` memvalidasi aturan UI (harus 0 error)
- `go test ./...`

Branch aktif: `main-runtime-dev`. Rilis: `main-runtime`.
