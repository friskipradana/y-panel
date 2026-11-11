import { agentApi } from './client'

export interface KvmStatus {
  enabled: boolean
  available: boolean
  host: string
  port: number
  display: string
  os: string
}

export const getKvmStatus = () =>
  agentApi.get<KvmStatus>('/api/v1/kvm/status').then((r) => r.data)

export const probeKvm = () =>
  agentApi.post<KvmStatus>('/api/v1/kvm/probe').then((r) => r.data)

export function resolveKvmWsUrl(): string {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const base = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${base}/kvm/ws`
}

