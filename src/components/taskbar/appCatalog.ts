import type { WindowKind } from '@/types'

// The applications of the panel, shared by the Applications menu and the quick search so the two
// always list the same things. Access per account comes from canAccessWindow, not from here.

export type CategoryKey = 'all' | 'system' | 'dev' | 'network' | 'info'

export interface AppMenuItem {
  kind: WindowKind
  descId: string
  descEn: string
  category: CategoryKey
}

export const MENU_ITEMS: AppMenuItem[] = [
  {
    kind: 'apps',
    descId: 'Manajemen container, image, dan resource Docker',
    descEn: 'Docker containers, images, and lifecycle management',
    category: 'system',
  },
  {
    kind: 'host-terminal',
    descId: 'Terminal Linux host interaktif dengan akses root',
    descEn: 'Interactive Linux host PTY terminal with root shell',
    category: 'system',
  },
  {
    kind: 'system',
    descId: 'Monitor penggunaan CPU, RAM, disk, dan sensor suhu',
    descEn: 'Hardware monitor, CPU/RAM usage, and temperatures',
    category: 'system',
  },
  {
    kind: 'system-logs',
    descId: 'Log streaming journald, syslog, dan error server',
    descEn: 'Live journald log streaming and system event logs',
    category: 'system',
  },
  {
    kind: 'widgets',
    descId: 'Galeri modul widget desktop untuk memantau waktu, sistem, dan host',
    descEn: 'Desktop widget gallery for real-time time, system, and host monitors',
    category: 'system',
  },
  {
    kind: 'database',
    descId: 'Kelola database PostgreSQL, MySQL, dan backup',
    descEn: 'Manage PostgreSQL/MySQL databases and backups',
    category: 'dev',
  },
  {
    kind: 'file-manager',
    descId: 'Eksplorasi direktori, upload berkas, dan izin file',
    descEn: 'Browse filesystem, upload/download files, and permissions',
    category: 'dev',
  },
  {
    kind: 'file-editor',
    descId: 'Editor kode Monaco dengan syntax highlight',
    descEn: 'Monaco code editor with syntax highlighting',
    category: 'dev',
  },
  {
    kind: 'projects',
    descId: 'Deployer stack aplikasi Node, Go, Python, dan statis',
    descEn: 'Deploy Node.js, Go, Python apps and web stacks',
    category: 'dev',
  },
  {
    kind: 'tunnels',
    descId: 'Kelola tunnel Cloudflare daemon dan public routing',
    descEn: 'Cloudflare ingress tunnels and public hostname routing',
    category: 'network',
  },
  {
    kind: 'users',
    descId: 'Kelola akun panel dan kontrol hak akses RBAC',
    descEn: 'Manage panel users and role-based permissions',
    category: 'network',
  },
  {
    kind: 'speedtest',
    descId: 'Ukur kecepatan unduh, unggah, dan latensi ke panel serta ke internet',
    descEn: 'Measure download, upload and latency to the panel and to the internet',
    category: 'network',
  },
  {
    kind: 'hosting',
    descId: 'Jual ruang di server ini: paket, domain, pesanan, voucher, dan pembayaran',
    descEn: 'Sell space on this server: plans, domains, orders, vouchers and payments',
    category: 'network',
  },
  {
    kind: 'firewall',
    descId: 'Atur firewall server (ufw): aturan, port yang mendengarkan, dan kebijakan bawaan',
    descEn: 'Manage the server firewall (ufw): rules, listening ports and default policies',
    category: 'network',
  },
  {
    kind: 'settings',
    descId: 'Preferensi sistem, port daemon, dan keamanan',
    descEn: 'System preferences, agent ports, and security',
    category: 'info',
  },
  {
    kind: 'docs',
    descId: 'Panduan lengkap dan dokumentasi fitur Reneo',
    descEn: 'Comprehensive guides and documentation',
    category: 'info',
  },
  {
    kind: 'changelog',
    descId: 'Catatan rilis dan riwayat pembaruan sistem',
    descEn: 'Release notes and version update history',
    category: 'info',
  },
]

export const CATEGORIES: { key: CategoryKey; labelId: string; labelEn: string }[] = [
  { key: 'all', labelId: 'Semua Aplikasi', labelEn: 'All Applications' },
  { key: 'system', labelId: 'Sistem & Server', labelEn: 'System & Server' },
  { key: 'dev', labelId: 'Development & Data', labelEn: 'Development & Data' },
  { key: 'network', labelId: 'Jaringan & Akses', labelEn: 'Network & Access' },
  { key: 'info', labelId: 'Pengaturan & Info', labelEn: 'Settings & Info' },
]

// Words people type for an app besides its name (Indonesian and English), for the quick search
export const APP_KEYWORDS: Partial<Record<WindowKind, string[]>> = {
  apps: ['docker', 'container', 'kontainer', 'image', 'compose', 'deploy', 'network'],
  'host-terminal': ['terminal', 'shell', 'bash', 'ssh', 'console', 'konsol', 'command', 'perintah'],
  system: ['system', 'sistem', 'cpu', 'ram', 'memory', 'memori', 'disk', 'monitor', 'suhu', 'uptime', 'info'],
  'system-logs': ['log', 'logs', 'journal', 'journald', 'error', 'catatan'],
  widgets: ['widget', 'gallery', 'galeri', 'note', 'catatan', 'ping'],
  database: ['database', 'db', 'sql', 'postgres', 'mysql', 'mariadb', 'mongo', 'redis', 'adminer'],
  'file-manager': ['file', 'files', 'berkas', 'folder', 'upload', 'unggah', 'download', 'unduh', 'zip', 'permission', 'chmod'],
  'file-editor': ['editor', 'code', 'kode', 'monaco', 'edit'],
  projects: ['project', 'proyek', 'deploy', 'node', 'python', 'php', 'static', 'statis', 'website', 'situs', 'app'],
  tunnels: ['cloudflare', 'tunnel', 'dns', 'domain', 'subdomain', 'redirect', 'hostname'],
  users: ['user', 'users', 'pengguna', 'akun', 'account', 'role', 'quota', 'kuota', 'paket', 'plan'],
  hosting: ['hosting', 'paket', 'plan', 'harga', 'promo', 'voucher', 'pesanan', 'order', 'demo', 'domain', 'subdomain', 'masa tenggang', 'jual', 'sell', 'payment', 'pembayaran', 'bayar', 'bank', 'gateway', 'midtrans', 'xendit', 'webhook', 'rekening', 'transfer', 'notifikasi bank'],
  firewall: ['firewall', 'ufw', 'iptables', 'port', 'blokir', 'block', 'izinkan', 'allow', 'deny', 'aturan', 'rule', 'keamanan', 'security', 'ip', 'whitelist'],
  speedtest: ['speed', 'speedtest', 'kecepatan', 'internet', 'bandwidth', 'ping', 'latency', 'latensi', 'download', 'upload'],
  settings: ['settings', 'setting', 'pengaturan', 'preferensi', 'tema', 'theme', 'wallpaper', 'keamanan', 'security', 'token', 'password'],
  docs: ['docs', 'dokumentasi', 'panduan', 'guide', 'bantuan', 'help', 'artikel'],
  changelog: ['changelog', 'rilis', 'release', 'versi', 'version', 'update', 'pembaruan'],
}
