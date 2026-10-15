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
  data: { placedWidgets?: unknown } | null
  updatedAt: string | null
}

export const getMyWidgets = () => agentApi.get<WidgetLayoutResponse>('/api/v1/me/widgets').then((r) => r.data)

export const putMyWidgets = (data: { placedWidgets: unknown }) =>
  agentApi.put<{ ok: boolean }>('/api/v1/me/widgets', { data }).then((r) => r.data)
