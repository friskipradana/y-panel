import { agentApi } from './client'

export interface ProjectWebhook {
  id: number
  projectId: number
  ownerUserId: number
  enabled: boolean
  token: string
  hasSecret: boolean
  branch: string
  deployMode: 'project' | 'k8s'
  k8sClusterId?: string
  k8sNamespace?: string
  notifyEnabled: boolean
  lastStatus: string
  lastCommit?: string
  lastRunAt?: string
}

export interface ProjectDeployLog {
  id: number
  projectId: number
  trigger: string
  branch: string
  commitSha?: string
  status: 'running' | 'success' | 'failed'
  output: string
  startedAt: string
  finishedAt?: string
}

export const getProjectWebhook = (projectId: number) =>
  agentApi.get<{ webhook: ProjectWebhook | null; logs: ProjectDeployLog[] }>(`/api/v1/projects/${projectId}/webhook`).then((r) => r.data)

export const saveProjectWebhook = (
  projectId: number,
  payload: {
    enabled: boolean
    secret?: string
    rotateToken?: boolean
    branch: string
    deployMode: 'project' | 'k8s'
    k8sClusterId?: string
    k8sNamespace?: string
    notifyEnabled: boolean
  },
) => agentApi.put<ProjectWebhook>(`/api/v1/projects/${projectId}/webhook`, payload).then((r) => r.data)

export const triggerProjectWebhook = (projectId: number) =>
  agentApi.post<{ ok: boolean; message: string }>(`/api/v1/projects/${projectId}/webhook/trigger`).then((r) => r.data)
