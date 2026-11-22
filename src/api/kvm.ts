import { agentApi } from './client'

export type KvmQualityMode = 'fast' | 'balanced' | 'quality'

export interface KvmStatus {
  enabled: boolean
  available: boolean
  installed: boolean
  xvfbInstalled?: boolean
  activeDisplays?: string[]
  activeDisplay?: string
  resolution?: string
  mode?: string
  host: string
  port: number
  display: string
  os: string
}

export interface KvmTokenResponse {
  ok: boolean
  token: string
  url: string
  expiresAt: string
}

export interface KvmRevokeResponse {
  ok: boolean
  epoch: number
}

export interface KvmResolutionResponse {
  ok: boolean
  resolution: string
  applied: boolean
  restarted: boolean
}

export const getKvmStatus = (token?: string) =>
  agentApi
    .get<KvmStatus>('/api/v1/kvm/status', {
      params: token ? { token } : undefined,
    })
    .then((r) => r.data)

export const createKvmToken = () =>
  agentApi.post<KvmTokenResponse>('/api/v1/kvm/token').then((r) => r.data)

export const revokeKvmTokens = () =>
  agentApi.post<KvmRevokeResponse>('/api/v1/kvm/token/revoke').then((r) => r.data)

export const setKvmResolution = (resolution: string, token?: string) =>
  agentApi
    .post<KvmResolutionResponse>(
      '/api/v1/kvm/resolution',
      { resolution },
      { params: token ? { token } : undefined },
    )
    .then((r) => r.data)

export const probeKvm = () =>
  agentApi.post<KvmStatus>('/api/v1/kvm/probe').then((r) => r.data)

export const installKvm = () =>
  agentApi.post<{ ok: boolean; message?: string }>('/api/v1/kvm/install').then((r) => r.data)

export const startKvm = () =>
  agentApi.post<{ ok: boolean; running?: boolean; mode?: string; display?: string; resolution?: string; message?: string }>('/api/v1/kvm/start').then((r) => r.data)

export const stopKvm = () =>
  agentApi.post<{ ok: boolean; running?: boolean }>('/api/v1/kvm/stop').then((r) => r.data)

export function resolveKvmWsUrl(token?: string): string {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  const base = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${window.location.host}${base}/kvm/ws`
  if (!token) return url
  return `${url}?token=${encodeURIComponent(token)}`
}
