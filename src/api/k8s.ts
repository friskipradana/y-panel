import { agentApi } from './client'
import { streamJsonLines } from './ndjson'

export interface K8sHostStatus {
  os: string
  kubectlInstalled: boolean
  kubectlPath: string
  k3sInstalled: boolean
  k3sRunning: boolean
  k3sKubeconfig: boolean
  canInstallK3s: boolean
  canUninstallK3s: boolean
  hostIp: string
}

export interface K8sCluster {
  id: number
  ownerUserId: number
  name: string
  provider: 'k3s-local' | 'external'
  apiServer: string
  defaultNamespace: string
  createdAt: string
  updatedAt: string
}

export interface K8sStatusResponse {
  host: K8sHostStatus
  clusters: K8sCluster[]
  isSuper: boolean
}

export interface K8sClusterSummary {
  serverVersion: string
  nodesTotal: number
  nodesReady: number
  namespacesTotal: number
  podsTotal: number
  podsRunning: number
  podsPending: number
  podsFailed: number
  deployments: number
  services: number
}

export interface K8sNode {
  name: string
  status: string
  roles: string
  version: string
  internalIp: string
  osImage: string
  cpu: string
  memory: string
  createdAt: string
}

export interface K8sPod {
  name: string
  namespace: string
  status: string
  ready: string
  restarts: number
  nodeName: string
  podIp: string
  containers: string[]
  createdAt: string
}

export interface K8sDeployment {
  name: string
  namespace: string
  replicas: number
  readyReplicas: number
  availableReplicas: number
  image: string
  createdAt: string
}

export interface K8sServicePort {
  name: string
  port: number
  targetPort: string
  nodePort: number
  protocol: string
}

export interface K8sService {
  name: string
  namespace: string
  type: string
  clusterIp: string
  externalIp: string
  ports: K8sServicePort[]
  createdAt: string
}

export interface K8sIngress {
  name: string
  namespace: string
  className: string
  hosts: string[]
  createdAt: string
}

export interface K8sConfigResource {
  kind: 'ConfigMap' | 'Secret'
  name: string
  namespace: string
  type?: string
  keys: string[]
  createdAt: string
}

export interface K3sInstallEvent {
  phase: 'start' | 'log' | 'done' | 'error'
  line?: string
  error?: string
}

export interface K8sDeployProjectInput {
  name: string
  namespace: string
  image: string
  port: number
  replicas: number
  serviceType: 'NodePort' | 'ClusterIP'
  nodePort?: number
  env?: Record<string, string>
}

export interface K8sDeployProjectResult {
  name: string
  namespace: string
  serviceType: string
  nodePort: number
  output: string
  manifest: string
}

export const getK8sStatus = () =>
  agentApi.get<K8sStatusResponse>('/api/v1/k8s/status').then((r) => r.data)

export const createK8sCluster = (payload: {
  name: string
  provider: 'k3s-local' | 'external'
  defaultNamespace?: string
  kubeconfig?: string
}) => agentApi.post<K8sCluster>('/api/v1/k8s/clusters', payload).then((r) => r.data)

export const deleteK8sCluster = (clusterId: string | number) =>
  agentApi.delete(`/api/v1/k8s/clusters/${encodeURIComponent(String(clusterId))}`).then((r) => r.data)

export const installK3sStream = (
  opts: { disableTraefik: boolean },
  onEvent: (ev: K3sInstallEvent) => void,
  signal: AbortSignal,
) => streamJsonLines<K3sInstallEvent>('/api/v1/k8s/k3s/install', { body: opts }, onEvent, signal)

export const uninstallK3s = () =>
  agentApi.post<{ ok: boolean; logs?: string }>('/api/v1/k8s/k3s/uninstall').then((r) => r.data)

export const getK3sJoinCommand = () =>
  agentApi.get<{ serverUrl: string; token: string; command: string }>('/api/v1/k8s/k3s/join-command').then((r) => r.data)

export const getK8sSummary = (clusterId: string) =>
  agentApi.get<K8sClusterSummary>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/summary`).then((r) => r.data)

export const listK8sNamespaces = (clusterId: string) =>
  agentApi.get<{ items: string[] }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/namespaces`).then((r) => r.data.items)

export const createK8sNamespace = (clusterId: string, name: string) =>
  agentApi.post(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/namespaces`, { name }).then((r) => r.data)

export const listK8sNodes = (clusterId: string) =>
  agentApi.get<{ items: K8sNode[] }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/nodes`).then((r) => r.data.items)

export const listK8sPods = (clusterId: string, namespace: string) =>
  agentApi.get<{ items: K8sPod[] }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/pods`, { params: { namespace } }).then((r) => r.data.items)

export const deleteK8sPod = (clusterId: string, namespace: string, name: string) =>
  agentApi.delete(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`).then((r) => r.data)

export const getK8sPodLogs = (clusterId: string, namespace: string, name: string, container = '', tail = 200) =>
  agentApi
    .get<{ logs: string }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs`, {
      params: { container, tail },
    })
    .then((r) => r.data.logs)

export const execK8sPodCommand = (clusterId: string, namespace: string, name: string, container: string, command: string) =>
  agentApi
    .post<{ output: string }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/exec`, {
      container,
      command,
    })
    .then((r) => r.data.output)

export const listK8sDeployments = (clusterId: string, namespace: string) =>
  agentApi.get<{ items: K8sDeployment[] }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/deployments`, { params: { namespace } }).then((r) => r.data.items)

export const scaleK8sDeployment = (clusterId: string, namespace: string, name: string, replicas: number) =>
  agentApi
    .post(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`, { replicas })
    .then((r) => r.data)

export const restartK8sDeployment = (clusterId: string, namespace: string, name: string) =>
  agentApi
    .post(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/restart`)
    .then((r) => r.data)

export const listK8sServices = (clusterId: string, namespace: string) =>
  agentApi
    .get<{ services: K8sService[]; ingresses: K8sIngress[] }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/services`, { params: { namespace } })
    .then((r) => r.data)

export const listK8sConfigs = (clusterId: string, namespace: string) =>
  agentApi.get<{ items: K8sConfigResource[] }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/configs`, { params: { namespace } }).then((r) => r.data.items)

export const getK8sResourceYAML = (clusterId: string, kind: string, namespace: string, name: string) =>
  agentApi
    .get<{ yaml: string }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/yaml`, { params: { kind, namespace, name } })
    .then((r) => r.data.yaml)

export const applyK8sYAML = (clusterId: string, namespace: string, yaml: string) =>
  agentApi.post<{ ok: boolean; output: string }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/apply`, { namespace, yaml }).then((r) => r.data)

export const deleteK8sResource = (clusterId: string, kind: string, namespace: string, name: string) =>
  agentApi
    .delete(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/resource`, { params: { kind, namespace, name } })
    .then((r) => r.data)

export const deployProjectToK8s = (clusterId: string, payload: K8sDeployProjectInput) =>
  agentApi
    .post<{ ok: boolean; result: K8sDeployProjectResult; message: string }>(`/api/v1/k8s/clusters/${encodeURIComponent(clusterId)}/deploy-project`, payload)
    .then((r) => r.data)
