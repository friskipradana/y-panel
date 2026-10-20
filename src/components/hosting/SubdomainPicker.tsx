import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import { Field, TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'

const LABEL_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/

export interface SubdomainChoice {
  label: string
  zoneId: string
  /** The name has a valid shape and the agent said it is free */
  available: boolean
  /** The agent could not say (no Cloudflare, no answer): the name has a valid shape but was not checked */
  checkFailed?: boolean
}

interface SubdomainPickerProps {
  domains: { zoneId: string; name: string }[]
  /** Asks the agent whether the name is free under that domain */
  check: (label: string, zoneId: string) => Promise<{ available: boolean; reason: string }>
  onChange: (choice: SubdomainChoice) => void
  /** Only ask while the form is on screen */
  enabled?: boolean
  initialLabel?: string
  /** The domain that was chosen before; used when it is still offered */
  initialZoneId?: string
}

// The name of a panel address under one of the offered domains, checked against the agent while typing
// so "taken" shows before the form is sent. Used by the order form and the buyer's own subdomain dialog.
export function SubdomainPicker({ domains, check, onChange, enabled = true, initialLabel = '', initialZoneId = '' }: SubdomainPickerProps) {
  const { t } = useI18n()
  const [label, setLabel] = useState(initialLabel)
  const [zoneId, setZoneId] = useState(domains.some((d) => d.zoneId === initialZoneId) ? initialZoneId : domains[0]?.zoneId ?? '')
  const [settled, setSettled] = useState(initialLabel)

  // wait for a pause in typing before asking the agent
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(label), 450)
    return () => window.clearTimeout(timer)
  }, [label])

  const shapeOk = LABEL_RE.test(label) && !label.includes('--')
  const query = useQuery({
    queryKey: ['subdomain-check', settled, zoneId],
    queryFn: () => check(settled, zoneId),
    enabled: enabled && zoneId !== '' && settled === label && LABEL_RE.test(settled) && !settled.includes('--'),
    staleTime: 10_000,
    retry: 0,
  })

  const available = shapeOk && settled === label && query.data?.available === true
  useEffect(() => {
    onChange({ label, zoneId, available, checkFailed: shapeOk && settled === label && query.isError })
    // the parent only needs the latest choice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, zoneId, available, query.isError, shapeOk, settled])

  const domain = domains.find((d) => d.zoneId === zoneId)
  const busy = query.isFetching || (shapeOk && settled !== label)
  const hint = !label
    ? t('hosting.sub.labelHint')
    : !shapeOk
      ? t('hosting.sub.labelInvalid')
      : busy
        ? t('hosting.sub.checking')
        : query.isError
          ? t('hosting.sub.checkFailed')
          : query.data?.available
            ? t('hosting.sub.available')
            : localizeServerMessage(query.data?.reason) ?? (query.data?.reason || t('hosting.sub.taken'))

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <Field label={t('hosting.sub.name')}>
          <TextInput
            mono
            value={label}
            maxLength={32}
            autoComplete="off"
            onChange={(e) => setLabel(e.target.value.toLowerCase().trim())}
            placeholder={t('hosting.sub.namePlaceholder')}
            invalid={label !== '' && !shapeOk}
          />
        </Field>
        <span className="hidden pb-2.5 text-[var(--text-secondary)] sm:block" aria-hidden="true">.</span>
        <Field label={t('hosting.sub.domain')}>
          {domains.length === 1 ? (
            // one domain only (the main one on the order page): nothing to choose, so it is shown, not offered
            <p className="panel-mono flex h-10 items-center rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-strong)] px-3 text-[13px]">{domains[0].name}</p>
          ) : (
            <Select value={zoneId} onChange={setZoneId} options={domains.map((d) => ({ value: d.zoneId, label: d.name }))} searchable />
          )}
        </Field>
      </div>

      <p
        role="status"
        className={`flex items-center gap-1.5 text-[12px] ${available ? 'text-[var(--panel-success-text)]' : label && !busy && shapeOk ? 'text-[var(--panel-danger-text)]' : 'text-[var(--text-secondary)]'}`}
      >
        {busy ? <LoaderCircle size={13} className="animate-spin" /> : available ? <CircleCheck size={13} /> : label && shapeOk ? <CircleAlert size={13} /> : null}
        {hint}
      </p>

      {label && domain ? (
        <p className="panel-mono rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[12.5px]">
          https://{label}.{domain.name}
        </p>
      ) : null}
    </div>
  )
}
