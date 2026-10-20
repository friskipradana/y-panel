import { agentApi } from './client'

// The public proxy of an install that has a public address: it serves registered domains straight from this machine

export interface LocalAddress {
  ip: string
  /** A global address, not private, shared (100.64.0.0/10) or loopback */
  public: boolean
}

export interface PublicProxyStatus {
  enabled: boolean
  running: boolean
  /** Why it could not start; empty otherwise */
  error: string
  email: string
  /** Who said, and when, that this server has a public address */
  confirmedBy: string
  confirmedAt: string | null
  /** The domains of buyers are served by this server, and the address they point at */
  buyerDomains: boolean
  target: string
  /** What serves the domains: Reneo itself, or the nginx or Apache of this machine */
  engine: PublicEngineName
  engineStatus?: { name: PublicEngineName; confDir?: string; lastError?: string }
  /** The Cloudflare account of the superadmin is connected, so a DNS record can be made */
  cloudflare: boolean
  /** The addresses it is set to listen on, and the ones it holds while running */
  wantHttp: string
  wantHttps: string
  http?: string
  https?: string
  addresses: LocalAddress[]
  panelOnLoopback: boolean
}

export type PublicEngineName = 'builtin' | 'nginx' | 'apache'

export interface EngineReport {
  name: PublicEngineName
  installed: boolean
  version?: string
  running: boolean
  confDir?: string
  certbot: boolean
  missing?: string[]
  /** The web ports that someone else holds right now (for the proxy of Reneo) */
  portsBusy?: string[]
}

export type PublicRouteKind = 'panel' | 'project' | 'port'
export type PublicRouteState = 'disabled' | 'off' | 'issued' | 'error' | 'waiting'

export interface PublicRoute {
  id: number
  hostname: string
  kind: PublicRouteKind
  projectId: number | null
  port: number
  enabled: boolean
  note: string
  checkedAt: string | null
  checkOk: boolean
  checkError: string
  createdAt: string
  projectName: string
  projectSlug: string
  projectPort: number
  /** In words: what the route leads to */
  target: string
  state: PublicRouteState
  certExpires: string | null
  certIssuer: string
}

export interface PublicRouteInput {
  hostname?: string
  kind: PublicRouteKind
  projectId?: number | null
  port?: number
  enabled?: boolean
  note?: string
}

export interface DetectedIp {
  ip: string
  /** The address is one of this machine's own; otherwise a router in front of it owns it */
  onThisMachine: boolean
}

export const getPublicProxy = () => agentApi.get<PublicProxyStatus>('/api/v1/public-proxy').then((r) => r.data)

export const setPublicProxy = (body: { enabled?: boolean; email?: string; confirmPublicIp?: boolean; buyerDomains?: boolean; target?: string; engine?: PublicEngineName }) =>
  agentApi.put<PublicProxyStatus>('/api/v1/public-proxy', body).then((r) => r.data)

export const detectPublicIp = () => agentApi.post<DetectedIp>('/api/v1/public-proxy/detect').then((r) => r.data)

export const createPublicRoute = (input: PublicRouteInput) => agentApi.post<PublicRoute>('/api/v1/public-proxy/routes', input).then((r) => r.data)

export const updatePublicRoute = (id: number, input: PublicRouteInput) =>
  agentApi.patch<PublicRoute>(`/api/v1/public-proxy/routes/${id}`, input).then((r) => r.data)

export const deletePublicRoute = (id: number) => agentApi.delete<{ ok: boolean }>(`/api/v1/public-proxy/routes/${id}`).then((r) => r.data)

export interface PublicRouteCheck {
  ok: boolean
  error: string
  resolved: string[] | null
  route: PublicRoute
}

// Asks the test service of Let's Encrypt for a certificate for the domain: it can take half a minute
export const checkPublicRoute = (id: number) =>
  agentApi.post<PublicRouteCheck>(`/api/v1/public-proxy/routes/${id}/check`, undefined, { timeout: 110_000 }).then((r) => r.data)

export const getPublicEngines = () => agentApi.get<{ engines: EngineReport[] }>('/api/v1/public-proxy/engines').then((r) => r.data.engines)

export interface RouteDnsResult {
  ok: boolean
  created: boolean
  type: string
  content: string
  zone: string
}

// Makes the DNS record of the domain at Cloudflare, when the domain is in the account of the superadmin
export const createRouteDns = (id: number) => agentApi.post<RouteDnsResult>(`/api/v1/public-proxy/routes/${id}/dns`).then((r) => r.data)
