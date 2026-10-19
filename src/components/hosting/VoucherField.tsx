import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import type { QuoteAnswer } from '@/api/hosting'
import { formatRupiah } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { useI18n } from '@/lib/i18n'

interface VoucherFieldProps {
  /** What is typed in the box */
  value: string
  onChange: (value: string) => void
  /** The code being used now (empty: none); what the agent says of it comes in `answer` */
  applied: string
  onApply: () => void
  onRemove: () => void
  answer?: QuoteAnswer['voucher']
  /** What the voucher takes off, for the sentence that says it works */
  discount: number
  checking: boolean
  failed: boolean
  id: string
}

// The box for a voucher code: the answer of the agent shows right under it, whether the code works or why not
export function VoucherField({ value, onChange, applied, onApply, onRemove, answer, discount, checking, failed, id }: VoucherFieldProps) {
  const { t } = useI18n()
  const typed = value.trim() !== ''
  const sameAsApplied = applied !== '' && value.trim().toUpperCase() === applied

  let status: { tone: 'ok' | 'bad' | 'busy'; text: string } | null = null
  if (applied) {
    if (checking) status = { tone: 'busy', text: t('order.voucher.checking') }
    else if (failed) status = { tone: 'bad', text: t('order.voucher.checkFailed') }
    else if (answer?.valid) status = { tone: 'ok', text: t('order.voucher.valid', { code: answer.code, amount: formatRupiah(discount) }) }
    else if (answer) status = { tone: 'bad', text: t(`order.voucher.reason.${answer.reason ?? 'unknown'}`) }
  }

  return (
    <Field label={t('order.voucher.label')} htmlFor={id}>
      <div className="flex gap-2">
        <TextInput
          id={id}
          mono
          maxLength={32}
          autoComplete="off"
          placeholder={t('order.voucher.placeholder')}
          value={value}
          invalid={status?.tone === 'bad'}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s/g, ''))}
          onKeyDown={(e) => {
            // Enter applies the code; it must not send the whole form
            if (e.key === 'Enter') {
              e.preventDefault()
              if (typed && !sameAsApplied) onApply()
            }
          }}
        />
        <Button type="button" variant="outline" disabled={!typed || sameAsApplied} onClick={onApply}>
          {t('order.voucher.apply')}
        </Button>
        {applied ? (
          <Button type="button" variant="ghost" onClick={onRemove}>
            {t('order.voucher.remove')}
          </Button>
        ) : null}
      </div>
      {status ? (
        <p
          role={status.tone === 'bad' ? 'alert' : 'status'}
          className={`mt-1 flex items-center gap-1.5 text-[11.5px] ${
            status.tone === 'ok' ? 'text-[var(--panel-success-text)]' : status.tone === 'bad' ? 'text-[var(--panel-danger-text)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          {status.tone === 'busy' ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : status.tone === 'ok' ? <CircleCheck size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}
          {status.text}
        </p>
      ) : null}
    </Field>
  )
}
