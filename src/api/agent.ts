import axios, { AxiosError } from 'axios'
import type {
  ChangelogResponse,
  DatabaseStatus,
  DatabaseStatusResponse,
  EditableSystemSettings,
  ResetDatabasePasswordResponse,
  SystemLogsResponse,
  TerminalSessionStartResponse,
  UpdatePanelOriginsPayload,
  UpdatePanelPortPayload,
  UpdateSystemSettingsPayload,
} from '@/types'
import { runtimeLogger } from '@/lib/runtimeLogger'

export interface FrontendRevisionResponse {
  revision: string
}

export interface AuthMe {
  username: string
  role: string
}

export interface UsageStat {
  total: number
  used: number
}

export interface SystemSummary {
  hostname: string
  osName: string
  kernel: string
  uptimeSeconds: number
  cpuUsagePercent: number
  memory: UsageStat
  storage: UsageStat
  dockerInstalled: boolean
  dockerReachable: boolean
  dockerStatus: string
  portainerReachable: boolean
  portainerUrl: string
  stateDir: string
  database: DatabaseStatus
  ipAddresses: string[]
}

const agentApi = axios.create({
  baseURL: import.meta.env.VITE_AGENT_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let unauthorizedEventArmed = true

agentApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    runtimeLogger.error('api', 'request failed', {
      method: error.config?.method,
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
    })

    if (error.response?.status === 401 && unauthorizedEventArmed) {
      unauthorizedEventArmed = false
      runtimeLogger.warn('auth', 'session expired event dispatched')
      window.dispatchEvent(new CustomEvent('panel:session-expired'))
      window.setTimeout(() => {
        unauthorizedEventArmed = true
      }, 250)
    }

    return Promise.reject(error)
  },
)

export const getFrontendRevision = () =>
  agentApi.get<FrontendRevisionResponse>('/api/v1/frontend/revision').then((r) => r.data)

export const loginAgent = (username: string, password: string) =>
  agentApi.post<{ ok: boolean; username: string }>('/api/v1/auth/login', { username, password }).then((r) => r.data)

export const logoutAgent = () =>
  agentApi.post<{ ok: boolean }>('/api/v1/auth/logout').then((r) => r.data)

export const getMe = () =>
  agentApi.get<AuthMe>('/api/v1/me').then((r) => r.data)

export const getSystemSummary = () =>
  agentApi.get<SystemSummary>('/api/v1/system/summary').then((r) => r.data)

export const startTerminalSession = () =>
  agentApi.post<TerminalSessionStartResponse>('/api/v1/terminal/sessions').then((r) => r.data)

export const closeTerminalSession = (sessionId: string) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/terminal/sessions/${sessionId}`).then((r) => r.data)

export const getSystemLogs = (service = 'ui-panel', limit = 160) =>
  agentApi.get<SystemLogsResponse>('/api/v1/system/logs', { params: { service, limit } }).then((r) => r.data)

export const getSystemChangelog = () =>
  agentApi.get<ChangelogResponse>('/api/v1/system/changelog').then((r) => r.data)

export const getDatabaseStatus = () =>
  agentApi.get<DatabaseStatusResponse>('/api/v1/database/status').then((r) => r.data)

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

export interface TerminalPreset {
  id: number
  label: string
  command: string
  sortOrder: number
  createdAt: string
}

export const listTerminalPresets = () =>
  agentApi.get<{ presets: TerminalPreset[] }>('/api/v1/terminal/presets').then((r) => r.data.presets)

export const createTerminalPreset = (label: string, command: string) =>
  agentApi.post<{ preset: TerminalPreset }>('/api/v1/terminal/presets', { label, command }).then((r) => r.data.preset)

export const deleteTerminalPreset = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/terminal/presets/${id}`).then((r) => r.data)

export const resetTerminalPresets = () =>
  agentApi.post<{ ok: boolean; presets: TerminalPreset[] }>('/api/v1/terminal/presets/reset').then((r) => r.data)
