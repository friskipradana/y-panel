import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, Globe2, LoaderCircle } from 'lucide-react'
import { checkSubdomain, type HostingDomain } from '@/api/hosting'
import type { Project } from '@/api/projects'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'

interface SubdomainModalProps {
  open: boolean
  domains: HostingDomain[]
  projects: Project[]
  saving: boolean
  error: string
  onClose: () => void
  onCreate: (body: { label: string; zoneId: string; projectId: number }) => void
}

const LABEL_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/

// Pick a name under one of the offered domains and the project it should show. The name is
// checked against the agent while typing, so "taken" shows before the button is pressed.
export function SubdomainModal(props: SubdomainModalProps) {
  // a fresh form for every opening
  return <SubdomainForm key={props.open ? 'open' : 'closed'} {...props} />
}

function SubdomainForm({ open, domains, projects, saving, error, onClose, onCreate }: SubdomainModalProps) {
  const { t } = useI18n()
  const [label, setLabel] = useState('')
  const [zoneId, setZoneId] = useState(domains[0]?.zoneId ?? '')
  const [projectId, setProjectId] = useState('')
  const [settled, setSettled] = useState('')

  // wait for a pause in typing before asking the agent
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(label), 450)
    return () => window.clearTimeout(timer)
  }, [label])

  const shapeOk = LABEL_RE.test(label) && !label.includes('--')
  const check = useQuery({
    queryKey: ['subdomain-check', settled, zoneId],
    queryFn: () => checkSubdomain(settled, zoneId),
    enabled: open && zoneId !== '' && settled === label && LABEL_RE.test(settled) && !settled.includes('--'),
    staleTime: 10_000,
    retry: 0,
  })

  const domain = domains.find((d) => d.zoneId === zoneId)
  const available = shapeOk && settled === label && check.data?.available === true
  const ready = available && projectId !== ''

  const hint = !label
    ? t('hosting.sub.labelHint')
    : !shapeOk
      ? t('hosting.sub.labelInvalid')
      : check.isFetching || settled !== label
        ? t('hosting.sub.checking')
        : check.isError
          ? t('hosting.sub.checkFailed')
          : check.data?.available
            ? t('hosting.sub.available')
            : check.data?.reason || t('hosting.sub.taken')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('hosting.sub.newTitle')}
      subtitle={t('hosting.sub.newSubtitle')}
      icon={<Globe2 />}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!ready} loading={saving} onClick={() => onCreate({ label, zoneId, projectId: Number(projectId) })}>
            {t('hosting.sub.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label={t('hosting.sub.name')}>
            <TextInput mono value={label} maxLength={32} autoComplete="off" onChange={(e) => setLabel(e.target.value.toLowerCase().trim())} placeholder={t('hosting.sub.namePlaceholder')} invalid={label !== '' && !shapeOk} />
          </Field>
          <span className="hidden pb-2.5 text-[var(--text-secondary)] sm:block" aria-hidden="true">.</span>
          <Field label={t('hosting.sub.domain')}>
            <Select
              value={zoneId}
              onChange={setZoneId}
              options={domains.map((d) => ({ value: d.zoneId, label: d.name }))}
              searchable={domains.length > 8}
            />
          </Field>
        </div>

        <p
          role="status"
          className={`flex items-center gap-1.5 text-[12px] ${available ? 'text-[var(--panel-success-text)]' : label && !check.isFetching && settled === label && shapeOk ? 'text-[var(--panel-danger-text)]' : 'text-[var(--text-secondary)]'}`}
        >
          {check.isFetching || (shapeOk && settled !== label) ? <LoaderCircle size={13} className="animate-spin" /> : available ? <CircleCheck size={13} /> : label && shapeOk && !check.isFetching ? <CircleAlert size={13} /> : null}
          {hint}
        </p>

        <Field label={t('hosting.sub.project')} hint={t('hosting.sub.projectHint')}>
          <Select
            value={projectId}
            onChange={setProjectId}
            placeholder={t('hosting.sub.projectPlaceholder')}
            options={projects.map((p) => ({ value: String(p.id), label: p.name, description: `localhost:${p.assignedPort}` }))}
            searchable={projects.length > 8}
          />
        </Field>

        {label && domain ? (
          <p className="panel-mono rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12.5px]">
            https://{label}.{domain.name}
          </p>
        ) : null}

        {error ? <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{error}</p> : null}
      </div>
    </Modal>
  )
}
