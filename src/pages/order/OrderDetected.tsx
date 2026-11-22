import { useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { formatRupiah } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { IconBadge } from '@/components/ui/IconBadge'
import { useI18n } from '@/lib/i18n'

// Seconds the buyer sees "payment detected" before the page moves on to the active account by itself
const HOLD_SECONDS = 15

// The moment the payment is read: what was read, a countdown to the account page, and a button to go on at once
export function OrderDetected({ amount, planName, onContinue }: { amount: number; planName: string; onContinue: () => void }) {
  const { t } = useI18n()
  const [left, setLeft] = useState(HOLD_SECONDS)

  useEffect(() => {
    const timer = window.setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (left === 0) onContinue()
  }, [left, onContinue])

  return (
    <section className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-1 text-center">
        <IconBadge size="lg" tone="success">
          <CircleCheck />
        </IconBadge>
        <p className="text-[0.875rem] font-semibold text-[var(--win-text)]">{t('order.detected.body')}</p>
      </div>

      <dl className="divide-y divide-[var(--win-border)] border-y border-[var(--win-border)] text-[0.8125rem]">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-[var(--text-secondary)]">{t('order.plan')}</dt>
          <dd className="font-medium text-[var(--win-text)]">{planName}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-[var(--text-secondary)]">{t('order.detected.amount')}</dt>
          <dd className="panel-mono font-semibold text-[var(--win-text)]">{formatRupiah(amount)}</dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        <div
          className="panel-progress"
          role="progressbar"
          aria-label={t('order.detected.countdown', { seconds: left })}
          aria-valuemin={0}
          aria-valuemax={HOLD_SECONDS}
          aria-valuenow={left}
        >
          <div className="panel-progress__bar" style={{ width: `${(left / HOLD_SECONDS) * 100}%`, transition: 'width 1s linear' }} />
        </div>
        <p role="status" className="text-center text-[0.75rem] text-[var(--text-secondary)]">
          {t('order.detected.countdown', { seconds: left })}
        </p>
      </div>

      <Button type="button" variant="primary" size="lg" block onClick={onContinue}>
        {t('order.detected.continue')}
      </Button>
    </section>
  )
}
