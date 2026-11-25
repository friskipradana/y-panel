import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { WindowState } from '@/types'
import {
  applyK8sYAML,
  createK8sCluster,
  createK8sNamespace,
  deleteK8sCluster,
  deleteK8sPod,
  deleteK8sResource,
  deployProjectToK8s,
  getK3sJoinCommand,
  getK8sStatus,
  getK8sSummary,
  installK3sStream,
  listK8sConfigs,
  listK8sDeployments,
  listK8sEvents,
  listK8sNamespaces,
  listK8sNodes,
  listK8sPods,
  listK8sServices,
  restartK8sDeployment,
  scaleK8sDeployment,
  uninstallK3s,
  type K8sDeployProjectInput,
  type K8sDeployment,
  type K8sPod,
  type K8sService,
} from '@/api/k8s'
import { useI18n } from '@/lib/i18n'
import { alertLib } from '@/lib/alert'
import { useWindowPollingActive } from '@/hooks/useWindowPollingActive'
import type { RouteSubject } from '@/components/windows/tunnels/RouteDomainModal'

export type K8sSection = 'overview' | 'nodes' | 'pods' | 'deployments' | 'services' | 'configs' | 'events' | 'yaml'

export interface K8sDeployPreset {
  projectId?: number
  name?: string
  port?: number
  image?: string
  namespace?: string
}

export function useKubernetesWindow(win: WindowState, authenticated: boolean) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const pollingActive = useWindowPollingActive(win) && authenticated

  const [section, setSection] = useState<K8sSection>('overview')
  const [selectedClusterId, setSelectedClusterId] = useState<string>('')
  const [namespace, setNamespace] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Modals
  const [addClusterOpen, setAddClusterOpen] = useState(false)
  const [logsPod, setLogsPod] = useState<K8sPod | null>(null)
  const [execPod, setExecPod] = useState<K8sPod | null>(null)
  const [scaleDep, setScaleDep] = useState<K8sDeployment | null>(null)
  const [yamlTarget, setYamlTarget] = useState<{ kind: string; namespace: string; name: string } | null>(null)
  const [deployPreset, setDeployPreset] = useState<K8sDeployPreset | null>(null)
  const [tunnelSubject, setTunnelSubject] = useState<RouteSubject | null>(null)

  // K3s installer streaming state
  const [k3sLogs, setK3sLogs] = useState<string[]>([])
  const [k3sInstalling, setK3sInstalling] = useState(false)
  const k3sAbortRef = useRef<AbortController | null>(null)

  // Handle Stage 2 deep-link from Projects window ("Deploy to Kubernetes")
  const deployRequest = win.params?.deployRequest as number | undefined
  useEffect(() => {
    if (!deployRequest) return
    const p = win.params?.deployPreset as K8sDeployPreset | undefined
    if (p) {
      setDeployPreset({ ...p })
    }
  }, [deployRequest, win.params?.deployPreset])

  const statusQ = useQuery({
    queryKey: ['k8s-status'],
    queryFn: getK8sStatus,
    enabled: authenticated,
    refetchInterval: pollingActive ? 20_000 : false,
  })

  const clusterOptions = useMemo(() => {
    const out: { id: string; label: string; provider: string; removable: boolean }[] = []
    if (statusQ.data?.isSuper && statusQ.data?.host?.k3sKubeconfig) {
      out.push({ id: 'local-k3s', label: t('k8s.localK3s'), provider: 'k3s-local', removable: false })
    }
    for (const c of statusQ.data?.clusters ?? []) {
      if (c.provider === 'k3s-local' && out.some((x) => x.id === 'local-k3s')) continue
      out.push({ id: String(c.id), label: c.name, provider: c.provider, removable: true })
    }
    return out
  }, [statusQ.data, t])

  const activeClusterId = useMemo(() => {
    if (selectedClusterId && clusterOptions.some((c) => c.id === selectedClusterId)) {
      return selectedClusterId
    }
    return clusterOptions[0]?.id ?? ''
  }, [selectedClusterId, clusterOptions])

  const hasCluster = Boolean(activeClusterId)

  const namespacesQ = useQuery({
    queryKey: ['k8s-namespaces', activeClusterId],
    queryFn: () => listK8sNamespaces(activeClusterId),
    enabled: authenticated && hasCluster,
    staleTime: 30_000,
  })

  const summaryQ = useQuery({
    queryKey: ['k8s-summary', activeClusterId],
    queryFn: () => getK8sSummary(activeClusterId),
    enabled: authenticated && hasCluster && section === 'overview',
    refetchInterval: pollingActive && section === 'overview' ? 15_000 : false,
  })

  const nodesQ = useQuery({
    queryKey: ['k8s-nodes', activeClusterId],
    queryFn: () => listK8sNodes(activeClusterId),
    enabled: authenticated && hasCluster && section === 'nodes',
    refetchInterval: pollingActive && section === 'nodes' ? 15_000 : false,
  })

  const podsQ = useQuery({
    queryKey: ['k8s-pods', activeClusterId, namespace],
    queryFn: () => listK8sPods(activeClusterId, namespace),
    enabled: authenticated && hasCluster && section === 'pods',
    refetchInterval: pollingActive && section === 'pods' ? 10_000 : false,
  })

  const deploymentsQ = useQuery({
    queryKey: ['k8s-deployments', activeClusterId, namespace],
    queryFn: () => listK8sDeployments(activeClusterId, namespace),
    enabled: authenticated && hasCluster && section === 'deployments',
    refetchInterval: pollingActive && section === 'deployments' ? 15_000 : false,
  })

  const servicesQ = useQuery({
    queryKey: ['k8s-services', activeClusterId, namespace],
    queryFn: () => listK8sServices(activeClusterId, namespace),
    enabled: authenticated && hasCluster && section === 'services',
    refetchInterval: pollingActive && section === 'services' ? 15_000 : false,
  })

  const configsQ = useQuery({
    queryKey: ['k8s-configs', activeClusterId, namespace],
    queryFn: () => listK8sConfigs(activeClusterId, namespace),
    enabled: authenticated && hasCluster && section === 'configs',
    refetchInterval: pollingActive && section === 'configs' ? 20_000 : false,
  })

  const eventsQ = useQuery({
    queryKey: ['k8s-events', activeClusterId, namespace],
    queryFn: () => listK8sEvents(activeClusterId, namespace),
    enabled: authenticated && hasCluster && section === 'events',
    refetchInterval: pollingActive && section === 'events' ? 10_000 : false,
  })

  const joinCmdQ = useQuery({
    queryKey: ['k8s-join-cmd'],
    queryFn: getK3sJoinCommand,
    enabled: authenticated && Boolean(statusQ.data?.isSuper && statusQ.data?.host?.k3sRunning),
    staleTime: 60_000,
    retry: false,
  })

  const invalidateCluster = () => {
    void qc.invalidateQueries({ queryKey: ['k8s-status'] })
    void qc.invalidateQueries({ queryKey: ['k8s-summary', activeClusterId] })
    void qc.invalidateQueries({ queryKey: ['k8s-namespaces', activeClusterId] })
    void qc.invalidateQueries({ queryKey: ['k8s-nodes', activeClusterId] })
    void qc.invalidateQueries({ queryKey: ['k8s-pods', activeClusterId] })
    void qc.invalidateQueries({ queryKey: ['k8s-deployments', activeClusterId] })
    void qc.invalidateQueries({ queryKey: ['k8s-services', activeClusterId] })
    void qc.invalidateQueries({ queryKey: ['k8s-configs', activeClusterId] })
    void qc.invalidateQueries({ queryKey: ['k8s-events', activeClusterId] })
  }

  const createClusterMut = useMutation({
    mutationFn: createK8sCluster,
    onSuccess: (created) => {
      toast.success(t('k8s.clusterAdded', { name: created.name }))
      setSelectedClusterId(String(created.id))
      setAddClusterOpen(false)
      void qc.invalidateQueries({ queryKey: ['k8s-status'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteClusterMut = useMutation({
    mutationFn: (id: string) => deleteK8sCluster(id),
    onSuccess: () => {
      toast.success(t('k8s.clusterDeleted'))
      setSelectedClusterId('')
      void qc.invalidateQueries({ queryKey: ['k8s-status'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createNamespaceMut = useMutation({
    mutationFn: (name: string) => createK8sNamespace(activeClusterId, name),
    onSuccess: () => {
      toast.success(t('k8s.namespaceCreated'))
      void qc.invalidateQueries({ queryKey: ['k8s-namespaces', activeClusterId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deletePodMut = useMutation({
    mutationFn: (pod: K8sPod) => deleteK8sPod(activeClusterId, pod.namespace, pod.name),
    onSuccess: () => {
      toast.success(t('k8s.podDeleted'))
      void qc.invalidateQueries({ queryKey: ['k8s-pods', activeClusterId] })
      void qc.invalidateQueries({ queryKey: ['k8s-summary', activeClusterId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const scaleDepMut = useMutation({
    mutationFn: ({ dep, replicas }: { dep: K8sDeployment; replicas: number }) =>
      scaleK8sDeployment(activeClusterId, dep.namespace, dep.name, replicas),
    onSuccess: () => {
      toast.success(t('k8s.scaledOk'))
      setScaleDep(null)
      void qc.invalidateQueries({ queryKey: ['k8s-deployments', activeClusterId] })
      void qc.invalidateQueries({ queryKey: ['k8s-pods', activeClusterId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const restartDepMut = useMutation({
    mutationFn: (dep: K8sDeployment) => restartK8sDeployment(activeClusterId, dep.namespace, dep.name),
    onSuccess: () => {
      toast.success(t('k8s.rolloutRestarted'))
      void qc.invalidateQueries({ queryKey: ['k8s-deployments', activeClusterId] })
      void qc.invalidateQueries({ queryKey: ['k8s-pods', activeClusterId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const applyYamlMut = useMutation({
    mutationFn: ({ ns, yaml }: { ns: string; yaml: string }) => applyK8sYAML(activeClusterId, ns, yaml),
    onSuccess: (res) => {
      toast.success(res.output || t('k8s.yamlApplied'))
      invalidateCluster()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteResourceMut = useMutation({
    mutationFn: ({ kind, ns, name }: { kind: string; ns: string; name: string }) =>
      deleteK8sResource(activeClusterId, kind, ns, name),
    onSuccess: () => {
      toast.success(t('k8s.resourceDeleted'))
      invalidateCluster()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deployProjectMut = useMutation({
    mutationFn: (payload: K8sDeployProjectInput) => deployProjectToK8s(activeClusterId, payload),
    onSuccess: (res) => {
      toast.success(res.message || t('k8s.deploySuccess'))
      setDeployPreset(null)
      invalidateCluster()
      setSection('services')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const uninstallK3sMut = useMutation({
    mutationFn: uninstallK3s,
    onSuccess: () => {
      toast.success(t('k8s.k3sUninstalled'))
      setSelectedClusterId('')
      invalidateCluster()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const startK3sInstall = async (disableTraefik: boolean) => {
    if (k3sInstalling) return
    setK3sInstalling(true)
    setK3sLogs([])
    const ac = new AbortController()
    k3sAbortRef.current = ac
    try {
      await installK3sStream(
        { disableTraefik },
        (ev) => {
          if (ev.line) setK3sLogs((prev) => [...prev.slice(-200), ev.line!])
          if (ev.phase === 'error' && ev.error) toast.error(ev.error)
          if (ev.phase === 'done') {
            toast.success(t('k8s.k3sInstalled'))
            void qc.invalidateQueries({ queryKey: ['k8s-status'] })
          }
        },
        ac.signal,
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error((err as Error).message)
      }
    } finally {
      setK3sInstalling(false)
      k3sAbortRef.current = null
    }
  }

  const confirmDeleteCluster = async () => {
    const active = clusterOptions.find((c) => c.id === activeClusterId)
    if (!active || !active.removable) return
    const ok = await alertLib.confirm(
      t('k8s.deleteClusterTitle'),
      t('k8s.deleteClusterConfirm', { name: active.label }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) deleteClusterMut.mutate(active.id)
  }

  const confirmUninstallK3s = async () => {
    const ok = await alertLib.confirm(
      t('k8s.uninstallK3sTitle'),
      t('k8s.uninstallK3sConfirm'),
      t('k8s.uninstallK3s'),
      t('common.cancel'),
      'warning',
      win.id,
    )
    if (ok) uninstallK3sMut.mutate()
  }

  const openTunnelForService = (svc: K8sService) => {
    const hostIp = statusQ.data?.host?.hostIp || '127.0.0.1'
    const targets = svc.ports
      .filter((p) => p.nodePort > 0 || (svc.clusterIp && svc.clusterIp !== 'None' && p.port > 0))
      .map((p) => {
        const usePort = p.nodePort > 0 ? p.nodePort : p.port
        const targetHost = p.nodePort > 0 ? '127.0.0.1' : svc.clusterIp || hostIp
        return {
          key: `${svc.namespace}-${svc.name}-${usePort}`,
          host: targetHost,
          port: usePort,
          label: p.nodePort > 0 ? `NodePort :${p.nodePort} -> :${p.port}` : `${targetHost}:${p.port}`,
        }
      })
    if (targets.length === 0) {
      toast.error(t('k8s.serviceNoExposedPort'))
      return
    }
    setTunnelSubject({
      id: `k8s-${svc.namespace}-${svc.name}`,
      name: svc.name,
      kind: 'k8s-service',
      targets,
    })
  }

  return {
    t,
    section,
    setSection,
    namespace,
    setNamespace,
    search,
    setSearch,
    clusterOptions,
    activeClusterId,
    setSelectedClusterId,
    hasCluster,
    statusQ,
    namespacesQ,
    summaryQ,
    nodesQ,
    podsQ,
    deploymentsQ,
    servicesQ,
    configsQ,
    eventsQ,
    joinCmdQ,
    invalidateCluster,
    addClusterOpen,
    setAddClusterOpen,
    logsPod,
    setLogsPod,
    execPod,
    setExecPod,
    scaleDep,
    setScaleDep,
    yamlTarget,
    setYamlTarget,
    deployPreset,
    setDeployPreset,
    tunnelSubject,
    setTunnelSubject,
    k3sLogs,
    k3sInstalling,
    startK3sInstall,
    uninstallK3sMut,
    confirmUninstallK3s,
    confirmDeleteCluster,
    createClusterMut,
    createNamespaceMut,
    deletePodMut,
    scaleDepMut,
    restartDepMut,
    applyYamlMut,
    deleteResourceMut,
    deployProjectMut,
    openTunnelForService,
  }
}

export type KubernetesWindowState = ReturnType<typeof useKubernetesWindow>
