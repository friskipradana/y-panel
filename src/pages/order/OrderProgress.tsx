import { Check } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const STEPS = ['created', 'transfer', 'detected', 'active'] as const

// Where an order is: made, waiting for the transfer, the transfer noticed (waiting for the seller), account active
export function OrderProgress({ status }: { status: 'pending' | 'review' | 'paid' }) {
  const { t } = useI18n()
  const at = status === 'paid' ? 4 : status === 'review' ? 2 : 1
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label={t('order.progress.label')}>
      {STEPS.map((step, index) => {
        const done = index < at
        const current = index === at
        return (
          <li key={step} aria-current={current ? 'step' : undefined} className="flex flex-col items-center gap-1 text-center">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[0.6875rem] font-semibold ${
                done
                  ? 'border-[var(--panel-success-text)] bg-[var(--panel-success-bg)] text-[var(--panel-success-text)]'
                  : current
                    ? 'border-[var(--panel-primary-solid)] bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)]'
                    : 'border-[var(--win-border)] text-[var(--text-secondary)]'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span className={`text-[0.6875rem] leading-tight ${current ? 'font-semibold text-[var(--win-text)]' : 'text-[var(--text-secondary)]'}`}>{t(`order.progress.${step}`)}</span>
          </li>
        )
      })}
    </ol>
  )
}
