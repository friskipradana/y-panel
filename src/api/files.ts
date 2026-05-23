import { agentApi } from './client'

export interface FileRootAccessStatus {
  enabled: boolean
  expiresAt?: string
}

export const getFileRootAccessStatus = () =>
  agentApi.get<FileRootAccessStatus>('/api/v1/files/root-access/status').then((r) => r.data)

export const verifyFileRootAccess = (password: string) =>
  agentApi.post<FileRootAccessStatus>('/api/v1/files/root-access/verify', { password }).then((r) => r.data)

export const revokeFileRootAccess = () =>
  agentApi.post<FileRootAccessStatus>('/api/v1/files/root-access/revoke').then((r) => r.data)
