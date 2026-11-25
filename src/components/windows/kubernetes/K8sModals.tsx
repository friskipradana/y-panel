import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy, Download, Pause, Play, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { execK8sPodCommand, getK8sResourceYAML } from '@/api/k8s'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { LoadingState } from '@/components/ui/states'
import { useK8sPodLogs } from '@/hooks/useK8sPodLogs'
import { stripAnsi } from '@/lib/ansi'
import { K8sDeployModal } from './K8sDeployModal'
import type { KubernetesWindowState } from './useKubernetesWindow'

export function K8sModals({ kw }: { kw: KubernetesWindowState }) {
  return (
    <>
      <AddClusterModal kw={kw} />
      <PodLogsModal kw={kw} />
      <PodExecModal kw={kw} />
      <ScaleDeploymentModal kw={kw} />
      <YamlInspectorModal kw={kw} />
      <K8sDeployModal kw={kw} />
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
    <Modal
      open={addClusterOpen}
      onClose={() => setAddClusterOpen(false)}
      title={t('k8s.addClusterTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={() => setAddClusterOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || !kubeconfig.trim()}
            loading={createClusterMut.isPending}
            onClick={handleSubmit}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('k8s.clusterNameLabel')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('k8s.clusterNamePlaceholder')} />
        </Field>
        <Field label={t('k8s.defaultNamespaceLabel')}>
          <TextInput mono value={defaultNamespace} onChange={(e) => setDefaultNamespace(e.target.value)} placeholder={t('k8s.defaultNsPlaceholder')} />
        </Field>
        <Field label={t('k8s.kubeconfigLabel')} hint={t('k8s.kubeconfigHint')}>
          <Textarea
            mono
            rows={8}
            value={kubeconfig}
            onChange={(e) => setKubeconfig(e.target.value)}
            placeholder={t('k8s.kubeconfigPlaceholder')}
          />
        </Field>
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
      title={t('k8s.logs')}
      subtitle={logsPod ? `${logsPod.namespace}/${logsPod.name}` : undefined}
      size="sheet"
      width={1040}
    >
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status === 'live' ? 'success' : status === 'connecting' ? 'info' : status === 'ended' ? 'neutral' : 'danger'} dot>
            {t(`k8s.logStatus.${status}`)}
          </Badge>
          {logsPod && logsPod.containers.length > 1 ? (
            <Select
              size="sm"
              className="panel-toolbar-select"
              value={container}
              onChange={setContainer}
              options={logsPod.containers.map((c) => ({ value: c, label: c }))}
            />
          ) : null}
          <Select
            size="sm"
            className="panel-toolbar-select"
            value={tail}
            onChange={setTail}
            options={[
              { value: '100', label: '100' },
              { value: '200', label: '200' },
              { value: '500', label: '500' },
              { value: '1000', label: '1000' },
            ]}
          />
          <SearchInput className="docker-log-search" value={query} onChange={setQuery} placeholder={t('k8s.filterLogs')} />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              icon={paused ? <Play className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => setPaused(!paused)}
            >
              {paused ? t('k8s.resume') : t('k8s.pause')}
            </Button>
            <Button variant="ghost" onClick={() => setWrap((w) => !w)}>
              {wrap ? t('k8s.noWrap') : t('k8s.wrapLines')}
            </Button>
            <Button variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={clear}>
              {t('common.clear')}
            </Button>
            <Button variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={reconnect}>
              {t('common.refresh')}
            </Button>
            <Button
              variant="ghost"
              icon={<Copy className="h-3.5 w-3.5" strokeWidth={1.75} />}
              onClick={() => void navigator.clipboard.writeText(visible.map(stripAnsi).join('\n')).then(() => toast.success(t('common.copied')))}
            >
              {t('common.copy')}
            </Button>
            <Button variant="ghost" icon={<Download className="h-3.5 w-3.5" strokeWidth={1.75} />} onClick={downloadLogs}>
              {t('k8s.downloadLog')}
            </Button>
          </div>
        </div>
        {detail ? <p className="text-[0.75rem] text-[var(--panel-warning-text)]">{detail}</p> : null}
        <pre
          ref={viewerRef}
          className={`panel-mono min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-3 text-[0.75rem] leading-5 text-[var(--panel-code-text)] ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'}`}
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
    <Modal
      open={Boolean(execPod)}
      onClose={() => setExecPod(null)}
      title={t('k8s.exec')}
      subtitle={execPod ? `${execPod.namespace}/${execPod.name}` : undefined}
      size="lg"
      footer={
        <Button variant="ghost" onClick={() => setExecPod(null)}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="space-y-3">
        {execPod && execPod.containers.length > 1 ? (
          <Select size="sm" value={container} onChange={setContainer} options={execPod.containers.map((c) => ({ value: c, label: c }))} />
        ) : null}
        <pre className="panel-mono h-64 overflow-y-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-3 text-[0.75rem] leading-5 text-[var(--panel-code-text)] whitespace-pre-wrap break-words">
          {history.length > 0 ? history.join('\n\n') : t('k8s.execHint')}
        </pre>
        <div className="flex items-center gap-2">
          <TextInput
            mono
            className="flex-1"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && command.trim() && !execMut.isPending) {
                execMut.mutate(command.trim())
              }
            }}
            placeholder={t('k8s.execPlaceholder')}
          />
          <Button
            variant="primary"
            icon={<Play className="h-3.5 w-3.5" strokeWidth={1.75} />}
            disabled={!command.trim()}
            loading={execMut.isPending}
            onClick={() => execMut.mutate(command.trim())}
          >
            {t('k8s.runCommand')}
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
    <Modal
      open={Boolean(scaleDep)}
      onClose={() => setScaleDep(null)}
      title={t('k8s.scale')}
      subtitle={scaleDep ? `${scaleDep.namespace}/${scaleDep.name}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => setScaleDep(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={scaleDepMut.isPending}
            onClick={() => scaleDep && scaleDepMut.mutate({ dep: scaleDep, replicas: Math.max(0, Number(replicas) || 0) })}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('k8s.replicasLabel')}>
        <TextInput mono type="number" min={0} max={100} value={replicas} onChange={(e) => setReplicas(e.target.value)} />
      </Field>
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
    <Modal
      open={Boolean(yamlTarget)}
      onClose={() => setYamlTarget(null)}
      title={t('k8s.viewYaml')}
      subtitle={yamlTarget ? `${yamlTarget.kind}/${yamlTarget.name}` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => setYamlTarget(null)}>
            {t('common.close')}
          </Button>
          {yamlTarget && yamlTarget.kind !== 'node' ? (
            <Button
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
        </>
      }
    >
      {yamlQ.isLoading ? (
        <LoadingState>{t('k8s.loadingCluster')}</LoadingState>
      ) : (
        <Textarea mono rows={18} value={draft} onChange={(e) => setDraft(e.target.value)} />
      )}
    </Modal>
  )
}
