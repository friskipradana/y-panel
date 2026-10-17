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
  /** account that manages this one (superadmin or an admin) */
  parentId?: number | null
  /** plan and subdomains; only for the superadmin while hosting mode is on, not for the superadmin account itself */
  hosting?: UserHosting
}

export type UserPlanState = 'none' | 'active' | 'grace' | 'expired'

export interface UserHosting {
  planId: number | null
  planName: string
  expiresAt: string | null
  state: UserPlanState
  graceEndsAt: string | null
  subdomains: number
  maxSubdomains: number
}

export interface UserListParams extends PaginationParams {
  status?: 'active' | 'suspended'
  role?: string
  /** a plan id, or "none" */
  plan?: string
  planState?: UserPlanState | 'expiring'
}

export interface UsersSummary {
  total: number
  active: number
  suspended: number
  noPlan: number
  planActive: number
  grace: number
  expired: number
  expiring: number
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

export const listUsers = (params?: UserListParams) =>
  agentApi
    .get<PaginatedResponse<PanelUser>>('/api/v1/users', {
      params: {
        ...withPagination(params).params,
        status: params?.status || undefined,
        role: params?.role || undefined,
        plan: params?.plan || undefined,
        planState: params?.planState || undefined,
      },
    })
    .then((r) => r.data)

export const getUsersSummary = () =>
  agentApi.get<{ summary: UsersSummary; hosting: boolean }>('/api/v1/users/summary').then((r) => r.data)

export const createUser = (payload: {
  username: string
  email: string
  password: string
  role?: string
  displayName?: string
  /** superadmin with hosting mode on: put the new account on a plan (months: how long) */
  planId?: number
  months?: number
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
