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
  | 'database'
  | 'trash'
  | 'file-manager'
  | 'file-editor'

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
  isFullscreen: boolean
  lastAction?: 'open' | 'minimize' | 'restore'
  /** Snapshot data for restoring window state after refresh */
  params?: Record<string, any>
}

// ── Docker / Portainer ───────────────────────────────────────────
export interface SystemSummary {
  osName: string
  hostname: string
  kernel: string
  uptimeSeconds: number
  cpuUsagePercent: number
  cpuTemp: number
  memory: {
    total: number
    used: number
  }
  storage: {
    total: number
    used: number
  }
  stateDir: string
  dockerInstalled: boolean
  dockerReachable: boolean
  dockerStatus: string
  portainerUrl: string
  portainerReachable: boolean
  database: {
    connected: boolean
    enabled: boolean
    host: string
    port: number
    user: string
    lastError: string
    changelogCount: number
    runtimeLogCount: number
    settingsAuditCount: number
  }
  ipAddresses: string[]
}

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

export interface EditableSystemSettings {
  hostname: string
  timezone: string
  nameservers: string[]
  dnsMode: string
  managedConfigPath: string
  osName: string
  kernel: string
  bindAddr: string
  allowedHosts: string[]
  allowedOrigins: string[]
  originsRaw: string
}

export interface UpdateSystemSettingsPayload {
  hostname: string
  timezone: string
  nameservers: string[]
}

export interface UpdatePanelPortPayload {
  port: number
}

export interface UpdatePanelOriginsPayload {
  originsRaw: string
}

export interface DatabaseStatus {
  enabled: boolean
  connected: boolean
  host: string
  port: number
  database: string
  user: string
  lastError: string
  changelogCount: number
  runtimeLogCount: number
  settingsAuditCount: number
}

export interface RuntimeDatabaseLog {
  id: number
  service: string
  level: string
  message: string
  metadata: string
  createdAt: string
}

export interface SettingsAuditEntry {
  id: number
  username: string
  hostname: string
  timezone: string
  nameservers: string[]
  createdAt: string
}

export interface DatabaseStatusResponse {
  status: DatabaseStatus
  runtimeLogs: RuntimeDatabaseLog[]
  settingsAudit: SettingsAuditEntry[]
}

export interface ResetDatabasePasswordResponse {
  ok: boolean
  password: string
  message: string
}

export interface ChangelogEntry {
  id: number
  version: string
  title: string
  summary: string
  releasedAt: string
  createdAt: string
}

export interface ChangelogResponse {
  items: ChangelogEntry[]
}
