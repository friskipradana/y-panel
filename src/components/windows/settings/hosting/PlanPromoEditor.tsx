import type { HostingPlan, PlanInput, PromoAppliesTo } from '@/api/hosting'
import { formatRupiah } from '@/api/hosting'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { formatDateTimeID } from '@/lib/datetime'
import { useI18n } from '@/lib/i18n'
import { MAX_DISCOUNT_PERCENT } from './PlanDiscountsEditor'

// What is typed for the promo of a plan: the percent, the end as the date-time box gives it, who it is for, and the exclusive switch
export interface PromoValues {
  percent: string
  endsAt: string
  appliesTo: PromoAppliesTo
  exclusive: boolean
}

// The value of a date-time box (local time, "2026-10-31T23:59") for a date the agent stores
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function promoFromPlan(plan: HostingPlan | null): PromoValues {
  return {
    percent: plan && plan.promoPercent > 0 ? String(plan.promoPercent) : '',
    endsAt: plan?.promoPercent ? toLocalInput(plan.promoEndsAt) : '',
    appliesTo: plan?.promoAppliesTo || 'both',
    exclusive: plan?.promoExclusive ?? false,
  }
}

const percentOf = (values: PromoValues) => (values.percent.trim() === '' ? 0 : Number(values.percent))

// A promo is either empty, or a whole percent from 1 to 90 with an end date
export function promoValid(values: PromoValues): boolean {
  const percent = percentOf(values)
  if (percent === 0) return true
  return Number.isInteger(percent) && percent >= 1 && percent <= MAX_DISCOUNT_PERCENT && !Number.isNaN(new Date(values.endsAt).getTime())
}

export function promoToInput(values: PromoValues): Pick<PlanInput, 'promoPercent' | 'promoEndsAt' | 'promoAppliesTo' | 'promoExclusive'> {
  const percent = percentOf(values)
  if (percent <= 0) return { promoPercent: 0, promoEndsAt: null, promoAppliesTo: 'both', promoExclusive: false }
  return { promoPercent: Math.round(percent), promoEndsAt: new Date(values.endsAt).toISOString(), promoAppliesTo: values.appliesTo, promoExclusive: values.exclusive }
}

// The promo of a plan: a percent off the list price until a date, after which the list price is back without anything to change
export function PlanPromoEditor({ values, priceAmount, onChange }: { values: PromoValues; priceAmount: number; onChange: (next: PromoValues) => void }) {
  const { t } = useI18n()
  const percent = percentOf(values)
  const percentInvalid = values.percent.trim() !== '' && (!Number.isInteger(percent) || percent < 0 || percent > MAX_DISCOUNT_PERCENT)
  const endsMissing = percent > 0 && !percentInvalid && Number.isNaN(new Date(values.endsAt).getTime())
  const ready = percent > 0 && !percentInvalid && !endsMissing
  const patch = (next: Partial<PromoValues>) => onChange({ ...values, ...next })

  return (
    <section aria-label={t('hosting.plan.promo')}>
      <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('hosting.plan.promo')}</p>
      <p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{t('hosting.plan.promoHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('hosting.plan.promoPercent')} error={percentInvalid ? t('hosting.plan.discountInvalid', { max: MAX_DISCOUNT_PERCENT }) : undefined}>
          <TextInput mono type="number" min={0} max={MAX_DISCOUNT_PERCENT} value={values.percent} placeholder="0" invalid={percentInvalid} onChange={(e) => patch({ percent: e.target.value })} />
        </Field>
        <Field label={t('hosting.plan.promoEnds')} hint={t('hosting.plan.promoEndsHint')} error={endsMissing ? t('hosting.plan.promoEndsRequired') : undefined}>
          <TextInput type="datetime-local" value={values.endsAt} invalid={endsMissing} onChange={(e) => patch({ endsAt: e.target.value })} />
        </Field>
      </div>
      {percent > 0 ? (
        <div className="mt-3 space-y-3">
          <Field label={t('hosting.plan.promoAppliesTo')}>
            <Select
              value={values.appliesTo}
              onChange={(value) => patch({ appliesTo: value as PromoAppliesTo })}
              options={[
                { value: 'both', label: t('hosting.plan.promoApplies.both') },
                { value: 'new', label: t('hosting.plan.promoApplies.new') },
                { value: 'renew', label: t('hosting.plan.promoApplies.renew') },
              ]}
            />
          </Field>
          <Checkbox checked={values.exclusive} onChange={(exclusive) => patch({ exclusive })} label={t('hosting.plan.promoExclusive')} description={t('hosting.plan.promoExclusiveHint')} />
          {ready ? (
            <p className="panel-mono text-[11.5px] text-[var(--panel-success-text)]">
              {t('hosting.plan.promoPreview', {
                price: formatRupiah(priceAmount - Math.floor((priceAmount * percent) / 100)),
                list: formatRupiah(priceAmount),
                date: formatDateTimeID(new Date(values.endsAt)),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
