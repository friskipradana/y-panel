import { agentApi, withPagination } from './client'
import type { PaginatedResponse, PaginationParams } from '@/types'

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

export const listTunnels = (params?: PaginationParams) =>
  agentApi.get<PaginatedResponse<Tunnel>>('/api/v1/tunnels', withPagination(params)).then((r) => r.data)

export const createTunnel = (payload: {
  name: string
  subdomain: string
  domain: string
  zoneId: string
  path: string
  protocol: string
  ip: string
  port: string
  profileId?: string
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
