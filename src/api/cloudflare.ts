import { agentApi } from './client'

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
  agentApi.post<{ valid: boolean; status?: string; error?: string; action?: string }>('/api/v1/me/cloudflare/verify').then((r) => r.data)

export const deleteCFConfig = () =>
  agentApi.delete<{ ok: boolean }>('/api/v1/me/cloudflare').then((r) => r.data)

export interface CFZone {
  id: string
  name: string
}

export const getCFZones = () =>
  agentApi.get<CFZone[]>('/api/v1/me/cloudflare/zones').then((r) => r.data)

export interface CloudflareDomain extends CFZone {
  status?: string
  name_servers?: string[]
}

export interface CloudflareDNSRecord {
  id: string
  type: string
  name: string
  content: string
  proxied: boolean
  ttl: number
  priority?: number
  comment?: string
  created_on?: string
  modified_on?: string
}

export interface CloudflareDNSRecordPayload {
  type: string
  name: string
  content: string
  ttl: number
  proxied: boolean
  priority?: number
  comment?: string
}

export interface CloudflareTunnelProfile {
  id: string
  name: string
  status: string
  routeCount: number
  daemonRunning: boolean
}

export interface CloudflareTunnelProfilePayload {
  name: string
  mode: 'managed' | 'custom'
  tunnelId?: string
}

export const listCloudflareDomains = () =>
  agentApi.get<CloudflareDomain[]>('/api/v1/cloudflare/domains').then((r) => r.data)

export const createCloudflareDomain = (name: string) =>
  agentApi.post<CloudflareDomain>('/api/v1/cloudflare/domains', { name }).then((r) => r.data)

export const getCloudflareDomain = (zoneId: string) =>
  agentApi.get<CloudflareDomain>(`/api/v1/cloudflare/domains/${zoneId}`).then((r) => r.data)

export const deleteCloudflareDomain = (zoneId: string) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/cloudflare/domains/${zoneId}`).then((r) => r.data)

export const listCloudflareDNSRecords = (zoneId: string) =>
  agentApi.get<{ items?: CloudflareDNSRecord[] }>(`/api/v1/cloudflare/domains/${zoneId}/dns`).then((r) => r.data.items ?? [])

export const createCloudflareDNSRecord = (zoneId: string, payload: CloudflareDNSRecordPayload) =>
  agentApi.post<CloudflareDNSRecord>(`/api/v1/cloudflare/domains/${zoneId}/dns`, payload).then((r) => r.data)

export const updateCloudflareDNSRecord = (zoneId: string, recordId: string, payload: CloudflareDNSRecordPayload) =>
  agentApi.put<CloudflareDNSRecord>(`/api/v1/cloudflare/domains/${zoneId}/dns/${recordId}`, payload).then((r) => r.data)

export const deleteCloudflareDNSRecord = (zoneId: string, recordId: string) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/cloudflare/domains/${zoneId}/dns/${recordId}`).then((r) => r.data)

export const listCloudflareTunnelProfiles = () =>
  agentApi.get<{ items?: CloudflareTunnelProfile[] }>('/api/v1/cloudflare/tunnel-profiles').then((r) => r.data.items ?? [])

export const createCloudflareTunnelProfile = (payload: CloudflareTunnelProfilePayload) =>
  agentApi.post<CloudflareTunnelProfile>('/api/v1/cloudflare/tunnel-profiles', payload).then((r) => r.data)

export const deleteCloudflareTunnelProfile = (profileId: string) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/cloudflare/tunnel-profiles/${profileId}`).then((r) => r.data)

export const listCloudflareTunnelProfileRoutes = (profileId: string) =>
  agentApi.get<{ items?: import('./tunnels').Tunnel[] }>(`/api/v1/cloudflare/tunnel-profiles/${profileId}/routes`).then((r) => r.data.items ?? [])
