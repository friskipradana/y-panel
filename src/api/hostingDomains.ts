import { agentApi } from './client'

// Domains and subdomains

export interface HostingDomain {
  zoneId: string
  name: string
  /** Cloudflare's own status for the zone (superadmin list only) */
  status?: string
  enabled: boolean
  /** The panel addresses of buyers are made on this one */
  isMain?: boolean
}

export const listHostingDomains = () => agentApi.get<{ domains: HostingDomain[] }>('/api/v1/hosting/domains').then((r) => r.data.domains)
export const setHostingDomain = (zoneId: string, enabled: boolean) => agentApi.put<HostingDomain>(`/api/v1/hosting/domains/${encodeURIComponent(zoneId)}`, { enabled }).then((r) => r.data)
export const setMainHostingDomain = (zoneId: string) => agentApi.put<{ ok: boolean }>(`/api/v1/hosting/domains/${encodeURIComponent(zoneId)}/main`).then((r) => r.data)

export type SubdomainStatus = 'pending' | 'active' | 'suspended' | 'error'

export interface Subdomain {
  id: number
  userId: number
  /** Only in the superadmin list */
  username?: string
  label: string
  zoneId: string
  domain: string
  hostname: string
  status: SubdomainStatus
  /** Why a subdomain waits or failed */
  note: string
  /** The address of the owner's own panel: it comes with every plan and is not one of its subdomains */
  panel?: boolean
  createdAt: string
}

export const listAllSubdomains = () => agentApi.get<{ items: Subdomain[] }>('/api/v1/hosting/subdomains').then((r) => r.data.items)

// The superadmin gives an account its panel address (the plan quota does not apply)
export const createSubdomainForUser = (body: { userId: number; label: string; zoneId: string }) =>
  agentApi.post<Subdomain>('/api/v1/hosting/subdomains', body).then((r) => r.data)

export const setSubdomainStatus = (id: number, status: 'active' | 'suspended') =>
  agentApi.patch<Subdomain>(`/api/v1/hosting/subdomains/${id}`, { status }).then((r) => r.data)

export const deleteSubdomainAsAdmin = (id: number) => agentApi.delete<{ ok: boolean }>(`/api/v1/hosting/subdomains/${id}`).then((r) => r.data)

export interface MySubdomains {
  enabled: boolean
  limit: number
  used: number
  domains: HostingDomain[]
  items: Subdomain[]
}

export const getMySubdomains = () => agentApi.get<MySubdomains>('/api/v1/me/subdomains').then((r) => r.data)
export const checkSubdomain = (label: string, zoneId: string) =>
  agentApi.get<{ available: boolean; reason: string }>('/api/v1/me/subdomains/check', { params: { label, zoneId } }).then((r) => r.data)

export interface CustomDomain {
  id: number
  userId: number
  username?: string
  hostname: string
  status: SubdomainStatus
  sslStatus: string
  note: string
  createdAt: string
  updatedAt: string
  /** cloudflare: Cloudflare for SaaS; direct: served by this server's public proxy */
  provider?: 'cloudflare' | 'direct'
  /** A direct domain puts this in a TXT record to prove it is theirs */
  verifyToken?: string
  verifiedAt?: string | null
}

export interface MyCustomDomains {
  /** The server owner set custom domains up */
  ready: boolean
  /** The ways a new domain can be connected now, the first is the default */
  providers: ('cloudflare' | 'direct')[]
  /** How a new domain is served by default, and what to point it at */
  provider: 'cloudflare' | 'direct'
  /** The name the buyer points their CNAME at */
  target: string
  /** The two addresses, for the domains that were added each way */
  cnameTarget: string
  directTarget: string
  limit: number
  used: number
  items: CustomDomain[]
}

export const getMyCustomDomains = () => agentApi.get<MyCustomDomains>('/api/v1/me/custom-domains').then((r) => r.data)

export const checkCustomDomain = (hostname: string, provider?: 'cloudflare' | 'direct') =>
  agentApi.get<{ available: boolean; reason: string; target: string; pointing?: boolean; provider?: 'cloudflare' | 'direct' }>('/api/v1/me/custom-domains/check', { params: { hostname, provider } }).then((r) => r.data)

export const createMyCustomDomain = (hostname: string, provider?: 'cloudflare' | 'direct') =>
  agentApi.post<CustomDomain>('/api/v1/me/custom-domains', { hostname, provider }).then((r) => r.data)

export const refreshMyCustomDomain = (id: number) => agentApi.post<CustomDomain>(`/api/v1/me/custom-domains/${id}/refresh`).then((r) => r.data)
export const deleteMyCustomDomain = (id: number) => agentApi.delete<{ ok: boolean }>(`/api/v1/me/custom-domains/${id}`).then((r) => r.data)

export interface CustomDomainSetup {
  ready: boolean
  zoneId: string
  target: string
  items: CustomDomain[]
}

export const getCustomDomainSetup = () => agentApi.get<CustomDomainSetup>('/api/v1/hosting/custom-domains').then((r) => r.data)
export const setupCustomDomains = (zoneId: string) => agentApi.put<CustomDomainSetup>('/api/v1/hosting/custom-domains/setup', { zoneId }).then((r) => r.data)
export const createMySubdomain = (body: { label: string; zoneId: string }) => agentApi.post<Subdomain>('/api/v1/me/subdomains', body).then((r) => r.data)
export const deleteMySubdomain = (id: number) => agentApi.delete<{ ok: boolean }>(`/api/v1/me/subdomains/${id}`).then((r) => r.data)
