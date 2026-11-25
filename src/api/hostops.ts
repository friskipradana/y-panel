import { agentApi } from './client'

export interface SystemdService {
  unit: string
  loadState: string
  activeState: string
  subState: string
  description: string
}

export interface HostCronJob {
  id: string
  name: string
  schedule: string
  command: string
  enabled: boolean
  managed: boolean
}

export interface HostOpsOverview {
  os: string
  systemdAvailable: boolean
  cronAvailable: boolean
  services: SystemdService[]
  cronJobs: HostCronJob[]
  systemdError?: string
  cronError?: string
}

export const getHostOpsOverview = () =>
  agentApi.get<HostOpsOverview>('/api/v1/hostops/overview').then((r) => r.data)

export const controlSystemdService = (unit: string, action: 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable') =>
  agentApi.post(`/api/v1/hostops/systemd/${encodeURIComponent(unit)}/${action}`).then((r) => r.data)

export const getSystemdServiceLogs = (unit: string, lines = 150) =>
  agentApi.get<{ logs: string }>(`/api/v1/hostops/systemd/${encodeURIComponent(unit)}/logs`, { params: { lines } }).then((r) => r.data.logs)

export const saveHostCronJob = (payload: { id?: string; name: string; schedule: string; command: string; enabled: boolean }) =>
  agentApi.post<HostCronJob>('/api/v1/hostops/cron', payload).then((r) => r.data)

export const deleteHostCronJob = (id: string) =>
  agentApi.delete(`/api/v1/hostops/cron/${encodeURIComponent(id)}`).then((r) => r.data)

export const runHostCronJobNow = (id: string) =>
  agentApi.post<{ ok: boolean; output: string; error?: string }>(`/api/v1/hostops/cron/${encodeURIComponent(id)}/run`).then((r) => r.data)
