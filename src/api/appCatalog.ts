import { agentApi } from './client'

export interface CatalogVolumeSpec {
  hostSubdir: string
  containerPath: string
  label: string
}

export interface CatalogEnvSpec {
  key: string
  defaultValue: string
  labelId: string
  labelEn: string
  required: boolean
  secret: boolean
  placeholder: string
  hidden?: boolean
}

export interface CatalogApp {
  id: string
  name: string
  taglineId: string
  taglineEn: string
  descriptionId: string
  descriptionEn: string
  category: string
  iconKey: string
  iconColor: string
  image: string
  versions?: string[]
  containerPort: number
  defaultHostPort: number
  openPath: string
  keepPrefix: boolean
  superadminOnly: boolean
  official?: boolean
  notesId?: string
  notesEn?: string
  volumes: CatalogVolumeSpec[]
  env: CatalogEnvSpec[]
}

export type InstalledAppKind = 'docker' | 'existing-container' | 'custom-url'

export interface InstalledApp {
  id: number
  userId: number
  slug: string
  catalogId: string
  name: string
  tagline: string
  category: string
  iconKey: string
  iconColor: string
  kind: InstalledAppKind
  image: string
  containerName: string
  hostPort: number
  containerPort: number
  openPath: string
  targetUrl: string
  useProxy: boolean
  configJson: string
  keepPrefix: boolean
  proxyPath: string
  containerId?: string
  containerStatus?: string
  containerState?: string
  versionTag?: string
  currentDigest?: string
  previousImage?: string
  previousDigest?: string
  canRollback?: boolean
  createdAt: string
  updatedAt: string
}

export interface AppUpdateStatus {
  hasUpdate: boolean
  localDigest?: string
  remoteDigest?: string
  targetImage: string
  error?: string
}

export interface AppCatalogResponse {
  catalog: CatalogApp[]
  installed: InstalledApp[]
}

export interface InstallCatalogAppPayload {
  mode: 'catalog' | 'existing-container' | 'custom-url'
  catalogId?: string
  version?: string
  slug?: string
  containerId?: string
  name?: string
  tagline?: string
  category?: string
  iconKey?: string
  iconColor?: string
  hostPort?: number
  openPath?: string
  targetUrl?: string
  useProxy?: boolean
  env?: Record<string, string>
}

export interface UpdateInstalledAppPayload {
  name?: string
  slug?: string
  tagline?: string
  iconKey?: string
  iconColor?: string
  openPath?: string
  targetUrl?: string
  useProxy?: boolean
}

export async function getAppCatalog(): Promise<AppCatalogResponse> {
  const { data } = await agentApi.get<AppCatalogResponse>('/api/v1/app-catalog')
  return {
    catalog: Array.isArray(data?.catalog) ? data.catalog : [],
    installed: Array.isArray(data?.installed) ? data.installed : [],
  }
}

export async function installCatalogApp(payload: InstallCatalogAppPayload): Promise<InstalledApp> {
  const { data } = await agentApi.post<{ ok: boolean; app: InstalledApp }>('/api/v1/app-catalog/install', payload)
  return data.app
}

export async function updateInstalledApp(id: number, payload: UpdateInstalledAppPayload): Promise<InstalledApp> {
  const { data } = await agentApi.patch<{ ok: boolean; app: InstalledApp }>(
    `/api/v1/app-catalog/installed/${id}`,
    payload,
  )
  return data.app
}

export async function runInstalledAppAction(
  id: number,
  action: 'start' | 'stop' | 'restart',
): Promise<InstalledApp> {
  const { data } = await agentApi.post<{ ok: boolean; app: InstalledApp }>(
    `/api/v1/app-catalog/installed/${id}/action`,
    { action },
  )
  return data.app
}

export async function upgradeInstalledApp(id: number, version?: string): Promise<InstalledApp> {
  const trimmed = version?.trim()
  const { data } = await agentApi.post<{ ok: boolean; app: InstalledApp }>(
    `/api/v1/app-catalog/installed/${id}/upgrade`,
    trimmed ? { version: trimmed } : {},
    { timeout: 300000 },
  )
  return data.app
}

export async function rollbackInstalledApp(id: number): Promise<InstalledApp> {
  const { data } = await agentApi.post<{ ok: boolean; app: InstalledApp }>(
    `/api/v1/app-catalog/installed/${id}/rollback`,
    {},
    { timeout: 300000 },
  )
  return data.app
}

export async function checkInstalledAppUpdates(): Promise<Record<number, AppUpdateStatus>> {
  const { data } = await agentApi.get<{ updates: Record<number, AppUpdateStatus> }>(
    '/api/v1/app-catalog/installed/updates',
  )
  return data.updates ?? {}
}

export interface UninstallAppResult {
  ok: boolean
  imageDeleted?: boolean
  imageInUse?: boolean
  imageSkippedReason?: string
  targetImage?: string
}

export async function uninstallCatalogApp(
  id: number,
  opts?: { removeContainer?: boolean; removeVolumes?: boolean; removeImage?: boolean },
): Promise<UninstallAppResult> {
  const { data } = await agentApi.delete<UninstallAppResult>(`/api/v1/app-catalog/installed/${id}`, {
    params: {
      removeContainer: opts?.removeContainer !== false ? 'true' : 'false',
      removeVolumes: opts?.removeVolumes ? 'true' : 'false',
      removeImage: opts?.removeImage ? 'true' : 'false',
    },
  })
  return data
}

export interface CreateCustomCatalogPayload {
  id?: string
  name: string
  tagline: string
  description?: string
  category?: string
  iconKey?: string
  iconColor?: string
  image: string
  containerPort: number
  defaultHostPort?: number
  openPath?: string
  notes?: string
}

export async function createCustomCatalogApp(payload: CreateCustomCatalogPayload): Promise<CatalogApp> {
  const { data } = await agentApi.post<{ item: CatalogApp }>('/api/v1/app-catalog/catalog', payload)
  return data.item
}

export async function deleteCustomCatalogApp(id: string): Promise<void> {
  await agentApi.delete(`/api/v1/app-catalog/catalog/${encodeURIComponent(id)}`)
}

export function installedAppOpenUrl(app: Pick<InstalledApp, 'id' | 'openPath' | 'proxyPath' | 'targetUrl' | 'useProxy'>): string {
  if (!app.useProxy && app.targetUrl) {
    return app.targetUrl
  }
  const base = (import.meta.env.VITE_AGENT_BASE || '').replace(/\/+$/, '')
  const path = app.proxyPath || `/api/v1/app-catalog/proxy/${app.id}${app.openPath || '/'}`
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return base ? `${base}${path}` : path
}

export function installedAppWindowParams(app: InstalledApp): Record<string, unknown> {
  return {
    appId: app.id,
    appName: app.name,
    iconKey: app.iconKey,
    iconColor: app.iconColor,
    slug: app.slug,
  }
}

