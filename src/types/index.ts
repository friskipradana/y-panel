// ── Window Manager ──────────────────────────────────────────────
export type WindowId =
  | 'apps'
  | 'terminal'
  | 'system'
  | 'docs'
  | 'changelog'
  | 'portainer'
  | 'settings'
  | 'trash'

export interface WindowState {
  id: WindowId
  title: string
  icon: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  isMinimized: boolean
  isMaximized: boolean
}

// ── Docker / Portainer ───────────────────────────────────────────
export interface Container {
  Id: string
  Names: string[]
  Image: string
  State: 'running' | 'exited' | 'paused' | 'restarting' | 'dead'
  Status: string
  Ports: { PrivatePort: number; PublicPort?: number; Type: string }[]
  Created: number
}

export interface ContainerStats {
  id: string
  name: string
  cpu_percent: number
  memory_usage: number
  memory_limit: number
  memory_percent: number
}

export interface PortainerAuth {
  jwt: string
}

// ── App shortcut ─────────────────────────────────────────────────
export interface AppShortcut {
  id: string
  label: string
  icon: string
  color: string
  url?: string           // buka tab baru
  windowId?: WindowId    // buka window internal
}
