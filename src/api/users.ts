import { agentApi, withPagination } from './client'
import type { PaginatedResponse, PaginationParams } from '@/types'

export interface PanelUser {
  id: number
  username: string
  email: string
  role: string
  status: string
  displayName: string
  avatarUrl: string
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

export interface UserQuota {
  userId: number
  maxProjects: number
  maxTunnels: number
  maxDatabases: number
  diskQuotaMb: number
  cpuLimitPct: number
  memoryLimitMb: number
}

export const listUsers = (params?: PaginationParams) =>
  agentApi.get<PaginatedResponse<PanelUser>>('/api/v1/users', withPagination(params)).then((r) => r.data)

export const createUser = (payload: {
  username: string
  email: string
  password: string
  role?: string
  displayName?: string
}) => agentApi.post<PanelUser>('/api/v1/users', payload).then((r) => r.data)

export const getUserByID = (id: number) =>
  agentApi.get<PanelUser>(`/api/v1/users/${id}`).then((r) => r.data)

export const updateUser = (id: number, fields: Partial<PanelUser>) =>
  agentApi.patch<PanelUser>(`/api/v1/users/${id}`, fields).then((r) => r.data)

export const deleteUser = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/users/${id}`).then((r) => r.data)

export const suspendUser = (id: number) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/users/${id}/suspend`).then((r) => r.data)

export const activateUser = (id: number) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/users/${id}/activate`).then((r) => r.data)

export const getUserQuota = (id: number) =>
  agentApi.get<UserQuota>(`/api/v1/users/${id}/quota`).then((r) => r.data)

export const updateUserQuota = (id: number, quota: Partial<UserQuota>) =>
  agentApi.patch<{ ok: boolean }>(`/api/v1/users/${id}/quota`, quota).then((r) => r.data)

export interface AccountUsage {
  userId: number
  projects: number
  projectsActive: number
  tunnels: number
  databases: number
  diskUsedMb: number
  diskScanPartial: boolean
  quota: UserQuota | null
}

export const getUserUsage = (id: number) =>
  agentApi.get<AccountUsage>(`/api/v1/users/${id}/usage`).then((r) => r.data)

export const getMyUsage = () => agentApi.get<AccountUsage>('/api/v1/me/usage').then((r) => r.data)

export const resetUserPassword = (id: number, newPassword: string) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/users/${id}/password`, { newPassword }).then((r) => r.data)

export const changeMyPassword = (currentPassword: string, newPassword: string) =>
  agentApi.post<{ ok: boolean }>('/api/v1/me/password', { currentPassword, newPassword }).then((r) => r.data)
