#!/usr/bin/env bun
// CLI helper untuk membaca, mencari, memverifikasi, dan memperbarui Project Memory Reneo.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(__dirname, '..')
const REFS_DIR = path.join(SKILL_DIR, 'references')
const ROOT_DIR = path.resolve(SKILL_DIR, '../../..')

function listFiles(dir, extFilter = null) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && (!extFilter || d.name.endsWith(extFilter)))
    .map((d) => d.name)
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

function cmdStatus() {
  const refFiles = listFiles(REFS_DIR, '.md')
  const windows = listFiles(path.join(ROOT_DIR, 'src/components/windows'), '.tsx')
  const uiKit = listFiles(path.join(ROOT_DIR, 'src/components/ui'), '.tsx')
  const stores = listFiles(path.join(ROOT_DIR, 'src/store'), '.ts')
  const hooks = [
    ...listFiles(path.join(ROOT_DIR, 'src/hooks'), '.ts'),
    ...listFiles(path.join(ROOT_DIR, 'src/hooks'), '.tsx'),
  ]
  const goPkgs = listDirs(path.join(ROOT_DIR, 'internal'))
  const migrations = listFiles(path.join(ROOT_DIR, 'internal/database/migrations'), '.sql')

  console.log('=== Reneo Project Memory Status ===')
  console.log(`Memory Reference Files : ${refFiles.length} (${refFiles.join(', ')})`)
  console.log(`Live Windows (.tsx)    : ${windows.length}`)
  console.log(`Live UI Kit (.tsx)     : ${uiKit.length}`)
  console.log(`Live Stores (.ts)      : ${stores.length}`)
  console.log(`Live Hooks (.ts/.tsx)  : ${hooks.length}`)
  console.log(`Live Go Packages       : ${goPkgs.length}`)
  console.log(`Live SQL Migrations    : ${migrations.length}`)
}

function cmdSearch(query) {
  if (!query) {
    console.error('Usage: bun memory.mjs search <keyword>')
    process.exit(1)
  }
  const q = query.toLowerCase()
  const refFiles = listFiles(REFS_DIR, '.md')
  let matches = 0

  for (const file of refFiles) {
    const fullPath = path.join(REFS_DIR, file)
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(q)) {
        console.log(`[${file}:${idx + 1}] ${line.trim()}`)
        matches++
      }
    })
  }
  console.log(`\nTotal matches: ${matches}`)
}

function cmdVerify() {
  const frontendMap = fs.readFileSync(path.join(REFS_DIR, 'frontend-map.md'), 'utf8')
  const backendMap = fs.readFileSync(path.join(REFS_DIR, 'backend-map.md'), 'utf8')

  const windows = listFiles(path.join(ROOT_DIR, 'src/components/windows'), '.tsx')
  const uiKit = listFiles(path.join(ROOT_DIR, 'src/components/ui'), '.tsx')
  const stores = listFiles(path.join(ROOT_DIR, 'src/store'), '.ts')
  const goPkgs = listDirs(path.join(ROOT_DIR, 'internal'))

  const missing = []

  for (const w of windows) {
    if (!frontendMap.includes(w)) missing.push(`Window belum tercatat di frontend-map.md: ${w}`)
  }
  for (const u of uiKit) {
    if (!frontendMap.includes(u)) missing.push(`UI Kit belum tercatat di frontend-map.md: ${u}`)
  }
  for (const s of stores) {
    if (!frontendMap.includes(s)) missing.push(`Store belum tercatat di frontend-map.md: ${s}`)
  }
  for (const pkg of goPkgs) {
    if (!backendMap.includes(`internal/${pkg}`)) {
      missing.push(`Package Go belum tercatat di backend-map.md: internal/${pkg}`)
    }
  }

  if (missing.length === 0) {
    console.log('OK: Seluruh Window, UI Kit, Store, dan Package Go sinkron dengan basis memori.')
  } else {
    console.log('PERINGATAN: Ditemukan item baru yang belum masuk ke memori:')
    for (const item of missing) console.log(` - ${item}`)
    process.exitCode = 1
  }
}

function cmdLog(message) {
  if (!message) {
    console.error('Usage: bun memory.mjs log "<catatan>"')
    process.exit(1)
  }
  const notesPath = path.join(REFS_DIR, 'session-notes.md')
  const dateStr = new Date().toISOString().slice(0, 10)
  const entry = `- **[${dateStr}]** ${message}\n`
  fs.appendFileSync(notesPath, entry, 'utf8')
  console.log(`Catatan berhasil ditambahkan ke session-notes.md: ${entry.trim()}`)
}

const [, , action, ...rest] = process.argv
const arg = rest.join(' ').trim()

switch (action) {
  case 'status':
    cmdStatus()
    break
  case 'search':
    cmdSearch(arg)
    break
  case 'verify':
    cmdVerify()
    break
  case 'log':
    cmdLog(arg)
    break
  default:
    console.log('Usage: bun .agents/skills/project-memory/scripts/memory.mjs <status|search|verify|log>')
    break
}

