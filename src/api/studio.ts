import { agentApi } from './client'

export type StudioPageKind = 'landing' | 'docs'
export type StudioPageStatus = 'draft' | 'published'
export type StudioThemeTone = 'blue' | 'emerald' | 'slate' | 'amber'
export type StudioSectionType = 'features' | 'pricing' | 'steps' | 'faq' | 'cta'

export interface StudioSectionItem {
  title: string
  description: string
  price?: string
  badge?: string
  bullets?: string[]
  highlight?: boolean
}

export interface StudioSection {
  id: string
  type: StudioSectionType
  heading: string
  subheading?: string
  items: StudioSectionItem[]
}

export interface StudioPage {
  id: number
  ownerUserId: number
  kind: StudioPageKind
  slug: string
  title: string
  subtitle: string
  status: StudioPageStatus
  showInDocs: boolean
  linkedDocId: number
  brandName: string
  themeTone: StudioThemeTone
  seoDescription: string
  ctaLabel: string
  ctaUrl: string
  sections: StudioSection[]
  markdownBody: string
  sourcePrompt: string
  createdAt: string
  updatedAt: string
}

export interface StudioOverviewResponse {
  pages: StudioPage[]
  aiReady: boolean
  aiProvider?: string
  aiModel?: string
}

export interface StudioPageInput {
  kind: StudioPageKind
  slug: string
  title: string
  subtitle: string
  status: StudioPageStatus
  showInDocs: boolean
  brandName: string
  themeTone: StudioThemeTone
  seoDescription: string
  ctaLabel: string
  ctaUrl: string
  sections: StudioSection[]
  markdownBody: string
  sourcePrompt: string
}

export interface AIGeneratedStudioPage {
  slug: string
  title: string
  subtitle: string
  brandName: string
  themeTone: StudioThemeTone
  seoDescription: string
  ctaLabel: string
  ctaUrl: string
  sections: StudioSection[]
  markdownBody: string
}

export const listStudioPages = (kind?: string) =>
  agentApi
    .get<StudioOverviewResponse>('/api/v1/studio/pages', { params: kind ? { kind } : undefined })
    .then((r) => r.data)

export const createStudioPage = (payload: StudioPageInput) =>
  agentApi.post<StudioPage>('/api/v1/studio/pages', payload).then((r) => r.data)

export const updateStudioPage = (id: number, payload: StudioPageInput) =>
  agentApi.put<StudioPage>(`/api/v1/studio/pages/${id}`, payload).then((r) => r.data)

export const toggleStudioPagePublish = (id: number, published: boolean) =>
  agentApi.post<StudioPage>(`/api/v1/studio/pages/${id}/publish`, { published }).then((r) => r.data)

export const deleteStudioPage = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/studio/pages/${id}`).then((r) => r.data)

export const generateStudioPageWithAI = (payload: {
  kind: StudioPageKind
  brandName: string
  audience: string
  ctaUrl: string
  themeTone: StudioThemeTone
  prompt: string
  language: string
}) => agentApi.post<AIGeneratedStudioPage>('/api/v1/studio/ai-generate', payload).then((r) => r.data)

export const getPublicStudioPage = (slug: string, preview = false) =>
  agentApi
    .get<{ page: Omit<StudioPage, 'id' | 'ownerUserId' | 'showInDocs' | 'linkedDocId' | 'sourcePrompt' | 'createdAt'> }>(
      `/api/v1/public/pages/${encodeURIComponent(slug)}`,
      { params: preview ? { preview: '1' } : undefined },
    )
    .then((r) => r.data)
