// Builds internal/httpserver/doc_knowledge.json: what the documentation AI is allowed to know about each Reneo feature.
// Everything in it comes from the panel itself (app catalog descriptions and the texts its screens show), so a guide names
// the buttons that really exist. Run again after changing texts; `--check` fails when the file is out of date.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { MENU_ITEMS } from '../src/components/taskbar/appCatalog'
import { en } from '../src/lib/locales/en'
import { id } from '../src/lib/locales/id'

const OUT = 'internal/httpserver/doc_knowledge.json'
const MAX_CHARS = 9000

interface Feature {
  key: string
  /** window of the app catalog whose description is used */
  kind: string
  /** key prefixes of the screen texts that belong to the feature */
  prefixes: string[]
  access: 'all' | 'admin' | 'superadmin'
  /** slugs in docs/articles that already explain it */
  official?: string[]
  keywords: string[]
}

const FEATURES: Feature[] = [
  { key: 'docker', kind: 'apps', prefixes: ['docker.'], access: 'all', keywords: ['container', 'image', 'compose', 'volume', 'network'] },
  { key: 'kubernetes', kind: 'kubernetes', prefixes: ['k8s.'], access: 'admin', keywords: ['k3s', 'cluster', 'pod', 'deployment', 'helm'] },
  { key: 'projects', kind: 'projects', prefixes: ['projects.', 'webhook.'], access: 'all', official: ['project-dan-runtime'], keywords: ['deploy', 'node', 'bun', 'static', 'runtime', 'webhook'] },
  { key: 'database', kind: 'database', prefixes: ['database.', 'databases.'], access: 'all', official: ['mengelola-database'], keywords: ['postgres', 'mysql', 'mariadb', 'mongodb', 'redis', 'sql'] },
  { key: 'files', kind: 'file-manager', prefixes: ['fileManager.', 'fileEditor.'], access: 'all', keywords: ['file', 'berkas', 'folder', 'upload', 'unggah', 'editor'] },
  { key: 'terminal', kind: 'host-terminal', prefixes: ['hostTerminal.', 'terminal.'], access: 'all', keywords: ['terminal', 'ssh', 'shell', 'perintah'] },
  { key: 'cloudflare', kind: 'tunnels', prefixes: ['tunnels.', 'cfguide.'], access: 'all', official: ['mengaktifkan-cloudflare-for-saas'], keywords: ['cloudflare', 'tunnel', 'domain', 'dns', 'waf'] },
  { key: 'public-ip', kind: 'settings', prefixes: ['publicip.'], access: 'superadmin', official: ['ip-publik-tanpa-tunnel'], keywords: ['ip publik', 'public ip', 'sertifikat', 'nginx', 'apache', 'https'] },
  { key: 'firewall', kind: 'firewall', prefixes: ['firewall.', 'hardening.'], access: 'superadmin', keywords: ['firewall', 'ufw', 'port', 'fail2ban', 'ssh key'] },
  { key: 'backups', kind: 'backups', prefixes: ['backups.'], access: 'admin', keywords: ['backup', 'restore', 'cadangan', 's3', 'r2'] },
  { key: 'uptime', kind: 'uptime', prefixes: ['uptime.'], access: 'admin', keywords: ['uptime', 'monitor', 'ssl', 'down'] },
  { key: 'services', kind: 'services', prefixes: ['services.'], access: 'superadmin', keywords: ['systemd', 'cron', 'service', 'jadwal'] },
  { key: 'system', kind: 'system', prefixes: ['system.', 'systemLogs.'], access: 'all', keywords: ['cpu', 'ram', 'disk', 'monitor', 'log'] },
  { key: 'speedtest', kind: 'speedtest', prefixes: ['speedtest.'], access: 'all', keywords: ['speedtest', 'kecepatan', 'latency'] },
  { key: 'users', kind: 'users', prefixes: ['users.', 'account.', 'profile.'], access: 'admin', official: ['akun-kuota-dan-demo'], keywords: ['akun', 'user', 'role', 'kuota', 'password'] },
  { key: 'hosting', kind: 'hosting', prefixes: ['hosting.'], access: 'admin', keywords: ['hosting', 'paket', 'pesanan', 'voucher', 'subdomain', 'pembayaran'] },
  { key: 'notifications', kind: 'settings', prefixes: ['notify.'], access: 'all', keywords: ['notifikasi', 'telegram', 'whatsapp', 'waha'] },
  { key: 'settings', kind: 'settings', prefixes: ['settings.', 'server.', 'update.'], access: 'all', keywords: ['pengaturan', 'setting', 'tema', 'wallpaper', 'pembaruan'] },
  { key: 'app-catalog', kind: 'app-catalog', prefixes: ['appCatalog.', 'appLicenses.'], access: 'all', keywords: ['aplikasi', 'katalog', 'lisensi', 'pasang'] },
  { key: 'email', kind: 'email', prefixes: ['email.'], access: 'admin', keywords: ['email', 'smtp', 'imap', 'mx', 'spf', 'dkim'] },
  { key: 'dev-desk', kind: 'dev-desk', prefixes: ['devdesk.'], access: 'admin', keywords: ['invoice', 'penawaran', 'klien', 'checklist'] },
  { key: 'page-studio', kind: 'page-studio', prefixes: ['studio.'], access: 'admin', keywords: ['landing', 'halaman', 'website', 'builder'] },
  { key: 'kvm', kind: 'kvm', prefixes: ['kvm.'], access: 'superadmin', keywords: ['kvm', 'vnc', 'layar', 'remote'] },
  { key: 'widgets', kind: 'widgets', prefixes: ['widget.', 'widgets.', 'desktop.', 'mobile.'], access: 'all', keywords: ['widget', 'desktop', 'ikon', 'ponsel'] },
]

const NAMES: Record<string, { id: string; en: string }> = {
  'public-ip': { id: 'IP Publik (Pengaturan)', en: 'Public IP (Settings)' },
  notifications: { id: 'Notifikasi (Pengaturan dan Profil)', en: 'Notifications (Settings and Profile)' },
}

function labels(dict: Record<string, string>, prefixes: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  let size = 0
  // short labels (names of buttons and fields) first, explanations after, until the budget is used
  const all = Object.entries(dict)
    .filter(([key]) => prefixes.some((p) => key.startsWith(p)))
    .map(([, value]) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value.length > 1 && value.length <= 220)
  for (const value of [...all.filter((v) => v.length <= 40), ...all.filter((v) => v.length > 40)]) {
    if (seen.has(value) || size + value.length > MAX_CHARS) continue
    seen.add(value)
    out.push(value)
    size += value.length
  }
  return out
}

const dictId = id as unknown as Record<string, string>
const dictEn = en as unknown as Record<string, string>

const features = FEATURES.map((f) => {
  const item = MENU_ITEMS.find((m) => m.kind === f.kind)
  if (!item) throw new Error(`no app catalog entry for ${f.kind}`)
  const name = NAMES[f.key] ?? { id: dictId[`window.${f.kind}`], en: dictEn[`window.${f.kind}`] }
  if (!name.id || !name.en) throw new Error(`no window title for ${f.kind}`)
  return {
    key: f.key,
    access: f.access,
    name,
    description: { id: item.descId, en: item.descEn },
    keywords: f.keywords,
    official: f.official ?? [],
    // the screenshot of the window, when there is one (public/doc-shots)
    shot: existsSync(`public/doc-shots/${f.key}.webp`) ? `/doc-shots/${f.key}.webp` : '',
    labels: { id: labels(dictId, f.prefixes), en: labels(dictEn, f.prefixes) },
  }
})

const next = `${JSON.stringify(features, null, 1)}\n`

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n')
  if (current !== next) {
    console.error(`${OUT} is out of date. Run: bun run gen:docs-knowledge`)
    process.exit(1)
  }
} else {
  writeFileSync(OUT, next)
  console.log(`${OUT}: ${features.length} features`)
}
