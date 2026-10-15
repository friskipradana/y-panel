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
  isPublic: boolean
  /** official: synced from the project repository, read-only */
  source?: 'official'
  createdAt: string
  updatedAt: string
}

export interface PublicDocSummary {
  title: string
  slug: string
  excerpt: string
  updatedAt: string
}

export interface PublicDoc extends PublicDocSummary {
  content: string
}

export interface DocPayload {
  title: string
  slug?: string
  excerpt?: string
  content: string
  status?: 'published' | 'draft' | 'archived'
  isPublic?: boolean
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

// Readable without a session: only published articles marked public
export const listPublicDocs = () =>
  agentApi.get<{ items: PublicDocSummary[] }>('/api/v1/public/docs').then((r) => r.data.items)

export const getPublicDoc = (slug: string) =>
  agentApi.get<PublicDoc>(`/api/v1/public/docs/${encodeURIComponent(slug)}`).then((r) => r.data)

// Official articles synced from the project repository (same on every installation)
export const listOfficialDocs = (refresh = false) =>
  agentApi
    .get<{ items: DocRecord[] }>('/api/v1/docs/official', { params: { refresh: refresh ? 1 : undefined } })
    .then((r) => r.data.items.map((doc) => ({ ...doc, source: 'official' as const })))

// Stored by content hash; the returned url works in markdown as ![alt](url)
export const uploadDocImage = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return agentApi
    .post<{ url: string; name: string }>('/api/v1/docs/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data)
}
