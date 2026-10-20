import { useEffect, useState, type ReactNode } from 'react'
import { Copy, LoaderCircle, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { formatRupiah, type OrderView } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useI18n } from '@/lib/i18n'

interface OrderCheckingProps {
  order: OrderView
  /** When the order was last read from the agent (ms), so the page can say how fresh it is */
  checkedAt: number
  refreshing: boolean
  /** Asks the agent now instead of at the next turn of the 5 second timer */
  onRefresh: () => void
  /** Back to the way to pay */
  onBack: () => void
  /** Since when the buyer has been waiting here (ms) */
  since: number
  /** The way to ask the seller for help, next to going back */
  help?: ReactNode
}

// After "I have transferred": the page that waits for the payment to be read. It asks the agent every few seconds by itself;
// the buyer can also ask now, go back to the way to pay, or ask the seller for help.
export function OrderChecking({ order, checkedAt, refreshing, onRefresh, onBack, since, help }: OrderCheckingProps) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const ago = Math.max(0, Math.floor((now - checkedAt) / 1000))
  const waitedMinutes = Math.floor(Math.max(0, now - since) / 60000)
  const total = formatRupiah(order.amountTotal)

  return (
    <section className="space-y-3">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <LoaderCircle className="h-7 w-7 animate-spin text-[var(--panel-primary-text)]" aria-hidden="true" />
        <p className="text-[0.9375rem] font-semibold text-[var(--win-text)]">{t('order.checking.title')}</p>
        <p className="max-w-sm text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t('order.checking.body')}</p>
      </div>

      <dl className="divide-y divide-[var(--win-border)] border-y border-[var(--win-border)] text-[0.8125rem]">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <dt className="text-[0.75rem] text-[var(--text-secondary)]">{t('order.payExactly')}</dt>
            <dd className="panel-mono truncate text-[1.125rem] font-semibold text-[var(--win-text)]">{total}</dd>
          </div>
          <IconButton label={`${t('order.copy')}: ${t('order.payExactly')}`} onClick={() => void copyTextToClipboard(total).then(() => toast.success(t('order.copied', { label: t('order.payExactly') })))}>
            <Copy className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex items-center justify-between gap-3 py-2.5">
          <dt className="text-[var(--text-secondary)]">{t('order.payBefore')}</dt>
          <dd>
            <DateTimeText value={order.expiresAt} className="panel-mono text-[0.75rem] text-[var(--text-secondary)]" />
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3">
        <p role="status" className="min-w-0 text-[0.75rem] leading-snug text-[var(--text-secondary)]">
          {ago < 5 ? t('order.checking.justNow') : t('order.checking.lastChecked', { seconds: ago })}
          {waitedMinutes >= 5 ? ` ${t('order.checking.slow')}` : ''}
        </p>
        <Button type="button" variant="outline" size="sm" loading={refreshing} icon={<RefreshCcw className="h-3.5 w-3.5" />} onClick={onRefresh} className="shrink-0">
          {t('order.checking.refresh')}
        </Button>
      </div>

      <div className="grid auto-cols-fr grid-flow-col gap-2">
        <Button type="button" variant="ghost" block onClick={onBack}>
          {t('order.checking.back')}
        </Button>
        {help}
      </div>
    </section>
  )
}
