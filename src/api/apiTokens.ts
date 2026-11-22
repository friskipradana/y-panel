import { agentApi } from './client'

export interface APIToken {
  id: number
  userId: number
  name: string
  tokenPrefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export interface CreateAPITokenPayload {
  name: string
  expiresIn?: '7d' | '30d' | '90d' | '1y' | null
}

export interface CreateAPITokenResponse {
  token: string // Only returned once! Show to user immediately
  record: APIToken
}

export const listAPITokens = () =>
  agentApi.get<{ tokens: APIToken[] }>('/api/v1/me/api-tokens').then((r) => r.data.tokens)

export const createAPIToken = (payload: CreateAPITokenPayload) =>
  agentApi.post<CreateAPITokenResponse>('/api/v1/me/api-tokens', payload).then((r) => r.data)

export const deleteAPIToken = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/me/api-tokens/${id}`).then((r) => r.data)
