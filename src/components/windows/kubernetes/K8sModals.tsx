import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy, Download, Pause, Play, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { listProjects } from '@/api/agent'
import { deployProjectSourceToK8sStream, execK8sPodCommand, getK8sResourceYAML } from '@/api/k8s'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import { LoadingState } from '@/components/ui/states'
import { useK8sPodLogs } from '@/hooks/useK8sPodLogs'
import { stripAnsi } from '@/lib/ansi'
import type { KubernetesWindowState } from './useKubernetesWindow'

export function K8sModals({ kw }: { kw: KubernetesWindowState }) {
  return (
    <>
      <AddClusterModal kw={kw} />
      <PodLogsModal kw={kw} />
      <PodExecModal kw={kw} />
      <ScaleDeploymentModal kw={kw} />
      <YamlInspectorModal kw={kw} />
      <DeployProjectK8sModal kw={kw} />
    </>
  )
}

function AddClusterModal({ kw }: { kw: KubernetesWindowState }) {
  const { t, addClusterOpen, setAddClusterOpen, createClusterMut } = kw
  const [name, setName] = useState('')
  const [defaultNamespace, setDefaultNamespace] = useState('default')
  const [kubeconfig, setKubeconfig] = useState('')

  const handleSubmit = () => {
    createClusterMut.mutate(
      { name: name.trim(), provider: 'external', defaultNamespace: defaultNamespace.trim() || 'default', kubeconfig },
      {
        onSuccess: () => {
          setName('')
          setDefaultNamespace('default')
          setKubeconfig('')
        },
      },
    )
  }

  return (
    <Modal open={addClusterOpen} onClose={() => setAddClusterOpen(false)} title={t('k8s.addClusterTitle')}>
      <div className="space-y-3">
        <Field label={t('k8s.clusterNameLabel')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('k8s.clusterNamePlaceholder')} />
        </Field>
        <Field label={t('k8s.defaultNamespaceLabel')}>
          <TextInput className="panel-input--mono" value={defaultNamespace} onChange={(e) => setDefaultNamespace(e.target.value)} placeholder="default" />
        </Field>
        <Field label={t('k8s.kubeconfigLabel')} hint={t('k8s.kubeconfigHint')}>
          <Textarea
            rows={8}
            className="panel-input--mono"
            value={kubeconfig}
            onChange={(e) => setKubeconfig(e.target.value)}
            placeholder="apiVersion: v1&#10;kind: Config&#10;clusters: ..."
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setAddClusterOpen(false)}>{t('common.cancel')}</Button>
          <Button size="sm" variant="primary" disabled={!name.trim() || !kubeconfig.trim()} loading={createClusterMut.isPending} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PodLogsModal({ kw }: { kw: KubernetesWindowState }) {
  const { t, activeClusterId, logsPod, setLogsPod } = kw
  const [container, setContainer] = useState('')
  const [tail, setTail] = useState('200')
  const [query, setQuery] = useState('')
  const [wrap, setWrap] = useState(true)
  const viewerRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    setContainer(logsPod?.containers[0] ?? '')
    setQuery('')
  }, [logsPod])

  const { lines, status, detail, paused, setPaused, clear, reconnect } = useK8sPodLogs(
    activeClusterId,
    logsPod?.namespace ?? null,
    logsPod?.name ?? null,
    container,
    Number(tail) || 200,
  )

  const term = query.trim().toLowerCase()
  const visible = useMemo(
    () => (term ? lines.filter((l) => stripAnsi(l).toLowerCase().includes(term)) : lines),
    [lines, term],
  )

  useEffect(() => {
    if (!paused && viewerRef.current) {
      viewerRef.current.scrollTop = viewerRef.current.scrollHeight
    }
  }, [visible, paused])

  const downloadLogs = () => {
    const text = visible.map(stripAnsi).join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${logsPod?.name || 'pod'}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      open={Boolean(logsPod)}
      onClose={() => setLogsPod(null)}
      title={logsPod ? `${t('k8s.logs')}: ${logsPod.namespace}/${logsPod.name}` : t('k8s.logs')}
      size="xl"
    >
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status === 'live' ? 'success' : status === 'connecting' ? 'info' : status === 'ended' ? 'neutral' : 'danger'}>
            {t(`k8s.logStatus.${status}`)}
          </Badge>
          {logsPod && logsPod.containers.length > 1 ? (
            <Select
              size="sm"
              value={container}
              onChange={setContainer}
              options={logsPod.containers.map((c) => ({ value: c, label: c }))}
            />
          ) : null}
          <Select
            size="sm"
            value={tail}
            onChange={setTail}
            options={[
              { value: '100', label: '100' },
              { value: '200', label: '200' },
              { value: '500', label: '500' },
              { value: '1000', label: '1000' },
            ]}
          />
          <SearchInput value={query} onChange={setQuery} placeholder={t('k8s.filterLogs')} />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setPaused(!paused)}>
              {paused ? <Play className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />}
              <span>{paused ? t('k8s.resume') : t('k8s.pause')}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setWrap((w) => !w)}>
              <span>{wrap ? t('k8s.noWrap') : t('k8s.wrapLines')}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={clear}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('common.clear')}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={reconnect}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('common.refresh')}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(visible.map(stripAnsi).join('\n')).then(() => toast.success(t('common.copied')))
              }}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('common.copy')}</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={downloadLogs}>
              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('k8s.downloadLog')}</span>
            </Button>
          </div>
        </div>
        {detail ? <p className="text-[11.5px] text-[var(--panel-warning-text)]">{detail}</p> : null}
        <pre
          ref={viewerRef}
          className={`panel-mono max-h-[60vh] min-h-[260px] overflow-y-auto rounded-md border border-[var(--win-border)] bg-[var(--app-terminal-bg)] p-3 text-[11.5px] leading-5 text-[var(--app-terminal-text)] ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'}`}
        >
          {visible.length > 0 ? visible.map(stripAnsi).join('\n') : status === 'connecting' ? t('k8s.loadingLogs') : t('k8s.noLogs')}
        </pre>
      </div>
    </Modal>
  )
}

function PodExecModal({ kw }: { kw: KubernetesWindowState }) {
  const { t, activeClusterId, execPod, setExecPod } = kw
  const [container, setContainer] = useState('')
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    setContainer(execPod?.containers[0] ?? '')
    setHistory([])
    setCommand('')
  }, [execPod])

  const execMut = useMutation({
    mutationFn: (cmd: string) => execK8sPodCommand(activeClusterId, execPod!.namespace, execPod!.name, container, cmd),
    onSuccess: (out, cmd) => {
      setHistory((prev) => [...prev, `$ ${cmd}\n${out || '(ok)'}`])
      setCommand('')
    },
    onError: (e: Error, cmd) => {
      setHistory((prev) => [...prev, `$ ${cmd}\nERROR: ${e.message}`])
    },
  })

  return (
    <Modal open={Boolean(execPod)} onClose={() => setExecPod(null)} title={execPod ? `${t('k8s.exec')}: ${execPod.namespace}/${execPod.name}` : t('k8s.exec')} size="lg">
      <div className="space-y-3">
        {execPod && execPod.containers.length > 1 ? (
          <Select value={container} onChange={setContainer} options={execPod.containers.map((c) => ({ value: c, label: c }))} />
        ) : null}
        <pre className="panel-mono h-64 overflow-y-auto rounded-md border border-[var(--win-border)] bg-[var(--app-terminal-bg)] p-3 text-[11.5px] leading-5 text-[var(--app-terminal-text)] whitespace-pre-wrap break-words">
          {history.length > 0 ? history.join('\n\n') : t('k8s.execHint')}
        </pre>
        <div className="flex items-center gap-2">
          <TextInput
            className="panel-input--mono flex-1"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && command.trim() && !execMut.isPending) {
                execMut.mutate(command.trim())
              }
            }}
            placeholder={t('k8s.execPlaceholder')}
          />
          <Button size="sm" variant="primary" disabled={!command.trim()} loading={execMut.isPending} onClick={() => execMut.mutate(command.trim())}>
            <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('k8s.runCommand')}</span>
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ScaleDeploymentModal({ kw }: { kw: KubernetesWindowState }) {
  const { t, scaleDep, setScaleDep, scaleDepMut } = kw
  const [replicas, setReplicas] = useState('1')

  useEffect(() => {
    if (scaleDep) setReplicas(String(scaleDep.replicas))
  }, [scaleDep])

  return (
    <Modal open={Boolean(scaleDep)} onClose={() => setScaleDep(null)} title={scaleDep ? `${t('k8s.scale')}: ${scaleDep.name}` : t('k8s.scale')}>
      <div className="space-y-3">
        <Field label={t('k8s.replicasLabel')}>
          <TextInput type="number" min={0} max={100} className="panel-input--mono" value={replicas} onChange={(e) => setReplicas(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setScaleDep(null)}>{t('common.cancel')}</Button>
          <Button
            size="sm"
            variant="primary"
            loading={scaleDepMut.isPending}
            onClick={() => scaleDep && scaleDepMut.mutate({ dep: scaleDep, replicas: Math.max(0, Number(replicas) || 0) })}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function YamlInspectorModal({ kw }: { kw: KubernetesWindowState }) {
  const { t, activeClusterId, yamlTarget, setYamlTarget, applyYamlMut } = kw
  const [draft, setDraft] = useState('')

  const yamlQ = useQuery({
    queryKey: ['k8s-yaml', activeClusterId, yamlTarget?.kind, yamlTarget?.namespace, yamlTarget?.name],
    queryFn: () => getK8sResourceYAML(activeClusterId, yamlTarget!.kind, yamlTarget!.namespace, yamlTarget!.name),
    enabled: Boolean(yamlTarget && activeClusterId),
  })

  useEffect(() => {
    if (yamlQ.data !== undefined) setDraft(yamlQ.data)
  }, [yamlQ.data])

  return (
    <Modal open={Boolean(yamlTarget)} onClose={() => setYamlTarget(null)} title={yamlTarget ? `YAML: ${yamlTarget.kind}/${yamlTarget.name}` : 'YAML'} size="lg">
      <div className="space-y-3">
        {yamlQ.isLoading ? (
          <LoadingState>{t('k8s.loadingCluster')}</LoadingState>
        ) : (
          <Textarea rows={16} className="panel-input--mono" value={draft} onChange={(e) => setDraft(e.target.value)} />
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setYamlTarget(null)}>{t('common.close')}</Button>
          {yamlTarget && yamlTarget.kind !== 'node' ? (
            <Button
              size="sm"
              variant="primary"
              loading={applyYamlMut.isPending}
              onClick={() => {
                applyYamlMut.mutate(
                  { ns: yamlTarget.namespace || 'default', yaml: draft },
                  { onSuccess: () => setYamlTarget(null) },
                )
              }}
            >
              {t('k8s.applyYaml')}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

function DeployProjectK8sModal({ kw }: { kw: KubernetesWindowState }) {
  const { t, activeClusterId, deployPreset, setDeployPreset, deployProjectMut, invalidateCluster, setSection } = kw
  const [mode, setMode] = useState<'source' | 'image'>('image')
  const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('')
  const [ns, setNs] = useState('default')
  const [image, setImage] = useState('')
  const [registryImage, setRegistryImage] = useState('')
  const [port, setPort] = useState('80')
  const [replicas, setReplicas] = useState('1')
  const [serviceType, setServiceType] = useState<'NodePort' | 'ClusterIP'>('NodePort')
  const [building, setBuilding] = useState(false)
  const [buildLogs, setBuildLogs] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const projectsQ = useQuery({
    queryKey: ['projects-for-k8s-deploy'],
    queryFn: () => listProjects({ limit: 100, offset: 0 }),
    enabled: Boolean(deployPreset),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!deployPreset) return
    setMode(deployPreset.projectId ? 'source' : 'image')
    setProjectId(deployPreset.projectId ? String(deployPreset.projectId) : '')
    setName(deployPreset.name ?? '')
    setNs(deployPreset.namespace ?? 'default')
    setImage(deployPreset.image ?? '')
    setRegistryImage('')
    setPort(String(deployPreset.port && deployPreset.port > 0 ? deployPreset.port : 80))
    setReplicas('1')
    setServiceType('NodePort')
    setBuildLogs([])
    setBuilding(false)
  }, [deployPreset])

  const projectList = projectsQ.data?.items ?? []
  const isLocalK3s = activeClusterId === 'local-k3s'

  const startSourceDeploy = async () => {
    const pid = Number(projectId)
    if (!pid || building) return
    setBuilding(true)
    setBuildLogs([])
    const ac = new AbortController()
    abortRef.current = ac
    try {
      await deployProjectSourceToK8sStream(
        activeClusterId,
        {
          projectId: pid,
          name: name.trim() || undefined,
          namespace: ns.trim() || 'default',
          port: Number(port) || 80,
          replicas: Math.max(1, Number(replicas) || 1),
          serviceType,
          registryImage: registryImage.trim() || undefined,
        },
        (ev) => {
          if (ev.line) setBuildLogs((prev) => [...prev.slice(-250), ev.line!])
          if (ev.phase === 'error' && ev.error) toast.error(ev.error)
          if (ev.phase === 'done') {
            toast.success(ev.message || t('k8s.deploySuccess'))
            invalidateCluster()
            setSection('services')
            setDeployPreset(null)
          }
        },
        ac.signal,
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error((err as Error).message)
      }
    } finally {
      setBuilding(false)
      abortRef.current = null
    }
  }

  return (
    <Modal
      open={Boolean(deployPreset)}
      onClose={() => {
        abortRef.current?.abort()
        setDeployPreset(null)
      }}
      title={t('k8s.deployModalTitle')}
      size="lg"
    >
      <div className="space-y-3">
        <Tabs
          label={t('k8s.deployModalTitle')}
          variant="segmented"
          value={mode}
          onChange={(v) => setMode(v as 'source' | 'image')}
          items={[
            { key: 'source', label: t('k8s.deployModeSource') },
            { key: 'image', label: t('k8s.deployModeImage') },
          ]}
        />

        {mode === 'source' ? (
          <Field label={t('k8s.sourceProjectLabel')} hint={t('k8s.sourceProjectHint')}>
            <Select
              searchable
              value={projectId}
              onChange={(val) => {
                setProjectId(val)
                const matched = projectList.find((p) => String(p.id) === val)
                if (matched) {
                  setName(matched.name)
                  if (matched.assignedPort > 0) setPort(String(matched.assignedPort))
                }
              }}
              options={projectList.map((p) => ({
                value: String(p.id),
                label: p.name,
                description: p.workingDir || p.projectType,
              }))}
            />
          </Field>
        ) : null}

        <Field label={t('k8s.workloadNameLabel')}>
          <TextInput className="panel-input--mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('k8s.namespaceLabel')}>
            <TextInput className="panel-input--mono" value={ns} onChange={(e) => setNs(e.target.value)} placeholder="default" />
          </Field>
          <Field label={t('k8s.replicasLabel')}>
            <TextInput type="number" min={1} max={50} className="panel-input--mono" value={replicas} onChange={(e) => setReplicas(e.target.value)} />
          </Field>
        </div>

        {mode === 'image' ? (
          <Field label={t('k8s.imageLabel')} hint={t('k8s.imageHint')}>
            <TextInput className="panel-input--mono" value={image} onChange={(e) => setImage(e.target.value)} placeholder="ghcr.io/org/app:latest" />
          </Field>
        ) : (
          <Field
            label={t('k8s.registryImageLabel')}
            hint={isLocalK3s ? t('k8s.registryImageLocalHint') : t('k8s.registryImageExternalHint')}
          >
            <TextInput
              className="panel-input--mono"
              value={registryImage}
              onChange={(e) => setRegistryImage(e.target.value)}
              placeholder={isLocalK3s ? '' : 'ghcr.io/org/app:latest'}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('k8s.containerPortLabel')}>
            <TextInput type="number" min={1} max={65535} className="panel-input--mono" value={port} onChange={(e) => setPort(e.target.value)} />
          </Field>
          <Field label={t('k8s.serviceTypeLabel')}>
            <Select
              value={serviceType}
              onChange={(v) => setServiceType(v as 'NodePort' | 'ClusterIP')}
              options={[
                { value: 'NodePort', label: 'NodePort (Cloudflare Tunnel)' },
                { value: 'ClusterIP', label: 'ClusterIP (Internal)' },
              ]}
            />
          </Field>
        </div>

        {buildLogs.length > 0 ? (
          <pre className="panel-mono max-h-48 overflow-y-auto rounded-md border border-[var(--win-border)] bg-[var(--app-terminal-bg)] p-2.5 text-[11px] leading-5 text-[var(--app-terminal-text)] whitespace-pre-wrap break-words">
            {buildLogs.join('\n')}
          </pre>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              abortRef.current?.abort()
              setDeployPreset(null)
            }}
          >
            {t('common.cancel')}
          </Button>
          {mode === 'source' ? (
            <Button
              size="sm"
              variant="primary"
              disabled={!projectId || (!isLocalK3s && !registryImage.trim())}
              loading={building}
              onClick={() => void startSourceDeploy()}
            >
              {t('k8s.buildAndDeploy')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={!name.trim() || !image.trim()}
              loading={deployProjectMut.isPending}
              onClick={() =>
                deployProjectMut.mutate({
                  name: name.trim(),
                  namespace: ns.trim() || 'default',
                  image: image.trim(),
                  port: Number(port) || 80,
                  replicas: Math.max(1, Number(replicas) || 1),
                  serviceType,
                })
              }
            >
              {t('k8s.deployNow')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
