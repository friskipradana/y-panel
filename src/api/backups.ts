import { agentApi } from './client'

export interface BackupTarget {
  id: number
  ownerUserId: number
  name: string
  kind: 'local' | 's3'
  localDir?: string
  s3Endpoint?: string
  s3Region?: string
  s3Bucket?: string
  s3Prefix?: string
  s3ForcePathStyle: boolean
  hasCredentials: boolean
  createdAt: string
  updatedAt: string
}

export interface BackupJob {
  id: number
  ownerUserId: number
  targetId: number
  targetName: string
  targetKind: string
  name: string
  scope: 'database' | 'project' | 'docker-volume' | 'panel-config'
  resourceId: number
  resourceName: string
  intervalHours: number
  retentionCount: number
  enabled: boolean
  lastStatus: string
  lastRunAt?: string
  nextRunAt?: string
  createdAt: string
  updatedAt: string
}

export interface BackupRun {
  id: number
  jobId: number
  jobName: string
  ownerUserId: number
  targetId: number
  scope: 'database' | 'project' | 'docker-volume' | 'panel-config'
  resourceId: number
  resourceName: string
  status: 'running' | 'success' | 'failed'
  storageKind: string
  storageKey: string
  sizeBytes: number
  sha256: string
  errorMessage?: string
  startedAt: string
  finishedAt?: string
}

export interface BackupOverview {
  targets: BackupTarget[]
  jobs: BackupJob[]
  runs: BackupRun[]
  databases: { id: number; name: string; engine: string }[]
  projects: { id: number; name: string; workingDir: string }[]
  volumes?: string[]
  isSuper?: boolean
  defaultLocalDir: string
}

export interface CreateBackupTargetInput {
  name: string
  kind: 'local' | 's3'
  localDir?: string
  s3Endpoint?: string
  s3Region?: string
  s3Bucket?: string
  s3Prefix?: string
  s3AccessKey?: string
  s3SecretKey?: string
  s3ForcePathStyle?: boolean
}

export interface CreateBackupJobInput {
  targetId: number
  name?: string
  scope: 'database' | 'project' | 'docker-volume' | 'panel-config'
  resourceId: number
  resourceName?: string
  intervalHours: number
  retentionCount: number
  enabled: boolean
}

export const getBackupOverview = () =>
  agentApi.get<BackupOverview>('/api/v1/backups/overview').then((r) => r.data)

export const createBackupTarget = (payload: CreateBackupTargetInput) =>
  agentApi.post<BackupTarget>('/api/v1/backups/targets', payload).then((r) => r.data)

export const testBackupTarget = (id: number) =>
  agentApi.post<{ ok: boolean; message: string }>(`/api/v1/backups/targets/${id}/test`).then((r) => r.data)

export const deleteBackupTarget = (id: number) =>
  agentApi.delete(`/api/v1/backups/targets/${id}`).then((r) => r.data)

export const createBackupJob = (payload: CreateBackupJobInput) =>
  agentApi.post<BackupJob>('/api/v1/backups/jobs', payload).then((r) => r.data)

export const updateBackupJob = (id: number, payload: { enabled?: boolean; intervalHours?: number; retentionCount?: number }) =>
  agentApi.patch<BackupJob>(`/api/v1/backups/jobs/${id}`, payload).then((r) => r.data)

export const deleteBackupJob = (id: number) =>
  agentApi.delete(`/api/v1/backups/jobs/${id}`).then((r) => r.data)

export const runBackupJobNow = (id: number) =>
  agentApi.post<{ ok: boolean; run: BackupRun }>(`/api/v1/backups/jobs/${id}/run`).then((r) => r.data)

export const restoreBackupRun = (id: number) =>
  agentApi.post<{ ok: boolean; message: string; summary?: string }>(`/api/v1/backups/runs/${id}/restore`).then((r) => r.data)

export const deleteBackupRun = (id: number) =>
  agentApi.delete(`/api/v1/backups/runs/${id}`).then((r) => r.data)

export const backupRunDownloadUrl = (id: number) => {
  const apiBase = import.meta.env.VITE_AGENT_API_BASE || '/api/v1'
  return `${apiBase}/backups/runs/${id}/download`
}
