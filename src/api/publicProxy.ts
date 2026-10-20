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
  /** The addresses it is set to listen on, and the ones it holds while running */
  wantHttp: string
  wantHttps: string
  http?: string
  https?: string
  addresses: LocalAddress[]
  panelOnLoopback: boolean
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

export const setPublicProxy = (body: { enabled?: boolean; email?: string; confirmPublicIp?: boolean }) =>
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
