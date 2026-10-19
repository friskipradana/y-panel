import { useEffect, useState } from 'react'
import { Copy, LoaderCircle, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { formatRupiah, type OrderView } from '@/api/hosting'
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
}

// After "I have transferred": the page that waits for the payment to be read. It asks the agent every few seconds by itself;
// the buyer can also ask now, go back to the way to pay, or ask the seller for help.
export function OrderChecking({ order, checkedAt, refreshing, onRefresh, onBack, since }: OrderCheckingProps) {
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
    <section className="space-y-3 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4">
      <div className="flex items-start gap-3">
        <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[var(--panel-primary-text)]" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold text-[var(--win-text)]">{t('order.checking.title')}</p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t('order.checking.body')}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--win-border)] px-3 py-2">
        <div>
          <p className="text-[0.75rem] text-[var(--text-secondary)]">{t('order.payExactly')}</p>
          <p className="panel-mono text-[1rem] font-semibold text-[var(--win-text)]">{total}</p>
        </div>
        <IconButton label={`${t('order.copy')}: ${t('order.payExactly')}`} onClick={() => void copyTextToClipboard(total).then(() => toast.success(t('order.copied', { label: t('order.payExactly') })))}>
          <Copy className="h-4 w-4" />
        </IconButton>
      </div>

      <p role="status" className="text-[0.75rem] text-[var(--text-secondary)]">
        {ago < 5 ? t('order.checking.justNow') : t('order.checking.lastChecked', { seconds: ago })}
        {waitedMinutes >= 5 ? ` ${t('order.checking.slow')}` : ''}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" loading={refreshing} icon={<RefreshCcw className="h-4 w-4" />} onClick={onRefresh}>
          {t('order.checking.refresh')}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          {t('order.checking.back')}
        </Button>
      </div>
    </section>
  )
}
