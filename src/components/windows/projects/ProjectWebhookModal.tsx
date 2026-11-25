import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { Project } from '@/api/agent'
import { getProjectWebhook, saveProjectWebhook, triggerProjectWebhook } from '@/api/webhooks'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Select } from '@/components/ui/Select'
import { LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'

export function ProjectWebhookModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const open = Boolean(project)

  const q = useQuery({
    queryKey: ['project-webhook', project?.id],
    queryFn: () => getProjectWebhook(project!.id),
    enabled: open,
    refetchInterval: open ? 8_000 : false,
  })

  const [enabled, setEnabled] = useState(true)
  const [branch, setBranch] = useState('main')
  const [secret, setSecret] = useState('')
  const [deployMode, setDeployMode] = useState<'project' | 'k8s'>('project')
  const [k8sClusterId, setK8sClusterId] = useState('local-k3s')
  const [k8sNamespace, setK8sNamespace] = useState('default')
  const [notifyEnabled, setNotifyEnabled] = useState(true)

  useEffect(() => {
    const wh = q.data?.webhook
    if (!wh) return
    setEnabled(wh.enabled)
    setBranch(wh.branch || 'main')
    setDeployMode(wh.deployMode === 'k8s' ? 'k8s' : 'project')
    setK8sClusterId(wh.k8sClusterId || 'local-k3s')
    setK8sNamespace(wh.k8sNamespace || 'default')
    setNotifyEnabled(wh.notifyEnabled)
    setSecret('')
  }, [q.data?.webhook])

  const saveMut = useMutation({
    mutationFn: (rotateToken: boolean) =>
      saveProjectWebhook(project!.id, {
        enabled,
        secret: secret.trim() || undefined,
        rotateToken,
        branch: branch.trim() || 'main',
        deployMode,
        k8sClusterId: deployMode === 'k8s' ? k8sClusterId.trim() : undefined,
        k8sNamespace: deployMode === 'k8s' ? k8sNamespace.trim() || 'default' : undefined,
        notifyEnabled,
      }),
    onSuccess: () => {
      toast.success(t('webhook.saved'))
      setSecret('')
      void qc.invalidateQueries({ queryKey: ['project-webhook', project?.id] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const triggerMut = useMutation({
    mutationFn: () => triggerProjectWebhook(project!.id),
    onSuccess: (res) => {
      toast.success(res.message || t('webhook.triggered'))
      void qc.invalidateQueries({ queryKey: ['project-webhook', project?.id] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const wh = q.data?.webhook
  const logs = q.data?.logs ?? []
  const webhookUrl = wh?.token ? `${window.location.origin}/api/v1/webhooks/git/${wh.token}` : ''

  return (
    <Modal open={open} onClose={onClose} title={project ? `${t('webhook.title')}: ${project.name}` : t('webhook.title')} size="lg">
      {q.isLoading ? (
        <LoadingState>{t('webhook.loading')}</LoadingState>
      ) : (
        <div className="space-y-3.5">
          {webhookUrl ? (
            <Field label={t('webhook.urlLabel')} hint={t('webhook.urlHint')}>
              <div className="flex items-center gap-1.5">
                <TextInput className="panel-input--mono flex-1" value={webhookUrl} readOnly />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void navigator.clipboard.writeText(webhookUrl).then(() => toast.success(t('common.copied')))}
                >
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>{t('common.copy')}</span>
                </Button>
                <Button size="sm" variant="ghost" loading={saveMut.isPending} onClick={() => saveMut.mutate(true)}>
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                </Button>
              </div>
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('webhook.branchLabel')}>
              <TextInput className="panel-input--mono" value={branch} onChange={(e) => setBranch(e.target.value)} />
            </Field>
            <Field label={t('webhook.secretLabel')} hint={wh?.hasSecret ? t('webhook.secretKeepHint') : t('webhook.secretHint')}>
              <PasswordInput value={secret} onChange={(e) => setSecret(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('webhook.deployModeLabel')}>
              <Select
                value={deployMode}
                onChange={(v) => setDeployMode(v as 'project' | 'k8s')}
                options={[
                  { value: 'project', label: t('webhook.modeProject') },
                  { value: 'k8s', label: t('webhook.modeK8s') },
                ]}
              />
            </Field>
            {deployMode === 'k8s' ? (
              <Field label={t('k8s.namespaceLabel')}>
                <TextInput className="panel-input--mono" value={k8sNamespace} onChange={(e) => setK8sNamespace(e.target.value)} />
              </Field>
            ) : (
              <div />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Checkbox checked={enabled} onChange={setEnabled} label={t('webhook.enabledLabel')} />
            <Checkbox checked={notifyEnabled} onChange={setNotifyEnabled} label={t('webhook.notifyLabel')} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--win-border)]">
            <Button size="sm" variant="primary-soft" loading={triggerMut.isPending} onClick={() => triggerMut.mutate()}>
              <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>{t('webhook.triggerNow')}</span>
            </Button>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onClose}>
                {t('common.close')}
              </Button>
              <Button size="sm" variant="primary" loading={saveMut.isPending} onClick={() => saveMut.mutate(false)}>
                {t('common.save')}
              </Button>
            </div>
          </div>

          {logs.length > 0 ? (
            <div className="space-y-1.5 pt-2 border-t border-[var(--win-border)]">
              <p className="panel-section-label">{t('webhook.historyTitle')}</p>
              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {logs.map((item) => (
                  <details key={item.id} className="rounded border border-[var(--win-border)] bg-[var(--panel-surface-subtle)] px-2.5 py-1.5">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 text-[12px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge tone={item.status === 'success' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}>
                          {item.status}
                        </Badge>
                        <span className="panel-mono text-[11.5px] text-[var(--win-text)]">
                          {item.trigger} · {item.branch || '-'} {item.commitSha ? `(${item.commitSha})` : ''}
                        </span>
                      </div>
                      <span className="panel-mono text-[11px] text-[var(--text-secondary)] shrink-0">
                        {new Date(item.startedAt).toLocaleString()}
                      </span>
                    </summary>
                    <pre className="panel-mono mt-1.5 max-h-36 overflow-y-auto rounded bg-[var(--app-terminal-bg)] p-2 text-[11px] text-[var(--app-terminal-text)] whitespace-pre-wrap break-words">
                      {item.output || '-'}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
