// UI rules validator: bun run check:ui
// Exit code 1 when a rule marked "error" is violated. Warnings never fail the run.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

type Severity = 'error' | 'warn'
interface Finding {
  rule: string
  severity: Severity
  file: string
  line: number
  text: string
}

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const MAX_LINES = 400

// Files that may legitimately break a rule (documented in DESIGN.md section 10)
const ALLOW: Record<string, string[]> = {
  'icon-box': [
    'src/components/ui/',
    'src/components/desktop/DesktopIcon.tsx',
    'src/components/desktop/LockScreen.tsx',
    'src/components/dock/Dock.tsx',
    'src/components/landing/DesktopShowcase.tsx',
    'src/components/taskbar/ApplicationsMenu.tsx',
    'src/components/taskbar/ProfileMenu.tsx',
    'src/components/windows/settings/tabs/DesktopTab.tsx',
    'src/pages/McpGuidePage.tsx',
  ],
  'emoji': ['src/components/debug/', 'src/lib/locales/'],
  'raw-ui-class': ['src/components/ui/'],
  'raw-modal': ['src/components/ui/'],
  'raw-row': ['src/components/ui/'],
  toggle: ['src/components/ui/'],
  selectable: ['src/components/ui/'],
  'hex-in-tsx': [
    'src/components/common/AppIcon.tsx',
    'src/components/debug/',
    'src/components/landing/',
    'src/pages/',
    'src/components/desktop/LockScreen.tsx',
    'src/components/widgets/',
    'src/components/dock/',
    'src/components/desktop/',
    'src/components/windows/docker/',
    'src/store/',
  ],
  'file-size': [
    'src/lib/locales/',
    'src/components/windows/HostTerminalWindow.tsx',
    'src/components/windows/UsersWindow.tsx',
    'src/components/windows/docker/DeployModal.tsx',
    'src/components/windows/settings/ApiTokensTab.tsx',
    'src/store/themeStore.ts',
    'src/store/windowStore.ts',
    'src/pages/McpGuidePage.tsx',
    'src/pages/LoginPage.tsx',
  ],
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|scss|css)$/.test(name)) out.push(p)
  }
  return out
}

const rel = (p: string) => relative(ROOT, p).split(sep).join('/')
const allowed = (rule: string, file: string) => (ALLOW[rule] ?? []).some((a) => file.startsWith(a))

const findings: Finding[] = []
const add = (rule: string, severity: Severity, file: string, line: number, text: string) => {
  if (allowed(rule, file)) return
  findings.push({ rule, severity, file, line, text: text.trim().slice(0, 140) })
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u
const ICON_BOX = /\bh-(7|8|9|10|11|12) w-(7|8|9|10|11|12)\b/
const MAC_DOTS = /#ff5f5[67]|#ffbd2e|#27c93f|#28c840|#febc2e|traffic-?light/i

for (const abs of walk(SRC)) {
  const file = rel(abs)
  const isTsx = /\.tsx?$/.test(file)
  const text = readFileSync(abs, 'utf8')
  const lines = text.split(/\r?\n/)

  if (lines.length > MAX_LINES && isTsx) {
    add('file-size', 'warn', file, lines.length, `${lines.length} lines (max ${MAX_LINES})`)
  }

  lines.forEach((raw, i) => {
    const n = i + 1
    if (MAC_DOTS.test(raw)) add('mac-dots', 'error', file, n, raw)
    if (isTsx && /console\.log\(/.test(raw)) add('console-log', 'error', file, n, raw)
    if (isTsx && EMOJI.test(raw) && !/^\s*(\/\/|\{\/\*)/.test(raw)) add('emoji', 'error', file, n, raw)
    if (isTsx && /className=["'`][^"'`]*(panel-modal-overlay|docker-modal-overlay|ui-modal-overlay)/.test(raw)) {
      add('raw-modal', 'error', file, n, 'use Modal from components/ui')
    }
    if (isTsx && /className=["'`][^"'`]*\bpanel-table-row\b/.test(raw)) {
      add('raw-row', 'error', file, n, 'use ListRow / EntityRow / DataTable from components/ui')
    }
    if (isTsx && /\bh-6 w-11\b/.test(raw)) add('toggle', 'error', file, n, 'use ToggleSwitch from components/ui')
    if ((isTsx || file.endsWith('.ts')) && /\b(Sparkles?|WandSparkles)\b/.test(raw) && !/^\s*(\/\/|\{\/\*)/.test(raw)) {
      add('no-sparkles', 'error', file, n, 'sparkle icons are banned (AI slop): pick an icon that names the thing')
    }
    if (isTsx && /ring-2 ring-\[var\(--panel-primary-solid\)\]\/30/.test(raw)) {
      add('selectable', 'error', file, n, 'use SelectableCard from components/ui')
    }
    if (isTsx && ICON_BOX.test(raw) && /items-center|place-items-center/.test(raw) && /justify-center|place-items-center/.test(raw) && /rounded/.test(raw)) {
      add('icon-box', 'error', file, n, 'use IconBadge from components/ui')
    }
    if (isTsx && /<(button|span|div|select|input|textarea)\b[^>]*(panel-btn\b|panel-icon-btn\b|panel-badge\b|panel-input\b|panel-select\b|panel-textarea\b)/.test(raw)) {
      add('raw-ui-class', 'warn', file, n, 'use Button/IconButton/Badge/TextInput/Select from components/ui')
    }
    if (isTsx && /(?<![\w-])#[0-9a-fA-F]{6}\b/.test(raw) && !/^\s*(\/\/|\{\/\*)/.test(raw)) {
      add('hex-in-tsx', 'warn', file, n, raw)
    }
    if (isTsx && /(?:title|placeholder|aria-label)="[A-Za-z][^"{}]{3,}"/.test(raw)) {
      add('hardcoded-text', 'warn', file, n, raw)
    }
    if (/outline:\s*none/.test(raw) && file.endsWith('.scss')) {
      const ctx = lines.slice(Math.max(0, i - 25), i + 25).join('\n')
      if (!/focus(-visible|-within)?/.test(ctx)) add('focus-ring', 'warn', file, n, 'outline:none without focus style nearby')
    }
  })
}

const errors = findings.filter((f) => f.severity === 'error')
const warns = findings.filter((f) => f.severity === 'warn')
const byRule = (list: Finding[]) => {
  const m = new Map<string, number>()
  for (const f of list) m.set(f.rule, (m.get(f.rule) ?? 0) + 1)
  return [...m.entries()].map(([r, c]) => `${r}=${c}`).join('  ')
}

for (const f of errors) console.error(`error  ${f.rule.padEnd(14)} ${f.file}:${f.line}  ${f.text}`)
if (process.argv.includes('--warnings')) {
  for (const f of warns) console.warn(`warn   ${f.rule.padEnd(14)} ${f.file}:${f.line}  ${f.text}`)
}
console.log(`\ncheck:ui  errors=${errors.length}  warnings=${warns.length}`)
if (warns.length) console.log(`warnings by rule: ${byRule(warns)} (run with --warnings to list)`)
process.exit(errors.length ? 1 : 0)
