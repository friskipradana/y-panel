import { useState } from 'react'
import { Boxes } from 'lucide-react'
import type { HostingPlan, PlanInput, PlanPeriod } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import { discountsFromValues, discountsValid, PlanDiscountsEditor, valuesFromDiscounts } from './PlanDiscountsEditor'

const EMPTY: PlanInput = {
  slug: '',
  name: '',
  tagline: '',
  priceAmount: 0,
  period: 'monthly',
  features: [],
  maxProjects: 3,
  maxTunnels: 3,
  maxDatabases: 2,
  diskQuotaMb: 2048,
  cpuLimitPct: 100,
  memoryLimitMb: 512,
  maxSubdomains: 1,
  maxCustomDomains: 0,
  trialDays: 0,
  ownNotify: false,
  durationDiscounts: [],
  highlighted: false,
  visible: true,
  sortOrder: 0,
}

const LIMITS: { key: keyof PlanInput; labelKey: string }[] = [
  { key: 'maxProjects', labelKey: 'users.maxProjects' },
  { key: 'maxTunnels', labelKey: 'users.maxTunnels' },
  { key: 'maxDatabases', labelKey: 'users.maxDatabases' },
  { key: 'maxSubdomains', labelKey: 'hosting.plan.subdomains' },
  { key: 'maxCustomDomains', labelKey: 'hosting.plan.customDomains' },
  { key: 'diskQuotaMb', labelKey: 'users.diskMb' },
  { key: 'cpuLimitPct', labelKey: 'users.cpuLimitPct' },
  { key: 'memoryLimitMb', labelKey: 'users.ramMb' },
]

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

interface PlanFormModalProps {
  /** null: closed; a plan: edit; 'new': create */
  target: HostingPlan | 'new' | null
  saving: boolean
  error: string
  onClose: () => void
  onSave: (plan: PlanInput) => void
}

// Create or edit a plan. The form is keyed by its target so every opening starts clean.
export function PlanFormModal({ target, saving, error, onClose, onSave }: PlanFormModalProps) {
  return <PlanForm key={target === null ? 'closed' : target === 'new' ? 'new' : target.id} target={target} saving={saving} error={error} onClose={onClose} onSave={onSave} />
}

function PlanForm({ target, saving, error, onClose, onSave }: PlanFormModalProps) {
  const { t } = useI18n()
  const editing = target !== null && target !== 'new' ? target : null
  const [form, setForm] = useState<PlanInput>(() => (editing ? { ...editing } : EMPTY))
  const [featuresText, setFeaturesText] = useState(() => (editing ? editing.features.join('\n') : ''))
  const [slugTouched, setSlugTouched] = useState(editing !== null)
  const [discountValues, setDiscountValues] = useState(() => valuesFromDiscounts(editing?.durationDiscounts))

  const patch = (next: Partial<PlanInput>) => setForm((current) => ({ ...current, ...next }))
  const valid = form.name.trim() !== '' && form.slug.trim().length >= 2 && discountsValid(form.period, discountValues)

  const submit = () =>
    onSave({ ...form, features: featuresText.split('\n').map((line) => line.trim()).filter(Boolean), durationDiscounts: discountsFromValues(form.period, discountValues) })

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={editing ? t('hosting.plan.editTitle', { name: editing.name }) : t('hosting.plan.newTitle')}
      subtitle={t('hosting.plan.formSubtitle')}
      icon={<Boxes />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} disabled={!valid} onClick={submit}>
            {editing ? t('common.save') : t('hosting.plan.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('hosting.plan.name')}>
            <TextInput
              value={form.name}
              maxLength={60}
              onChange={(e) => patch({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
              placeholder={t('hosting.plan.namePlaceholder')}
            />
          </Field>
          <Field label={t('hosting.plan.slug')} hint={t('hosting.plan.slugHint')}>
            <TextInput
              mono
              value={form.slug}
              maxLength={40}
              onChange={(e) => {
                setSlugTouched(true)
                patch({ slug: e.target.value.toLowerCase() })
              }}
            />
          </Field>
        </div>

        <Field label={t('hosting.plan.tagline')}>
          <TextInput value={form.tagline} maxLength={140} onChange={(e) => patch({ tagline: e.target.value })} placeholder={t('hosting.plan.taglinePlaceholder')} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('hosting.plan.price')} hint={t('hosting.plan.priceHint')}>
            <TextInput mono type="number" min={0} value={form.priceAmount} onChange={(e) => patch({ priceAmount: Number(e.target.value) })} />
          </Field>
          <Field label={t('hosting.plan.period')}>
            <Select
              value={form.period}
              onChange={(value) => patch({ period: value as PlanPeriod })}
              options={[
                { value: 'monthly', label: t('hosting.period.monthlyLong') },
                { value: 'yearly', label: t('hosting.period.yearlyLong') },
                { value: 'once', label: t('hosting.period.onceLong') },
              ]}
            />
          </Field>
        </div>

        {form.period !== 'once' && form.priceAmount > 0 ? <PlanDiscountsEditor period={form.period} values={discountValues} onChange={setDiscountValues} /> : null}

        <Field label={t('hosting.plan.features')} hint={t('hosting.plan.featuresHint')}>
          <Textarea rows={4} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} placeholder={t('hosting.plan.featuresPlaceholder')} />
        </Field>

        <Field label={t('hosting.plan.trialDays')} hint={t('hosting.plan.trialDaysHint')}>
          <TextInput mono type="number" min={0} max={90} value={form.trialDays} onChange={(e) => patch({ trialDays: Number(e.target.value) })} />
        </Field>

        <section aria-label={t('hosting.plan.limits')}>
          <p className="mb-2 text-[12px] font-medium text-[var(--text-secondary)]">{t('hosting.plan.limits')}</p>
          <div className="panel-grid-compact panel-grid-compact--3">
            {LIMITS.map(({ key, labelKey }) => (
              <Field key={key} label={t(labelKey)}>
                <TextInput mono type="number" min={0} value={form[key] as number} onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<PlanInput>)} />
              </Field>
            ))}
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="flex flex-col gap-2.5">
            <Checkbox checked={form.ownNotify} onChange={(ownNotify) => patch({ ownNotify })} label={t('hosting.plan.ownNotify')} description={t('hosting.plan.ownNotifyHint')} />
            <Checkbox checked={form.visible} onChange={(visible) => patch({ visible })} label={t('hosting.plan.visible')} description={t('hosting.plan.visibleHint')} />
            <Checkbox checked={form.highlighted} onChange={(highlighted) => patch({ highlighted })} label={t('hosting.plan.highlighted')} description={t('hosting.plan.highlightedHint')} />
          </div>
          <Field label={t('hosting.plan.order')} hint={t('hosting.plan.orderHint')}>
            <TextInput mono type="number" value={form.sortOrder} onChange={(e) => patch({ sortOrder: Number(e.target.value) })} />
          </Field>
        </div>

        {error ? (
          <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{error}</p>
        ) : null}
      </div>
    </Modal>
  )
}
