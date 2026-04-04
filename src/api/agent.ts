import axios, { AxiosError } from 'axios'
import type { TerminalSessionStartResponse } from '@/types'

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
    if (error.response?.status === 401 && unauthorizedEventArmed) {
      unauthorizedEventArmed = false
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
