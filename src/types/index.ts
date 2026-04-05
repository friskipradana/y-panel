// ── Window Manager ──────────────────────────────────────────────
export type WindowKind =
  | 'apps'
  | 'terminal'
  | 'host-terminal'
  | 'system'
  | 'system-logs'
  | 'docs'
  | 'changelog'
  | 'portainer'
  | 'settings'
  | 'trash'

export type WindowId = WindowKind

export interface WindowState {
  id: string
  kind: WindowKind
  title: string
  icon: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  isMinimized: boolean
  isMaximized: boolean
  lastAction?: 'open' | 'minimize' | 'restore'
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
  url?: string
  windowId?: WindowKind
}

export interface TerminalSessionStartResponse {
  sessionId: string
}

export interface SystemLogEntry {
  line: string
}

export interface SystemLogsResponse {
  service: string
  limit: number
  lines: SystemLogEntry[]
}
