import { agentApi } from './client'

export interface AuthMe {
  username: string
  role: string
}

export interface AuthMeV2 {
  id: number
  username: string
  email: string
  role: 'superadmin' | 'admin' | 'user'
  status: 'active' | 'suspended' | 'pending'
  displayName: string
  avatarUrl: string
  cloudflareStatus: 'active' | 'invalid' | 'unconfigured'
  createdAt: string
  lastLoginAt: string | null
}

export interface SetupStatusResponse {
  needsSetup: boolean
  databaseReady: boolean
  databaseError?: string
}

export interface InitializeSetupPayload {
  username: string
  email: string
  password: string
  confirmPassword: string
  displayName?: string
}

export const loginAgent = (username: string, password: string) =>
  agentApi.post<{ ok: boolean; username: string }>('/api/v1/auth/login', { username, password }).then((r) => r.data)

export const logoutAgent = () =>
  agentApi.post<{ ok: boolean }>('/api/v1/auth/logout').then((r) => r.data)

export const getSetupStatus = () =>
  agentApi.get<SetupStatusResponse>('/api/v1/setup/status').then((r) => r.data)

export const initializeSetup = (payload: InitializeSetupPayload) =>
  agentApi.post<{ ok: boolean; username: string; role: string }>('/api/v1/setup/initialize', payload).then((r) => r.data)

export const getMe = () =>
  agentApi.get<AuthMe>('/api/v1/me').then((r) => r.data)

export const getMeV2 = () =>
  agentApi.get<AuthMeV2>('/api/v1/me').then((r) => r.data)

export interface FrontendRevisionResponse {
  revision: string
}

export const getFrontendRevision = () =>
  agentApi.get<FrontendRevisionResponse>('/api/v1/frontend/revision').then((r) => r.data)
