import { agentApi } from './client'
import type { PaginatedResponse, PaginationParams } from '@/types'

export interface DocRecord {
  id: number
  authorUserId: number | null
  title: string
  slug: string
  excerpt: string
  content: string
  status: 'published' | 'draft' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface DocPayload {
  title: string
  slug?: string
  excerpt?: string
  content: string
  status?: 'published' | 'draft' | 'archived'
}

export interface DocListParams extends PaginationParams {
  includeDrafts?: boolean
}

export const listDocs = (params?: DocListParams) =>
  agentApi
    .get<PaginatedResponse<DocRecord>>('/api/v1/docs', {
      params: {
        q: params?.q ?? '',
        limit: params?.limit,
        offset: params?.offset,
        includeDrafts: params?.includeDrafts ? 1 : undefined,
      },
    })
    .then((r) => r.data)

export const getDoc = (id: number) =>
  agentApi.get<DocRecord>(`/api/v1/docs/${id}`).then((r) => r.data)

export const createDoc = (payload: DocPayload) =>
  agentApi.post<DocRecord>('/api/v1/docs', payload).then((r) => r.data)

export const updateDoc = (id: number, payload: DocPayload) =>
  agentApi.patch<DocRecord>(`/api/v1/docs/${id}`, payload).then((r) => r.data)

export const deleteDoc = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/docs/${id}`).then((r) => r.data)
