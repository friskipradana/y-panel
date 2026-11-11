import { agentApi } from './client'

export interface KvmStatus {
  enabled: boolean
  available: boolean
  installed: boolean
  xvfbInstalled?: boolean
  activeDisplays?: string[]
  host: string
  port: number
  display: string
  os: string
}

export const getKvmStatus = () =>
  agentApi.get<KvmStatus>('/api/v1/kvm/status').then((r) => r.data)

export const probeKvm = () =>
  agentApi.post<KvmStatus>('/api/v1/kvm/probe').then((r) => r.data)

export const installKvm = () =>
  agentApi.post<{ ok: boolean; message?: string }>('/api/v1/kvm/install').then((r) => r.data)

export const startKvm = () =>
  agentApi.post<{ ok: boolean; running?: boolean; mode?: string; display?: string; message?: string }>('/api/v1/kvm/start').then((r) => r.data)

export const stopKvm = () =>
  agentApi.post<{ ok: boolean; running?: boolean }>('/api/v1/kvm/stop').then((r) => r.data)

export function resolveKvmWsUrl(): string {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const base = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${base}/kvm/ws`
}
