import axios, { AxiosError } from 'axios'
import type {
  ChangelogResponse,
  DatabaseStatusResponse,
  EditableSystemSettings,
  ResetDatabasePasswordResponse,
  SystemLogsResponse,
  SystemSummary,
  TerminalSessionStartResponse,
  UpdatePanelOriginsPayload,
  UpdatePanelPortPayload,
  UpdateSystemSettingsPayload,
} from '@/types'
import { runtimeLogger } from '@/lib/runtimeLogger'

import { toast } from 'sonner'

export interface FrontendRevisionResponse {
  revision: string
}

export interface AuthMe {
  username: string
  role: string
}

const agentApi = axios.create({
  baseURL: import.meta.env.VITE_AGENT_BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let unauthorizedEventArmed = true

agentApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const isPublicPath = window.location.pathname === (import.meta.env.VITE_LOGIN_PATH || '/login') || window.location.pathname === '/'
    const isUnauthorized = error.response?.status === 401
    const isRevisionCheck = error.config?.url?.includes('/api/v1/frontend/revision')
    const isStatsWS = error.config?.url?.includes('/api/v1/system/stats/ws')

    // Silent logs on public paths, revision checks, or stats WS to keep console clean
    if (!isUnauthorized || (!isPublicPath && !isRevisionCheck && !isStatsWS)) {
      runtimeLogger.error('api', 'request failed', {
        method: error.config?.method,
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
      })
    }

    if (!error.response) {
      toast.error('Gagal terhubung ke agent', {
        description: 'Pastikan service agent sudah berjalan di host.',
      })
    }

    if (isUnauthorized && unauthorizedEventArmed) {
      unauthorizedEventArmed = false
      
      // Only dispatch session-expired if we are NOT on a public path
      if (!isPublicPath) {
        runtimeLogger.warn('auth', 'session expired event dispatched')
        window.dispatchEvent(new CustomEvent('panel:session-expired'))
      }

      window.setTimeout(() => {
        unauthorizedEventArmed = true
      }, 250)
    }

    return Promise.reject(error)
  },
)

export const getFrontendRevision = () =>
  agentApi.get<FrontendRevisionResponse>('/api/v1/frontend/revision').then((r) => r.data)

export const loginAgent = (username: string, password: string) =>
  agentApi.post<{ ok: boolean; username: string }>('/api/v1/auth/login', { username, password }).then((r) => r.data)

export const logoutAgent = () =>
  agentApi.post<{ ok: boolean }>('/api/v1/auth/logout').then((r) => r.data)

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

export const getSetupStatus = () =>
  agentApi.get<SetupStatusResponse>('/api/v1/setup/status').then((r) => r.data)

export const initializeSetup = (payload: InitializeSetupPayload) =>
  agentApi.post<{ ok: boolean; username: string; role: string }>('/api/v1/setup/initialize', payload).then((r) => r.data)

export const getMe = () =>
  agentApi.get<AuthMe>('/api/v1/me').then((r) => r.data)

export const getSystemSummary = () =>
  agentApi.get<SystemSummary>('/api/v1/system/summary').then((r) => r.data)

export const startTerminalSession = (target = 'local') =>
  agentApi.post<TerminalSessionStartResponse>('/api/v1/terminal/sessions', { target }).then((r) => r.data)

export const closeTerminalSession = (sessionId: string) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/terminal/sessions/${sessionId}`).then((r) => r.data)

export const getSystemLogs = (service = 'ui-panel', limit = 160) =>
  agentApi.get<SystemLogsResponse>('/api/v1/system/logs', { params: { service, limit } }).then((r) => r.data)

export const getSystemChangelog = () =>
  agentApi.get<ChangelogResponse>('/api/v1/system/changelog').then((r) => r.data)

export const getDatabaseStatus = () =>
  agentApi.get<DatabaseStatusResponse>('/api/v1/database/status').then((r) => r.data)

export const truncateDatabaseData = (target: string, days: number) =>
  agentApi.post<{ ok: boolean; affected: number }>('/api/v1/database/truncate', { target, days }).then((r) => r.data)

export const getEditableSystemSettings = () =>
  agentApi.get<EditableSystemSettings>('/api/v1/settings/system').then((r) => r.data)

export const updateEditableSystemSettings = (payload: UpdateSystemSettingsPayload) =>
  agentApi.post<EditableSystemSettings>('/api/v1/settings/system', payload).then((r) => r.data)

export const updatePanelPort = (payload: UpdatePanelPortPayload) =>
  agentApi.post<EditableSystemSettings>('/api/v1/settings/panel-port', payload).then((r) => r.data)

export const updatePanelOrigins = (payload: UpdatePanelOriginsPayload) =>
  agentApi.post<EditableSystemSettings>('/api/v1/settings/panel-origins', payload).then((r) => r.data)

export const resetDatabasePassword = () =>
  agentApi.post<ResetDatabasePasswordResponse>('/api/v1/settings/database/reset-password').then((r) => r.data)

export interface TerminalPreset {
  id: number
  label: string
  command: string
  sortOrder: number
  createdAt: string
}

export const listTerminalPresets = () =>
  agentApi.get<{ presets: TerminalPreset[] }>('/api/v1/terminal/presets').then((r) => r.data.presets)

export const createTerminalPreset = (label: string, command: string) =>
  agentApi.post<{ preset: TerminalPreset }>('/api/v1/terminal/presets', { label, command }).then((r) => r.data.preset)

export const deleteTerminalPreset = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/terminal/presets/${id}`).then((r) => r.data)

export const resetTerminalPresets = () =>
  agentApi.post<{ ok: boolean; presets: TerminalPreset[] }>('/api/v1/terminal/presets/reset').then((r) => r.data)

export const getWallpaper = () =>
  agentApi.get<{ data: string }>('/api/v1/settings/wallpaper').then((r) => r.data)

export const updateWallpaper = (data: string) =>
  agentApi.post<{ ok: boolean }>('/api/v1/settings/wallpaper', { data }).then((r) => r.data)

// ─── Extended AuthMe ──────────────────────────────────────────────────────────

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

export const getMeV2 = () =>
  agentApi.get<AuthMeV2>('/api/v1/me').then((r) => r.data)

// ─── Users ────────────────────────────────────────────────────────────────────

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
  diskQuotaMb: number
  cpuLimitPct: number
  memoryLimitMb: number
}

export const listUsers = (limit = 50, offset = 0) =>
  agentApi
    .get<{ users: PanelUser[]; total: number; limit: number; offset: number }>('/api/v1/users', {
      params: { limit, offset },
    })
    .then((r) => r.data)

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

// ─── Cloudflare Config (per-user) ─────────────────────────────────────────────

export interface CFConfig {
  configured: boolean
  accountId?: string
  zoneId?: string
  baseDomain?: string
  status?: 'active' | 'invalid' | 'unconfigured'
  verifiedAt?: string | null
}

export const getCFConfig = () =>
  agentApi.get<CFConfig>('/api/v1/me/cloudflare').then((r) => r.data)

export const setCFConfig = (payload: {
  apiToken: string
  accountId: string
  zoneId: string
  baseDomain?: string
}) => agentApi.post<{ ok: boolean; message: string }>('/api/v1/me/cloudflare', payload).then((r) => r.data)

export const verifyCFConfig = () =>
  agentApi.post<{ valid: boolean; status?: string; error?: string }>('/api/v1/me/cloudflare/verify').then((r) => r.data)

export const deleteCFConfig = () =>
  agentApi.delete<{ ok: boolean }>('/api/v1/me/cloudflare').then((r) => r.data)

export interface CFZone {
  id: string
  name: string
}

export const getCFZones = () =>
  agentApi.get<CFZone[]>('/api/v1/me/cloudflare/zones').then((r) => r.data)

// ─── Projects ─────────────────────────────────────────────────────────────────

export interface Project {
  id: number
  userId: number
  name: string
  slug: string
  description: string
  status: 'active' | 'stopped' | 'building' | 'error' | 'draft'
  projectType: 'static' | 'nodejs' | 'python' | 'php' | 'docker' | 'proxy' | 'custom'
  repoUrl: string
  workingDir: string
  exposedPort: number
  assignedPort: number
  running: boolean
  createdAt: string
  updatedAt: string
}

export const listProjects = (all = false) =>
  agentApi.get<Project[]>('/api/v1/projects', { params: all ? { all: 1 } : {} }).then((r) => r.data)

export const createProject = (payload: {
  name: string
  description?: string
  projectType: string
  repoUrl?: string
  workingDir?: string
}) => agentApi.post<Project>('/api/v1/projects', payload).then((r) => r.data)

export const getProject = (id: number) =>
  agentApi.get<Project>(`/api/v1/projects/${id}`).then((r) => r.data)

export const deleteProject = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/projects/${id}`).then((r) => r.data)

export const startProject = (id: number) =>
  agentApi.post<{ ok: boolean; status: string }>(`/api/v1/projects/${id}/start`).then((r) => r.data)

export const stopProject = (id: number) =>
  agentApi.post<{ ok: boolean; status: string }>(`/api/v1/projects/${id}/stop`).then((r) => r.data)

// ─── Tunnels ──────────────────────────────────────────────────────────────────

export interface Tunnel {
  id: number
  userId: number
  projectId: number | null
  name: string
  targetUrl: string
  status: 'active' | 'inactive' | 'error' | 'pending' | 'creating'
  cfTunnelId: string
  cfHostname: string
  daemonRunning: boolean
  createdAt: string
  updatedAt: string
}

export const listTunnels = () =>
  agentApi.get<Tunnel[]>('/api/v1/tunnels').then((r) => r.data)

export const createTunnel = (payload: {
  name: string
  subdomain: string
  domain: string
  zoneId: string
  path: string
  protocol: string
  ip: string
  port: string
  projectId?: number | null
}) => agentApi.post<{ ok: boolean; id: number; status: string; message: string }>('/api/v1/tunnels', payload).then((r) => r.data)

export const updateTunnel = (id: number, payload: {
  name: string
  subdomain: string
  domain: string
  zoneId: string
  path: string
  protocol: string
  ip: string
  port: string
  projectId?: number | null
}) => agentApi.put<{ ok: boolean; message: string }>(`/api/v1/tunnels/${id}`, payload).then((r) => r.data)

export const getTunnel = (id: number) =>
  agentApi.get<Tunnel>(`/api/v1/tunnels/${id}`).then((r) => r.data)

export const deleteTunnel = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/tunnels/${id}`).then((r) => r.data)

// ─── Notifications ────────────────────────────────────────────────────────────

export interface PanelNotification {
  id: number
  userId: number
  title: string
  body: string
  type: 'info' | 'success' | 'warning' | 'error'
  isRead: boolean
  actionUrl: string
  createdAt: string
}

export const listNotifications = () =>
  agentApi.get<{ notifications: PanelNotification[] }>('/api/v1/notifications').then((r) => r.data.notifications)

export const markNotificationRead = (id: number) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/notifications/${id}/read`).then((r) => r.data)

export const markAllNotificationsRead = () =>
  agentApi.post<{ ok: boolean }>('/api/v1/notifications/read-all').then((r) => r.data)
