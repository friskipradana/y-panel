import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2 } from 'lucide-react'
import { toast } from 'sonner'
import { listProjects } from '@/api/projects'
import { createPublicRoute, type PublicProxyStatus, type PublicRouteKind } from '@/api/publicProxy'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

const HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

// Registering a domain the public proxy answers for: the name, and what it leads to
export function PublicRouteModal({ open, status, onClose }: { open: boolean; status: PublicProxyStatus | undefined; onClose: () => void }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [hostname, setHostname] = useState('')
  const [kind, setKind] = useState<PublicRouteKind>('panel')
  const [projectId, setProjectId] = useState('')
  const [port, setPort] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const projects = useQuery({ queryKey: ['public-route-projects'], queryFn: () => listProjects({ all: true, limit: 200 }), enabled: open && kind === 'project', retry: 0 })

  const name = hostname.trim().toLowerCase()
  const nameValid = HOSTNAME.test(name)
  const portNumber = Number(port)
  const targetValid = kind === 'panel' || (kind === 'project' && projectId !== '') || (kind === 'port' && Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535)
  const ip = status?.addresses.find((a) => a.public)?.ip

  const close = () => {
    setHostname('')
    setKind('panel')
    setProjectId('')
    setPort('')
    setNote('')
    setError('')
    onClose()
  }

  const create = useMutation({
    mutationFn: () =>
      createPublicRoute({ hostname: name, kind, projectId: kind === 'project' ? Number(projectId) : undefined, port: kind === 'port' ? portNumber : undefined, note: note.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['public-proxy', 'routes'] })
      toast.success(t('publicip.route.created'))
      close()
    },
    onError: (e) => setError(apiError(e, t('publicip.route.createFailed'))),
  })

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('publicip.route.add')}
      subtitle={t('publicip.route.addHint')}
      icon={<Globe2 />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!nameValid || !targetValid} loading={create.isPending} onClick={() => create.mutate()}>
            {t('publicip.route.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('publicip.route.hostname')} htmlFor="public-route-host" error={hostname !== '' && !nameValid ? t('publicip.route.hostnameInvalid') : error || undefined}>
          <TextInput id="public-route-host" mono value={hostname} placeholder={t('publicip.route.hostnamePlaceholder')} autoComplete="off" onChange={(e) => { setHostname(e.target.value); setError('') }} />
        </Field>
        <Field label={t('publicip.route.kind')}>
          <Select
            value={kind}
            onChange={(next) => setKind(next as PublicRouteKind)}
            options={[
              { value: 'panel', label: t('publicip.kind.panel'), description: t('publicip.kind.panelHint') },
              { value: 'project', label: t('publicip.kind.project'), description: t('publicip.kind.projectHint') },
              { value: 'port', label: t('publicip.kind.port'), description: t('publicip.kind.portHint') },
            ]}
          />
        </Field>
        {kind === 'panel' ? <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('publicip.route.panelWarning')}</p> : null}
        {kind === 'project' ? (
          <Field label={t('publicip.route.project')}>
            <Select
              value={projectId}
              onChange={setProjectId}
              searchable
              placeholder={t('publicip.route.projectPick')}
              options={(projects.data?.items ?? []).map((p) => ({ value: String(p.id), label: p.name, description: p.assignedPort ? `127.0.0.1:${p.assignedPort}` : p.slug }))}
            />
          </Field>
        ) : null}
        {kind === 'port' ? (
          <Field label={t('publicip.route.port')} hint={t('publicip.route.portHint')} error={port !== '' && !targetValid ? t('publicip.route.portInvalid') : undefined}>
            <TextInput mono type="number" min={1} max={65535} value={port} placeholder="8080" onChange={(e) => setPort(e.target.value)} />
          </Field>
        ) : null}
        <Field label={t('publicip.route.note')}>
          <TextInput value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="panel-muted-block space-y-1 px-3 py-2.5 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--win-text)]">{t('publicip.route.dnsTitle')}</p>
          <p>{t('publicip.route.dns', { host: name || 'blog.example.com', ip: ip ?? t('publicip.route.dnsYourIp') })}</p>
        </div>
      </div>
    </Modal>
  )
}
