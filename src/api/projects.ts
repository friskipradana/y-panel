import { agentApi } from './client'
import type { PaginatedResponse, PaginationParams } from '@/types'

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
}

export interface ProjectAttentionSummary {
  total: number
  attentionCount: number
  degradedCount: number
  driftCount: number
}

export const listProjects = (params?: ProjectListParams) =>
  agentApi
    .get<PaginatedResponse<Project>>('/api/v1/projects', {
      params: {
        q: params?.q ?? '',
        limit: params?.limit,
        offset: params?.offset,
        all: params?.all ? 1 : undefined,
      },
    })
    .then((r) => r.data)

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

export const stopProject = (id: number) =>
  agentApi.post<{ ok: boolean; status: string; project: Project }>(`/api/v1/projects/${id}/stop`).then((r) => r.data)

export const uploadStaticProjectBuild = (id: number, file: File, clean = true, rootDir = '', onProgress?: (percent: number) => void) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('clean', clean ? 'true' : 'false')
  formData.append('rootDir', rootDir)
  return agentApi
    .post<{ ok: boolean; project: Project; workingDir: string }>(`/api/v1/projects/${id}/upload-static`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (!event.total) return
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      },
    })
    .then((r) => r.data)
}
