import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { execK8sPodCommand, getK8sPodLogs, getK8sResourceYAML } from '@/api/k8s'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { LoadingState } from '@/components/ui/states'
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

  useEffect(() => {
    setContainer(logsPod?.containers[0] ?? '')
  }, [logsPod])

  const logsQ = useQuery({
    queryKey: ['k8s-pod-logs', activeClusterId, logsPod?.namespace, logsPod?.name, container, tail],
    queryFn: () => getK8sPodLogs(activeClusterId, logsPod!.namespace, logsPod!.name, container, Number(tail) || 200),
    enabled: Boolean(logsPod && activeClusterId),
  })

  return (
    <Modal open={Boolean(logsPod)} onClose={() => setLogsPod(null)} title={logsPod ? `${t('k8s.logs')}: ${logsPod.namespace}/${logsPod.name}` : t('k8s.logs')} size="lg">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {logsPod && logsPod.containers.length > 1 ? (
            <Select
              value={container}
              onChange={setContainer}
              options={logsPod.containers.map((c) => ({ value: c, label: c }))}
            />
          ) : null}
          <Select
            value={tail}
            onChange={setTail}
            options={[
              { value: '100', label: '100' },
              { value: '200', label: '200' },
              { value: '500', label: '500' },
              { value: '1000', label: '1000' },
            ]}
          />
          <Button size="sm" variant="ghost" loading={logsQ.isFetching} onClick={() => void logsQ.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('common.refresh')}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(logsQ.data || '').then(() => toast.success(t('common.copied')))
            }}
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('common.copy')}</span>
          </Button>
        </div>
        {logsQ.isLoading ? (
          <LoadingState>{t('k8s.loadingLogs')}</LoadingState>
        ) : (
          <pre className="panel-mono max-h-96 overflow-y-auto rounded-md border border-[var(--win-border)] bg-[var(--app-terminal-bg)] p-3 text-[11.5px] leading-5 text-[var(--app-terminal-text)] whitespace-pre-wrap break-words">
            {logsQ.data || t('k8s.noLogs')}
          </pre>
        )}
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
  const { t, deployPreset, setDeployPreset, deployProjectMut } = kw
  const [name, setName] = useState('')
  const [ns, setNs] = useState('default')
  const [image, setImage] = useState('')
  const [port, setPort] = useState('80')
  const [replicas, setReplicas] = useState('1')
  const [serviceType, setServiceType] = useState<'NodePort' | 'ClusterIP'>('NodePort')

  useEffect(() => {
    if (!deployPreset) return
    setName(deployPreset.name ?? '')
    setNs(deployPreset.namespace ?? 'default')
    setImage(deployPreset.image ?? '')
    setPort(String(deployPreset.port && deployPreset.port > 0 ? deployPreset.port : 80))
    setReplicas('1')
    setServiceType('NodePort')
  }, [deployPreset])

  return (
    <Modal open={Boolean(deployPreset)} onClose={() => setDeployPreset(null)} title={t('k8s.deployModalTitle')}>
      <div className="space-y-3">
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
        <Field label={t('k8s.imageLabel')} hint={t('k8s.imageHint')}>
          <TextInput className="panel-input--mono" value={image} onChange={(e) => setImage(e.target.value)} placeholder="ghcr.io/org/app:latest" />
        </Field>
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
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setDeployPreset(null)}>{t('common.cancel')}</Button>
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
        </div>
      </div>
    </Modal>
  )
}
