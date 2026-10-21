import { agentApi } from './client'
import type { PaginationParams } from '@/types'
import { listParams, type ListQuery, type TableResult } from '@/lib/listQuery'

export interface ProjectRuntimeState {
  known: boolean
  running: boolean
  status: 'active' | 'stopped'
  drift: boolean
  driftReason?: string
}

export interface Project {
  id: number
  userId: number
  name: string
  slug: string
  description: string
  status: 'active' | 'stopped' | 'building' | 'error' | 'draft' | 'degraded'
  projectType: 'static' | 'nodejs' | 'python' | 'php' | 'docker' | 'proxy' | 'custom'
  repoUrl: string
  workingDir: string
  spaFallback: boolean
  exposedPort: number
  assignedPort: number
  running: boolean
  runtime: ProjectRuntimeState
  createdAt: string
  updatedAt: string
}

export interface ProjectListParams extends PaginationParams {
  all?: boolean
  /** The column filters and the order, applied by the agent */
  table?: ListQuery
}

export interface ProjectAttentionSummary {
  total: number
  attentionCount: number
  degradedCount: number
  driftCount: number
}

export const listProjects = (params?: ProjectListParams) => {
  const query = params?.table ? listParams(params.table) : new URLSearchParams()
  if (!params?.table && params?.q) query.set('q', params.q)
  if (params?.limit !== undefined) query.set('limit', String(params.limit))
  if (params?.offset !== undefined) query.set('offset', String(params.offset))
  if (params?.all) query.set('all', '1')
  return agentApi.get<TableResult<Project>>('/api/v1/projects', { params: query }).then((r) => r.data)
}

export const getProjectAttentionSummary = (params?: Pick<ProjectListParams, 'q' | 'all'>) =>
  agentApi
    .get<ProjectAttentionSummary>('/api/v1/projects/attention-summary', {
      params: {
        q: params?.q ?? '',
        all: params?.all ? 1 : undefined,
      },
    })
    .then((r) => r.data)

export const createProject = (payload: {
  name: string
  description?: string
  projectType: string
  repoUrl?: string
  workingDir?: string
  spaFallback?: boolean
}) => agentApi.post<Project>('/api/v1/projects', payload).then((r) => r.data)

export const updateProject = (id: number, payload: {
  name: string
  description?: string
  projectType: string
  repoUrl?: string
  workingDir?: string
  spaFallback?: boolean
}) => agentApi.put<Project>(`/api/v1/projects/${id}`, payload).then((r) => r.data)

export const getProject = (id: number) =>
  agentApi.get<Project>(`/api/v1/projects/${id}`).then((r) => r.data)

export const deleteProject = (id: number) =>
  agentApi.delete<{ ok: boolean }>(`/api/v1/projects/${id}`).then((r) => r.data)

export const startProject = (id: number) =>
  agentApi.post<{ ok: boolean; status: string; project: Project }>(`/api/v1/projects/${id}/start`).then((r) => r.data)

// The end of what the project wrote, and what the agent did to it (starts, crashes, restarts)
export const getProjectLogs = (id: number, lines = 300) =>
  agentApi.get<{ lines: string[] }>(`/api/v1/projects/${id}/logs`, { params: { lines } }).then((r) => r.data.lines)

export const stopProject = (id: number) =>
  agentApi.post<{ ok: boolean; status: string; project: Project }>(`/api/v1/projects/${id}/stop`).then((r) => r.data)

export type StaticUploadEvent =
  | { type: 'phase'; phase: 'extracting' | 'installing' | 'building' | 'placing' }
  | { type: 'log'; line: string }
  | { type: 'done'; workingDir: string; built: boolean }
  | { type: 'error'; error: string }

// What went wrong, in the shape the windows read errors from (response.data.error)
class UploadError extends Error {
  response: { data: { error: string } }
  constructor(message: string) {
    super(message)
    this.response = { data: { error: message } }
  }
}

// An archive of the built site, or of its source: the agent builds the source. It answers with one JSON line per event.
export const uploadStaticProjectBuild = async (
  id: number,
  file: File,
  clean = true,
  rootDir = '',
  onProgress?: (percent: number) => void,
  onEvent?: (event: StaticUploadEvent) => void,
) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('clean', clean ? 'true' : 'false')
  formData.append('rootDir', rootDir)
  let seen = 0
  let result: { workingDir: string; built: boolean } | null = null
  let failure = ''
  const read = (text: string, final: boolean) => {
    const upTo = final ? text.length : text.lastIndexOf('\n') + 1
    if (upTo <= seen) return
    for (const line of text.slice(seen, upTo).split('\n')) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as StaticUploadEvent
      onEvent?.(event)
      if (event.type === 'done') result = { workingDir: event.workingDir, built: event.built }
      if (event.type === 'error') failure = event.error
    }
    seen = upTo
  }
  const response = await agentApi.post<string>(`/api/v1/projects/${id}/upload-static`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'text',
    transformResponse: (data) => data,
    timeout: 0,
    onUploadProgress: (event) => {
      if (!event.total) return
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    },
    onDownloadProgress: (event) => {
      const text = (event.event?.target as XMLHttpRequest | undefined)?.responseText
      if (typeof text === 'string') read(text, false)
    },
  })
  read(typeof response.data === 'string' ? response.data : '', true)
  if (failure) throw new UploadError(failure)
  if (!result) throw new UploadError('the upload ended without an answer')
  return result as { workingDir: string; built: boolean }
}
