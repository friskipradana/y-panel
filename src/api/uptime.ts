import { agentApi } from './client'

export interface UptimeMonitor {
  id: number
  ownerUserId: number
  name: string
  kind: 'http' | 'tcp'
  target: string
  expectedStatus: number
  intervalSeconds: number
  timeoutSeconds: number
  enabled: boolean
  notifyEnabled: boolean
  lastStatus: 'unknown' | 'up' | 'down'
  lastLatencyMs: number
  lastHttpCode: number
  lastError?: string
  sslExpiresAt?: string
  sslDaysLeft?: number | null
  lastCheckedAt?: string
  uptime24hPct: number
  recentBars: string[]
}

export interface UptimeCheck {
  id: number
  monitorId: number
  status: 'up' | 'down'
  httpCode: number
  latencyMs: number
  errorText?: string
  checkedAt: string
}

export const listUptimeMonitors = () =>
  agentApi.get<{ items: UptimeMonitor[] }>('/api/v1/uptime/monitors').then((r) => r.data.items)

export const createUptimeMonitor = (payload: {
  name: string
  kind: 'http' | 'tcp'
  target: string
  expectedStatus: number
  intervalSeconds: number
  timeoutSeconds: number
  enabled: boolean
  notifyEnabled: boolean
}) => agentApi.post<UptimeMonitor>('/api/v1/uptime/monitors', payload).then((r) => r.data)

export const updateUptimeMonitor = (id: number, payload: { enabled?: boolean; notifyEnabled?: boolean }) =>
  agentApi.patch<UptimeMonitor>(`/api/v1/uptime/monitors/${id}`, payload).then((r) => r.data)

export const deleteUptimeMonitor = (id: number) =>
  agentApi.delete(`/api/v1/uptime/monitors/${id}`).then((r) => r.data)

export const checkUptimeMonitorNow = (id: number) =>
  agentApi.post<UptimeMonitor>(`/api/v1/uptime/monitors/${id}/check`).then((r) => r.data)

export const listUptimeHistory = (id: number) =>
  agentApi.get<{ items: UptimeCheck[] }>(`/api/v1/uptime/monitors/${id}/history`).then((r) => r.data.items)
