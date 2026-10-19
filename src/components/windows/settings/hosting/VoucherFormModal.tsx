import { useState } from 'react'
import { Dices, Ticket } from 'lucide-react'
import type { HostingPlan, HostingVoucher, VoucherAppliesTo, VoucherInput, VoucherKind } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/

// A code a buyer can type without mistakes: no 0/O or 1/I
const randomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

// <input type="datetime-local"> holds local time without a zone; the agent keeps instants
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null)

interface VoucherFormModalProps {
  /** null: closed; a voucher: edit; 'new': create */
  target: HostingVoucher | 'new' | null
  plans: HostingPlan[]
  saving: boolean
  error: string
  onClose: () => void
  onSave: (voucher: VoucherInput) => void
}

// Create or edit a voucher. Keyed by its target so every opening starts clean.
export function VoucherFormModal(props: VoucherFormModalProps) {
  const { target } = props
  return <VoucherForm key={target === null ? 'closed' : target === 'new' ? 'new' : target.id} {...props} />
}

function VoucherForm({ target, plans, saving, error, onClose, onSave }: VoucherFormModalProps) {
  const { t } = useI18n()
  const editing = target !== null && target !== 'new' ? target : null
  const [code, setCode] = useState(editing?.code ?? '')
  const [kind, setKind] = useState<VoucherKind>(editing?.kind ?? 'percent')
  const [value, setValue] = useState(String(editing?.value ?? 10))
  const [maxUses, setMaxUses] = useState(String(editing?.maxUses ?? 0))
  const [maxPerAccount, setMaxPerAccount] = useState(String(editing?.maxPerAccount ?? 1))
  const [appliesTo, setAppliesTo] = useState<VoucherAppliesTo>(editing?.appliesTo ?? 'both')
  const [planIds, setPlanIds] = useState<number[]>(editing?.planIds ?? [])
  const [validFrom, setValidFrom] = useState(toLocalInput(editing?.validFrom ?? null))
  const [validUntil, setValidUntil] = useState(toLocalInput(editing?.validUntil ?? null))
  const [note, setNote] = useState(editing?.note ?? '')
  const [enabled, setEnabled] = useState(editing?.enabled ?? true)

  const valueNumber = Number(value)
  const valueInvalid = !Number.isInteger(valueNumber) || valueNumber < 1 || (kind === 'percent' && valueNumber > 100)
  const codeInvalid = code !== '' && !CODE_RE.test(code)
  const countInvalid = (raw: string) => !Number.isInteger(Number(raw)) || Number(raw) < 0
  const endsBeforeStart = validFrom !== '' && validUntil !== '' && new Date(validUntil) <= new Date(validFrom)
  const valid = CODE_RE.test(code) && !valueInvalid && !countInvalid(maxUses) && !countInvalid(maxPerAccount) && !endsBeforeStart

  const submit = () =>
    onSave({
      code,
      kind,
      value: valueNumber,
      maxUses: Number(maxUses),
      maxPerAccount: Number(maxPerAccount),
      appliesTo,
      planIds,
      validFrom: fromLocalInput(validFrom),
      validUntil: fromLocalInput(validUntil),
      enabled,
      note: note.trim(),
    })

  const togglePlan = (id: number, on: boolean) => setPlanIds((current) => (on ? [...current, id] : current.filter((planId) => planId !== id)))

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={editing ? t('hosting.voucher.editTitle', { code: editing.code }) : t('hosting.voucher.newTitle')}
      subtitle={t('hosting.voucher.formSubtitle')}
      icon={<Ticket />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} disabled={!valid} onClick={submit}>
            {editing ? t('common.save') : t('hosting.voucher.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('hosting.voucher.code')} htmlFor="voucher-code" hint={t('hosting.voucher.codeHint')} error={codeInvalid ? t('hosting.voucher.codeInvalid') : undefined}>
          <div className="flex gap-2">
            <TextInput id="voucher-code" mono maxLength={32} autoComplete="off" value={code} invalid={codeInvalid} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))} />
            <Button type="button" variant="outline" icon={<Dices className="h-3.5 w-3.5" />} onClick={() => setCode(randomCode())}>
              {t('hosting.voucher.random')}
            </Button>
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('hosting.voucher.kind')}>
            <Select
              value={kind}
              onChange={(next) => setKind(next as VoucherKind)}
              options={[
                { value: 'percent', label: t('hosting.voucher.kindPercent') },
                { value: 'fixed', label: t('hosting.voucher.kindFixed') },
              ]}
            />
          </Field>
          <Field
            label={kind === 'percent' ? t('hosting.voucher.valuePercent') : t('hosting.voucher.valueFixed')}
            htmlFor="voucher-value"
            error={valueInvalid ? t(kind === 'percent' ? 'hosting.voucher.valuePercentInvalid' : 'hosting.voucher.valueFixedInvalid') : undefined}
          >
            <TextInput id="voucher-value" mono type="number" min={1} max={kind === 'percent' ? 100 : undefined} value={value} invalid={valueInvalid} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('hosting.voucher.maxUses')} htmlFor="voucher-max-uses" hint={t('hosting.voucher.maxUsesHint')} error={countInvalid(maxUses) ? t('hosting.voucher.countInvalid') : undefined}>
            <TextInput id="voucher-max-uses" mono type="number" min={0} value={maxUses} invalid={countInvalid(maxUses)} onChange={(e) => setMaxUses(e.target.value)} />
          </Field>
          <Field label={t('hosting.voucher.maxPerAccount')} htmlFor="voucher-per-account" hint={t('hosting.voucher.maxPerAccountHint')} error={countInvalid(maxPerAccount) ? t('hosting.voucher.countInvalid') : undefined}>
            <TextInput id="voucher-per-account" mono type="number" min={0} value={maxPerAccount} invalid={countInvalid(maxPerAccount)} onChange={(e) => setMaxPerAccount(e.target.value)} />
          </Field>
        </div>

        <Field label={t('hosting.voucher.appliesTo')}>
          <Select
            value={appliesTo}
            onChange={(next) => setAppliesTo(next as VoucherAppliesTo)}
            options={[
              { value: 'both', label: t('hosting.voucher.appliesBoth') },
              { value: 'new', label: t('hosting.voucher.appliesNew') },
              { value: 'renew', label: t('hosting.voucher.appliesRenew') },
            ]}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('hosting.voucher.validFrom')} htmlFor="voucher-from" hint={t('hosting.voucher.validHint')}>
            <TextInput id="voucher-from" type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </Field>
          <Field label={t('hosting.voucher.validUntil')} htmlFor="voucher-until" error={endsBeforeStart ? t('hosting.voucher.endsBeforeStart') : undefined}>
            <TextInput id="voucher-until" type="datetime-local" value={validUntil} invalid={endsBeforeStart} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
        </div>

        <section aria-label={t('hosting.voucher.plans')}>
          <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('hosting.voucher.plans')}</p>
          <p className="mb-2 mt-0.5 text-[11px] text-[var(--text-secondary)]">{planIds.length === 0 ? t('hosting.voucher.plansAll') : t('hosting.voucher.plansSome', { count: planIds.length })}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {plans.map((plan) => (
              <Checkbox key={plan.id} checked={planIds.includes(plan.id)} onChange={(on) => togglePlan(plan.id, on)} label={plan.name} />
            ))}
          </div>
        </section>

        <Field label={t('hosting.voucher.note')} htmlFor="voucher-note" hint={t('hosting.voucher.noteHint')}>
          <TextInput id="voucher-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <Checkbox checked={enabled} onChange={setEnabled} label={t('hosting.voucher.enabled')} description={t('hosting.voucher.enabledHint')} />

        {error ? <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{error}</p> : null}
      </div>
    </Modal>
  )
}
