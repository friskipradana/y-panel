import type { WindowKind, WindowState } from '@/types'
import { Z } from '@/lib/zLayers'

export const DEFAULTS: Record<
  WindowKind,
  { title: string; width: number; height: number; singleton?: boolean }
> = {
  // XL — Data & Grid Workstation (1040 x 528)
  apps: { title: 'Docker', width: 1040, height: 528, singleton: true },
  database: { title: 'Database', width: 1040, height: 528, singleton: true },
  tunnels: { title: 'Cloudflare', width: 1040, height: 528, singleton: true },
  projects: { title: 'Projects', width: 1040, height: 528, singleton: true },
  users: { title: 'User Management', width: 1040, height: 528, singleton: true },
  'file-editor': { title: 'Code Editor', width: 1040, height: 528, singleton: true },

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
const Z_FULLSCREEN = Z.windowFullscreen

export function reorder(windows: WindowState[]) {
  const non = windows.filter((w) => !w.isFullscreen)
  const full = windows.filter((w) => !w.isFullscreen === false)

  non.forEach((w, i) => {
    w.zIndex = (w.isMaximized ? Z_MAXIMIZED : Z_NORMAL) + i
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

  const nonFull = windows.filter((w) => !w.isFullscreen)
  const full = windows.filter((w) => w.isFullscreen)

  if (isFullscreen) {
    const fi = full.findIndex((w) => w.id === id)
    if (fi !== -1 && fi !== full.length - 1) {
      const [w] = full.splice(fi, 1)
      full.push(w)
    }
  } else {
    const ni = nonFull.findIndex((w) => w.id === id)
    if (ni !== -1 && ni !== nonFull.length - 1) {
      const [w] = nonFull.splice(ni, 1)
      nonFull.push(w)
    }
  }

  windows.length = 0
  windows.push(...nonFull, ...full)
  reorder(windows)

  if (!isFullscreen) {
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

