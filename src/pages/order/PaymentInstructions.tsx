import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { formatRupiah, type OrderView } from '@/api/hosting'
import { IconButton } from '@/components/ui/IconButton'
import { useI18n } from '@/lib/i18n'

// Time left as h:mm:ss, ticking each second while the order waits
function useCountdown(until: string, active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(left / 3600)}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n()
  const copy = () => void copyTextToClipboard(value).then(() => toast.success(t('order.copied', { label })))
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[0.75rem] text-[var(--text-secondary)]">{label}</p>
        <p className="panel-mono truncate text-[0.9375rem] font-semibold text-[var(--win-text)]">{value}</p>
      </div>
      <IconButton label={`${t('order.copy')}: ${label}`} onClick={copy}>
        <Copy className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

// What to pay and where, for an order that waits for its transfer. Used by the order page and the profile.
export function PaymentInstructions({ order }: { order: OrderView }) {
  const { t } = useI18n()
  const payment = order.payment
  const countdown = useCountdown(order.expiresAt, !!payment)
  if (!payment) return null

  return (
    <div className="space-y-3">
      <section className="divide-y divide-[var(--win-border)] rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-1">
        <CopyRow label={t('order.payExactly')} value={formatRupiah(order.amountTotal)} />
        {payment.bank ? <CopyRow label={t('order.bank')} value={payment.bank} /> : null}
        <CopyRow label={t('order.account')} value={payment.account} />
        <CopyRow label={t('order.holder')} value={payment.holder} />
        <div className="flex items-center justify-between py-2.5 text-[0.8125rem]">
          <span className="text-[var(--text-secondary)]">{t('order.timeLeft')}</span>
          <span className="panel-mono font-semibold">{countdown}</span>
        </div>
      </section>
      <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('order.exactNote', { amount: formatRupiah(order.amountTotal) })}</p>
    </div>
  )
}
