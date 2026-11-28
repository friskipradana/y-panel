import { agentApi } from './client'

export type StudioPageKind = 'landing' | 'docs'
export type StudioPageStatus = 'draft' | 'published'
export type StudioThemeTone = 'blue' | 'emerald' | 'slate' | 'amber'
export type StudioSectionType = 'features' | 'steps' | 'pricing' | 'testimonials' | 'stats' | 'faq' | 'cta'

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

export interface StudioChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface StudioPageVersion {
  id: string
  summary: string
  createdAt: string
  title: string
  subtitle: string
  brandName: string
  themeTone: StudioThemeTone
  seoDescription: string
  ctaLabel: string
  ctaUrl: string
  sections: StudioSection[]
  markdownBody: string
  htmlCode?: string
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
  htmlCode: string
  sourcePrompt: string
  chatHistory: StudioChatMessage[]
  versions: StudioPageVersion[]
  scheduleId: number
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
  htmlCode?: string
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
  htmlCode?: string
}

export type StudioScheduleMode = 'enrich_docs' | 'topic_series'
export type StudioScheduleCadence = 'hourly' | 'daily' | 'weekly' | 'monthly'

export interface StudioSchedule {
  id: number
  ownerUserId: number
  name: string
  mode: StudioScheduleMode
  theme: string
  brandName: string
  category: string
  topics: string[]
  usedTopics: string[]
  language: 'id' | 'en'
  cadence: StudioScheduleCadence
  runHour: number
  runWeekday: number
  autoPublish: boolean
  showInDocs: boolean
  enabled: boolean
  runCount: number
  lastRunAt?: string
  nextRunAt?: string
  lastStatus: 'idle' | 'running' | 'success' | 'error'
  lastError: string
  lastPageId: number
  lastTitle: string
  createdAt: string
  updatedAt: string
}

export interface StudioScheduleInput {
  name: string
  mode: StudioScheduleMode
  theme: string
  brandName: string
  category: string
  topics: string[]
  language: 'id' | 'en'
  cadence: StudioScheduleCadence
  runHour: number
  runWeekday: number
  autoPublish: boolean
  showInDocs: boolean
  enabled: boolean
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

export const createStudioPageFromChat = (payload: { kind: StudioPageKind; prompt: string; language: string }) =>
  agentApi.post<{ page: StudioPage; reply: string }>('/api/v1/studio/chat-create', payload).then((r) => r.data)

export const chatRefineStudioPage = (id: number, payload: { message: string; language: string }) =>
  agentApi.post<{ page: StudioPage; reply: string }>(`/api/v1/studio/pages/${id}/chat`, payload).then((r) => r.data)

export const restoreStudioPageVersion = (id: number, versionId: string) =>
  agentApi.post<{ page: StudioPage }>(`/api/v1/studio/pages/${id}/restore`, { versionId }).then((r) => r.data)

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
    .get<{ page: Omit<StudioPage, 'id' | 'ownerUserId' | 'showInDocs' | 'linkedDocId' | 'sourcePrompt' | 'chatHistory' | 'versions' | 'scheduleId' | 'createdAt'> }>(
      `/api/v1/public/pages/${encodeURIComponent(slug)}`,
      { params: preview ? { preview: '1' } : undefined },
    )
    .then((r) => r.data)

export const listStudioSchedules = () =>
  agentApi.get<{ schedules: StudioSchedule[] }>('/api/v1/studio/schedules').then((r) => r.data)

export const createStudioSchedule = (payload: StudioScheduleInput) =>
  agentApi.post<StudioSchedule>('/api/v1/studio/schedules', payload).then((r) => r.data)

export const updateStudioSchedule = (id: number, payload: StudioScheduleInput) =>
  agentApi.put<StudioSchedule>(`/api/v1/studio/schedules/${id}`, payload).then((r) => r.data)

export const toggleStudioSchedule = (id: number, enabled: boolean) =>
  agentApi.post<StudioSchedule>(`/api/v1/studio/schedules/${id}/toggle`, { enabled }).then((r) => r.data)

export const deleteStudioSchedule = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/studio/schedules/${id}`).then((r) => r.data)

export const runStudioScheduleNow = (id: number) =>
  agentApi.post<{ schedule: StudioSchedule; page: StudioPage }>(`/api/v1/studio/schedules/${id}/run`).then((r) => r.data)
