import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listProjects } from '@/api/agent'
import { deployProjectSourceToK8sStream } from '@/api/k8s'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import type { KubernetesWindowState } from './useKubernetesWindow'

export function K8sDeployModal({ kw }: { kw: KubernetesWindowState }) {
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

  const closeModal = () => {
    abortRef.current?.abort()
    setDeployPreset(null)
  }

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
      onClose={closeModal}
      title={t('k8s.deployModalTitle')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={closeModal}>
            {t('common.cancel')}
          </Button>
          {mode === 'source' ? (
            <Button
              variant="primary"
              disabled={!projectId || (!isLocalK3s && !registryImage.trim())}
              loading={building}
              onClick={() => void startSourceDeploy()}
            >
              {t('k8s.buildAndDeploy')}
            </Button>
          ) : (
            <Button
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
        </>
      }
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
          <TextInput mono value={name} onChange={(e) => setName(e.target.value)} placeholder={t('k8s.workloadNamePlaceholder')} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('k8s.namespaceLabel')}>
            <TextInput mono value={ns} onChange={(e) => setNs(e.target.value)} placeholder={t('k8s.defaultNsPlaceholder')} />
          </Field>
          <Field label={t('k8s.replicasLabel')}>
            <TextInput mono type="number" min={1} max={50} value={replicas} onChange={(e) => setReplicas(e.target.value)} />
          </Field>
        </div>

        {mode === 'image' ? (
          <Field label={t('k8s.imageLabel')} hint={t('k8s.imageHint')}>
            <TextInput mono value={image} onChange={(e) => setImage(e.target.value)} placeholder={t('k8s.imagePlaceholder')} />
          </Field>
        ) : (
          <Field
            label={t('k8s.registryImageLabel')}
            hint={isLocalK3s ? t('k8s.registryImageLocalHint') : t('k8s.registryImageExternalHint')}
          >
            <TextInput
              mono
              value={registryImage}
              onChange={(e) => setRegistryImage(e.target.value)}
              placeholder={isLocalK3s ? '' : t('k8s.imagePlaceholder')}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('k8s.containerPortLabel')}>
            <TextInput mono type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
          </Field>
          <Field label={t('k8s.serviceTypeLabel')}>
            <Select
              value={serviceType}
              onChange={(v) => setServiceType(v as 'NodePort' | 'ClusterIP')}
              options={[
                { value: 'NodePort', label: t('k8s.svcTypeNodePort') },
                { value: 'ClusterIP', label: t('k8s.svcTypeClusterIP') },
              ]}
            />
          </Field>
        </div>

        {buildLogs.length > 0 ? (
          <pre className="panel-mono max-h-48 overflow-y-auto rounded-lg border border-[var(--win-border)] bg-[var(--panel-code-bg)] p-3 text-[0.75rem] leading-5 text-[var(--panel-code-text)] whitespace-pre-wrap break-words">
            {buildLogs.join('\n')}
          </pre>
        ) : null}
      </div>
    </Modal>
  )
}
