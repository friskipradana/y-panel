import { agentApi } from './client'
import type {
  ChangelogResponse,
  DatabaseStatusResponse,
  EditableSystemSettings,
  SystemLogsResponse,
  SystemSummary,
  UpdatePanelOriginsPayload,
  UpdatePanelPortPayload,
  UpdateSystemSettingsPayload,
  ResetDatabasePasswordResponse,
  ResetPrimaryPanelPasswordPayload,
  ResetPrimaryPanelPasswordResponse,
} from '@/types'

export const getSystemSummary = () =>
  agentApi.get<SystemSummary>('/api/v1/system/summary').then((r) => r.data)

export const getSystemLogs = (service = 'reneo', limit = 160) =>
  agentApi.get<SystemLogsResponse>('/api/v1/system/logs', { params: { service, limit } }).then((r) => r.data)

export const getSystemChangelog = () =>
  agentApi.get<ChangelogResponse>('/api/v1/system/changelog').then((r) => r.data)

export const getDatabaseStatus = () =>
  agentApi.get<DatabaseStatusResponse>('/api/v1/database/status').then((r) => r.data)

export const truncateDatabaseData = (target: string, days: number) =>
  agentApi.post<{ ok: boolean; affected: number }>('/api/v1/database/truncate', { target, days }).then((r) => r.data)

export const getEditableSystemSettings = () =>
  agentApi.get<EditableSystemSettings>('/api/v1/settings/system').then((r) => r.data)

export const updateEditableSystemSettings = (payload: UpdateSystemSettingsPayload) =>
  agentApi.post<EditableSystemSettings>('/api/v1/settings/system', payload).then((r) => r.data)

export const updatePanelPort = (payload: UpdatePanelPortPayload) =>
  agentApi.post<EditableSystemSettings>('/api/v1/settings/panel-port', payload).then((r) => r.data)

export const updatePanelOrigins = (payload: UpdatePanelOriginsPayload) =>
  agentApi.post<EditableSystemSettings>('/api/v1/settings/panel-origins', payload).then((r) => r.data)

export const resetDatabasePassword = () =>
  agentApi.post<ResetDatabasePasswordResponse>('/api/v1/settings/database/reset-password').then((r) => r.data)

export const resetPrimaryPanelPassword = (payload: ResetPrimaryPanelPasswordPayload) =>
  agentApi.post<ResetPrimaryPanelPasswordResponse>('/api/v1/settings/panel-primary/reset-password', payload).then((r) => r.data)

export const getWallpaper = () =>
  agentApi.get<{ data: string }>('/api/v1/settings/wallpaper').then((r) => r.data)

export const updateWallpaper = (data: string) =>
  agentApi.post<{ ok: boolean }>('/api/v1/settings/wallpaper', { data }).then((r) => r.data)

export interface PingResult {
  ok: boolean
  host: string
  mode: 'icmp' | 'tcp'
  latencyMs: number
  resolved?: string
  error?: string
  checkedAt: number
}

// Server-side reachability probe: ICMP when port is 0, otherwise TCP connect
export const pingHost = (host: string, port = 0) =>
  agentApi.post<PingResult>('/api/v1/tools/ping', { host, port }).then((r) => r.data)

// Server-side history and per-user widget layout
export interface SystemHistoryPoint {
  t: number
  v: number
}

export const getSystemHistory = (since = 0) =>
  agentApi
    .get<{ series: Record<string, SystemHistoryPoint[]> }>('/api/v1/system/history', { params: since > 0 ? { since } : undefined })
    .then((r) => r.data.series)

export interface WidgetLayoutResponse {
  data: { placedWidgets?: unknown; mobile?: unknown } | null
  updatedAt: string | null
}

export interface DemoInfo {
  enabled: boolean
  username?: string
  password?: string
  readOnly?: boolean
}

export interface DemoSettings {
  enabled: boolean
  username: string
  password?: string
  /** env = set by PANEL_DEMO_PASSWORD, panel = chosen in Settings */
  source: 'env' | 'panel' | 'default'
}

export const getDemoSettings = () => agentApi.get<DemoSettings>('/api/v1/settings/demo').then((r) => r.data)

export const setDemoSettings = (enabled: boolean) =>
  agentApi.put<DemoSettings>('/api/v1/settings/demo', { enabled }).then((r) => r.data)

export interface PublicContributors {
  items: Array<{ login: string; url: string }>
  repo: string
}

export const getPublicContributors = () =>
  agentApi.get<PublicContributors>('/api/v1/public/contributors').then((r) => r.data)

export interface SiteSettings {
  landingEnabled: boolean
  indexingEnabled: boolean
  hostingEnabled: boolean
  /** Days an account keeps working after its plan ended; 0 suspends at once */
  graceDays: number
  /** Where the order buttons of the landing page lead */
  orderUrl: string
  /** The superadmin accepted Ookla's licence for its command line client */
  ooklaLicenseAccepted: boolean
}

export const getSiteSettings = () => agentApi.get<SiteSettings>('/api/v1/settings/site').then((r) => r.data)

export const setSiteSettings = (patch: Partial<SiteSettings>) =>
  agentApi.put<SiteSettings>('/api/v1/settings/site', patch).then((r) => r.data)

/** What the public pages may show; no login needed */
export interface PublicSite {
  landing: boolean
  hosting: boolean
}

export const getPublicSite = () => agentApi.get<PublicSite>('/api/v1/public/site').then((r) => r.data)

export const getDemoInfo = () => agentApi.get<DemoInfo>('/api/v1/public/demo').then((r) => r.data)

export const getMyWidgets = () => agentApi.get<WidgetLayoutResponse>('/api/v1/me/widgets').then((r) => r.data)

export const putMyWidgets = (data: { placedWidgets: unknown; mobile?: unknown }) =>
  agentApi.put<{ ok: boolean }>('/api/v1/me/widgets', { data }).then((r) => r.data)

export interface UpdateInfo {
  enabled: boolean
  current: string
  latest: string
  available: boolean
  releaseUrl?: string
  notes?: string
  publishedAt?: string
  checkedAt?: string
  canApply: boolean
  error?: string
}

export interface UpdateState {
  state: 'idle' | 'running' | 'done' | 'failed'
  from?: string
  to?: string
  startedAt?: string
  log?: string[]
}

export const getUpdateInfo = (refresh = false) =>
  agentApi.get<UpdateInfo>('/api/v1/system/update', { params: refresh ? { refresh: 1 } : undefined }).then((r) => r.data)

export const getUpdateStatus = () =>
  agentApi.get<UpdateState>('/api/v1/system/update/status').then((r) => r.data)

export const applyUpdate = (version?: string) =>
  agentApi.post<{ ok: boolean; state: UpdateState; startedAt: string }>('/api/v1/system/update/apply', { version, confirm: true }).then((r) => r.data)

