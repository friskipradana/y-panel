import type { WindowKind, WindowState } from '@/types'
import { Z } from '@/lib/zLayers'

export const DEFAULTS: Record<
  WindowKind,
  { title: string; width: number; height: number; singleton?: boolean }
> = {
  // XL — Data & Grid Workstation (1040 x 528)
  apps: { title: 'Docker', width: 1040, height: 528, singleton: true },
  kubernetes: { title: 'Kubernetes', width: 1080, height: 580, singleton: true },
  backups: { title: 'Backup & Restore', width: 1020, height: 560, singleton: true },
  uptime: { title: 'Uptime & SSL', width: 1020, height: 560, singleton: true },
  services: { title: 'Cron & Systemd', width: 1040, height: 560, singleton: true },
  database: { title: 'Database', width: 1040, height: 528, singleton: true },
  tunnels: { title: 'Cloudflare', width: 1040, height: 528, singleton: true },
  projects: { title: 'Projects', width: 1040, height: 528, singleton: true },
  users: { title: 'User Management', width: 1040, height: 528, singleton: true },
  'file-editor': { title: 'Code Editor', width: 1040, height: 528, singleton: true },
  'app-catalog': { title: 'App Catalog', width: 1040, height: 560, singleton: true },
  'installed-app': { title: 'Installed App', width: 1040, height: 620, singleton: false },
  'app-licenses': { title: 'Kelola Lisensi Aplikasi', width: 980, height: 580, singleton: true },
  'dev-desk': { title: 'Dev Desk', width: 1080, height: 600, singleton: true },
  'page-studio': { title: 'Page Studio', width: 1080, height: 600, singleton: true },

  // L — Management & Monitoring (880 x 530)
  system: { title: 'System Info', width: 880, height: 530, singleton: true },
  'system-logs': { title: 'System Logs', width: 880, height: 530, singleton: true },
  'file-manager': { title: 'File Manager', width: 880, height: 530, singleton: true },
  settings: { title: 'Settings', width: 960, height: 600, singleton: true },
  hosting: { title: 'Hosting', width: 880, height: 530, singleton: true },
  firewall: { title: 'Firewall', width: 880, height: 530, singleton: true },
  email: { title: 'Email', width: 880, height: 530, singleton: true },
  docs: { title: 'Docs', width: 880, height: 530, singleton: true },

  // M — Terminal & 2-Column Gauge/Stats (840 x 540)
  kvm: { title: 'KVM Host Display', width: 980, height: 620, singleton: true },
  speedtest: { title: 'Speed Test', width: 840, height: 540, singleton: true },
  'host-terminal': { title: 'Host Terminal', width: 840, height: 540, singleton: true },
  terminal: { title: 'Terminal', width: 640, height: 400, singleton: true },

  // S — Compact Utility & Dialogs (540 x 580)
  profile: { title: 'Profile & Integrasi', width: 540, height: 580, singleton: true },
  widgets: { title: 'Widgets', width: 640, height: 530, singleton: true },
  changelog: { title: 'Changelog', width: 580, height: 580, singleton: true },
  trash: { title: 'Trash', width: 520, height: 360, singleton: true },
}

const Z_NORMAL = Z.windowNormal
const Z_MAXIMIZED = Z.windowMaximized
const Z_FOCUS_BOOST = Z.windowFocused
const Z_PIP = Z.windowPip
const Z_FULLSCREEN = Z.windowFullscreen

export function reorder(windows: WindowState[]) {
  const non = windows.filter((w) => !w.isFullscreen && !w.isPip)
  const pip = windows.filter((w) => !w.isFullscreen && Boolean(w.isPip))
  const full = windows.filter((w) => Boolean(w.isFullscreen))

  non.forEach((w, i) => {
    w.zIndex = (w.isMaximized ? Z_MAXIMIZED : Z_NORMAL) + i
  })

  pip.forEach((w, i) => {
    w.zIndex = Z_PIP + i
  })

  full.forEach((w, i) => {
    w.zIndex = Z_FULLSCREEN + i
  })
}

export function bringToFront(windows: WindowState[], id: string) {
  const index = windows.findIndex((w) => w.id === id)
  if (index === -1) return

  const win = windows[index]
  const isFullscreen = win.isFullscreen
  const isPip = Boolean(win.isPip) && !isFullscreen

  const nonFull = windows.filter((w) => !w.isFullscreen && !w.isPip)
  const pip = windows.filter((w) => !w.isFullscreen && Boolean(w.isPip))
  const full = windows.filter((w) => Boolean(w.isFullscreen))

  const promote = (list: WindowState[]) => {
    const idx = list.findIndex((w) => w.id === id)
    if (idx !== -1 && idx !== list.length - 1) {
      const [w] = list.splice(idx, 1)
      list.push(w)
    }
  }

  if (isFullscreen) promote(full)
  else if (isPip) promote(pip)
  else promote(nonFull)

  windows.length = 0
  windows.push(...nonFull, ...pip, ...full)
  reorder(windows)

  if (!isFullscreen && !isPip) {
    win.zIndex = Z_FOCUS_BOOST
  }
}

export function nextWindowTitle(kind: WindowKind, windows: WindowState[]) {
  const def = DEFAULTS[kind]
  if (def.singleton) return def.title
  const count = windows.filter((w) => w.kind === kind).length + 1
  return count === 1 ? def.title : `${def.title} ${count}`
}

export function createWindowId(kind: WindowKind) {
  return `${kind}:${Math.random().toString(36).slice(2, 8)}`
}

