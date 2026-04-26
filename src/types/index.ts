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
  | 'users'
  | 'projects'
  | 'tunnels'
  | 'profile'

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
  projects: {
    total: number
    active: number
    degraded: number
    drift: number
    attention: number
    reconcileFresh: boolean
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
  Networks?: string[]
  IpAddresses?: string[]
  Created: number
  Labels?: Record<string, string>
  ProjectName?: string
  OwnerUserId?: number
  OwnerName?: string
  Source?: string
  ComposePath?: string
  Resources?: {
    cpuLimitPct?: string | number
    memoryLimitMb?: string | number
    diskQuotaMb?: string | number
  }
  RestartCount?: number
  ExitCode?: number
  Health?: string
  StartedAt?: string
  FinishedAt?: string
  CreatedAt?: string
  Metadata?: Record<string, unknown>
}

export interface DockerOwnerPreview {
  id: number
  username: string
  displayName: string
  role: string
  homeDir: string
  dockerRootDir: string
  quota?: {
    userId: number
    diskQuotaMb: number
    cpuLimitPct: number
    memoryLimitMb: number
    maxProjects?: number
    maxTunnels?: number
  }
}

export interface PaginationParams {
  q?: string
  limit?: number
  offset?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit?: number
  offset?: number
}

export interface PortBindingInput {
  hostIp?: string
  hostPort: string
  containerPort: string
  protocol?: string
}

export interface EnvVarInput {
  key: string
  value: string
}

export type DockerEnvMode = 'form' | 'raw'

export interface DockerRegistryAuthPayload {
  enabled?: boolean
  registry?: string
  usernameOrEmail?: string
  password?: string
}

export interface DockerContainerConfig {
  name: string
  image: string
  network: string
  ports: PortBindingInput[]
  env: EnvVarInput[]
  envMode?: DockerEnvMode
  envRaw?: string
  volumes: VolumeBindingInput[]
}

export interface VolumeBindingInput {
  hostPath: string
  containerPath: string
  readOnly?: boolean
}

export interface DockerDeployImagePayload {
  ownerUserId?: number
  name: string
  image: string
  network?: string
  ports: PortBindingInput[]
  env: EnvVarInput[]
  envMode?: DockerEnvMode
  envRaw?: string
  registryAuth?: DockerRegistryAuthPayload
  volumes: VolumeBindingInput[]
}

export interface DockerPullImagePayload {
  image: string
  registryAuth?: DockerRegistryAuthPayload
}

export interface DockerDeployComposePayload {
  ownerUserId?: number
  name: string
  composeYaml: string
  registryAuth?: DockerRegistryAuthPayload
  replaceContainerId?: string
}

export interface DeployComposePayload {
  name: string
  composeYaml: string
}

export interface DockerNetwork {
  Id: string
  Name: string
  Driver: string
  Scope: string
  CreatedAt: string
  Subnet?: string
  Gateway?: string
}

export interface DockerImage {
  Id: string
  Repository: string
  Tag: string
  Size: string
  CreatedAt: string
}

export interface DockerTemplate {
  id: number
  name: string
  description: string
  yamlContent: string
  createdAt: string
}

export interface DockerDeployResponse {
  ok: boolean
  projectName: string
  composePath: string
  projectDir: string
  owner: {
    userId: number
    username: string
    displayName: string
    homeDir: string
    dockerRootDir: string
    diskQuotaMb: number
    cpuLimitPct: number
    memoryLimitMb: number
  }
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
  port: string
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

export interface ResetPrimaryPanelPasswordPayload {
  newPassword: string
  confirmPassword: string
}

export interface ResetPrimaryPanelPasswordResponse {
  ok: boolean
  message: string
  username: string
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
