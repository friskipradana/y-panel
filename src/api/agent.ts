import axios, { AxiosError } from 'axios'
import type {
  ChangelogResponse,
  DatabaseStatus,
  DatabaseStatusResponse,
  EditableSystemSettings,
  ResetDatabasePasswordResponse,
  SystemLogsResponse,
  TerminalSessionStartResponse,
  UpdateSystemSettingsPayload,
} from '@/types'
import { runtimeLogger } from '@/lib/runtimeLogger'

export interface BootstrapStatus {
  installed: boolean
  channel: string
  bindAddr: string
  portainerUrl: string
  hostname: string
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

export const getBootstrapStatus = () =>
  agentApi.get<BootstrapStatus>('/api/v1/bootstrap/status').then((r) => r.data)

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

export const resetDatabasePassword = () =>
  agentApi.post<ResetDatabasePasswordResponse>('/api/v1/settings/database/reset-password').then((r) => r.data)
