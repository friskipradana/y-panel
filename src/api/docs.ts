import { agentApi } from './client'
import type { AIImageRef } from './studio'
import { listParams, type ListQuery, type TableResult } from '@/lib/listQuery'
import type { PaginatedResponse, PaginationParams } from '@/types'

export type DocKind = 'doc' | 'article'

export interface DocRecord {
  id: number
  authorUserId: number | null
  kind: DocKind
  title: string
  slug: string
  excerpt: string
  content: string
  status: 'published' | 'draft' | 'archived'
  isPublic: boolean
  /** official: synced from the project repository, read-only */
  source?: 'official'
  /** the Reneo feature the post explains */
  featureKey?: string
  createdAt: string
  updatedAt: string
}

export interface PublicDocSummary {
  kind: DocKind
  title: string
  slug: string
  excerpt: string
  /** first image of the article, when it has one */
  cover?: string
  updatedAt: string
}

export interface PublicDoc extends PublicDocSummary {
  content: string
}

export interface DocPayload {
  kind?: DocKind
  title: string
  slug?: string
  excerpt?: string
  content: string
  status?: 'published' | 'draft' | 'archived'
  isPublic?: boolean
  featureKey?: string
}

export interface DocFeatureCoverage {
  key: string
  name: string
  description: string
  access: 'all' | 'admin' | 'superadmin'
  posts: Array<{ id: number; title: string; status: string }>
}

export interface DocAIGenerateInput {
  kind: DocKind
  topic: string
  instructions?: string
  language: 'id' | 'en'
  autoSave?: boolean
  publish?: boolean
  isPublic?: boolean
  images?: AIImageRef[]
  /** the Reneo feature to write about */
  feature?: string
  /** revise this text instead of writing a new post */
  current?: { title: string; content: string }
}

export interface DocAIGenerateResult {
  draft?: {
    kind: DocKind
    title: string
    slug: string
    excerpt: string
    content: string
    featureKey: string
  }
  doc?: DocRecord
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

export const generateDocWithAI = (payload: DocAIGenerateInput) =>
  agentApi.post<DocAIGenerateResult>('/api/v1/docs/ai-generate', payload).then((r) => r.data)

// Readable without a session: only published articles marked public
export const listPublicDocs = () =>
  agentApi.get<{ items: PublicDocSummary[] }>('/api/v1/public/docs').then((r) => r.data.items)

export const getPublicDoc = (slug: string) =>
  agentApi.get<PublicDoc>(`/api/v1/public/docs/${encodeURIComponent(slug)}`).then((r) => r.data)

// Official articles synced from the project repository (same on every installation)
// Local and official articles in one list: the search, the column filters and the order are the agent's to apply (lib/listQuery)
export const listDocsTable = (query: ListQuery, page: { limit: number; offset: number }) => {
  const params = listParams(query)
  params.set('limit', String(page.limit))
  params.set('offset', String(page.offset))
  return agentApi.get<TableResult<DocRecord>>('/api/v1/docs/table', { params }).then((r) => r.data)
}

export const listDocFeatures = (lang: string) =>
  agentApi.get<{ features: DocFeatureCoverage[] }>('/api/v1/docs/features', { params: { lang } }).then((r) => r.data.features)

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
