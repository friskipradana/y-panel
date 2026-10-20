import { agentApi } from './client'

export interface AuthMe {
  username: string
  role: string
}

export interface AuthMeV2 {
  id: number
  username: string
  email: string
  role: 'superadmin' | 'admin' | 'user' | 'demo'
  status: 'active' | 'suspended' | 'pending'
  displayName: string
  avatarUrl: string
  cloudflareStatus: 'active' | 'invalid' | 'unconfigured'
  createdAt: string
  lastLoginAt: string | null
  /** An admin gave this account its password: it must choose its own first */
  mustChangePassword?: boolean
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

export const getMeV2 = () =>
  agentApi.get<AuthMeV2>('/api/v1/me').then((r) => r.data)

// probe: without a session the agent answers with no username instead of a 401 in the console
export const probeMe = () =>
  agentApi.get<AuthMeV2>('/api/v1/me', { params: { probe: 1 } }).then((r) => r.data)

export interface FrontendRevisionResponse {
  revision: string
  /** Installed panel version reported by the agent (empty when unknown) */
  version?: string
}

export const getFrontendRevision = () =>
  agentApi.get<FrontendRevisionResponse>('/api/v1/frontend/revision').then((r) => r.data)
