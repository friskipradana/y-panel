import { agentApi } from './client'
import { withPagination } from './client'
import type {
  Container,
  DockerDeployComposePayload,
  DockerDeployImagePayload,
  DockerDeployResponse,
  DockerOwnerPreview,
  DockerPullImagePayload,
  DockerNetwork,
  DockerImage,
  DockerTemplate,
  DockerContainerConfig,
  PaginatedResponse,
  PaginationParams,
} from '@/types'

export const listContainers = () =>
  agentApi.get<Container[]>('/api/v1/containers').then((r) => r.data)

export const listContainerOwners = (params?: PaginationParams) =>
  agentApi.get<PaginatedResponse<DockerOwnerPreview>>('/api/v1/containers/owners', withPagination(params)).then((r) => r.data)

export const deployImageContainer = (payload: DockerDeployImagePayload) =>
  agentApi.post<DockerDeployResponse>('/api/v1/containers/deploy-image', payload).then((r) => r.data)

export const deployComposeProject = (payload: DockerDeployComposePayload) =>
  agentApi.post<DockerDeployResponse>('/api/v1/containers/deploy-compose', payload).then((r) => r.data)

export const startContainer = (id: string) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/containers/${id}/start`).then((r) => r.data)

export const stopContainer = (id: string) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/containers/${id}/stop`).then((r) => r.data)

export const restartContainer = (id: string) =>
  agentApi.post<{ ok: boolean }>(`/api/v1/containers/${id}/restart`).then((r) => r.data)

export const deleteContainer = (id: string, opts?: { removeVolumes?: boolean; removeImage?: boolean }) => {
  const params = new URLSearchParams()
  if (opts?.removeVolumes) params.set('removeVolumes', 'true')
  if (opts?.removeImage) params.set('removeImage', 'true')
  const qs = params.toString() ? `?${params.toString()}` : ''
  return agentApi.delete<{ ok: boolean }>(`/api/v1/containers/${id}${qs}`).then((r) => r.data)
}

export const fetchContainerConfig = (id: string) =>
  agentApi.get<DockerContainerConfig>(`/api/v1/containers/${id}/config`).then((r) => r.data)

export const fetchContainerLogs = (id: string, tail = 200) =>
  agentApi.get<{ id: string; tail: number; lines: string[] }>(`/api/v1/containers/${id}/logs`, { params: { tail } }).then((r) => r.data)

export const listDockerNetworks = () =>
  agentApi.get<{ items: DockerNetwork[] }>('/api/v1/docker/networks').then((r) => r.data)

export const createDockerNetwork = (payload: { name: string; subnet?: string; gateway?: string }) =>
  agentApi.post<{ status: string }>('/api/v1/docker/networks', payload).then((r) => r.data)

export const deleteDockerNetwork = (id: string) =>
  agentApi.delete<{ status: string }>(`/api/v1/docker/networks/${id}`).then((r) => r.data)

export const listDockerImages = () =>
  agentApi.get<{ items: DockerImage[] }>('/api/v1/docker/images').then((r) => r.data)

export const pullDockerImage = (payload: DockerPullImagePayload) =>
  agentApi.post<{ status: string; image: string }>('/api/v1/docker/images/pull', payload).then((r) => r.data)

export const deleteDockerImage = (id: string) =>
  agentApi.delete<{ status: string }>(`/api/v1/docker/images/${id}`).then((r) => r.data)

export const listDockerTemplates = () =>
  agentApi.get<{ items: DockerTemplate[] }>('/api/v1/docker/templates').then((r) => r.data)

export const createDockerTemplate = (payload: { name: string; description: string; yamlContent: string }) =>
  agentApi.post<DockerTemplate>('/api/v1/docker/templates', payload).then((r) => r.data)

export const updateDockerTemplate = (id: number, payload: { name: string; description: string; yamlContent: string }) =>
  agentApi.put<{ status: string }>(`/api/v1/docker/templates/${id}`, payload).then((r) => r.data)

export const deleteDockerTemplate = (id: number) =>
  agentApi.delete<{ status: string }>(`/api/v1/docker/templates/${id}`).then((r) => r.data)
