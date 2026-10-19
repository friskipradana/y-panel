import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { formatRupiah, type OrderView } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { PriceLines } from '@/components/hosting/PriceLines'
import { Badge } from '@/components/ui/Badge'
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

function copyToast(t: (key: string, params?: Record<string, string>) => string, label: string, value: string) {
  void copyTextToClipboard(value).then(() => toast.success(t('order.copied', { label })))
}

// The amount to transfer, big, with its copy button
function AmountRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[0.75rem] text-[var(--text-secondary)]">{label}</p>
        <p className="panel-mono truncate text-[1.125rem] font-semibold text-[var(--win-text)]">{value}</p>
      </div>
      <IconButton label={`${t('order.copy')}: ${label}`} onClick={() => copyToast(t, label, value)}>
        <Copy className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

// One fact of a bank or e-wallet on one line, with a small copy button
function FactRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-x-2 text-[0.8125rem]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="panel-mono min-w-0 break-all font-medium text-[var(--win-text)]">{value}</span>
      <IconButton label={`${t('order.copy')}: ${label}`} onClick={() => copyToast(t, label, value)} className="!h-7 !w-7">
        <Copy className="h-3.5 w-3.5" />
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
  const code = order.amountTotal - order.amountBase
  const several = payment.methods.length > 1

  return (
    <div className="space-y-3">
      <section className="divide-y divide-[var(--win-border)] rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-4 py-1">
        <AmountRow label={t('order.payExactly')} value={formatRupiah(order.amountTotal)} />
        {code > 0 ? (
          <div className="py-2.5">
            <PriceLines
              list={order.amountList || order.amountBase}
              durationDiscount={order.discountDuration}
              voucherCode={order.voucherCode}
              voucherDiscount={order.discountVoucher}
              subtotal={order.amountBase}
              uniqueCode={code}
            />
          </div>
        ) : null}
        <div className="space-y-1 py-2.5 text-[0.8125rem]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">{t('order.timeLeft')}</span>
            <span className="panel-mono font-semibold">{countdown}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)]">{t('order.expiresAt')}</span>
            <DateTimeText value={order.expiresAt} className="panel-mono text-[0.75rem] text-[var(--text-secondary)]" />
          </div>
        </div>
      </section>

      <div>
        <p className="mb-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t(several ? 'order.payToAny' : 'order.payTo')}</p>
        <section className="divide-y divide-[var(--win-border)] rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-4">
          {payment.methods.map((method) => (
            <div key={method.id} className="space-y-1 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.9375rem] font-semibold text-[var(--win-text)]">{method.name}</span>
                <Badge tone="neutral" size="sm">
                  {t(method.kind === 'ewallet' ? 'order.kindEwallet' : 'order.kindBank')}
                </Badge>
              </div>
              <FactRow label={t(method.kind === 'ewallet' ? 'order.phoneNumber' : 'order.account')} value={method.account} />
              <FactRow label={t('order.holder')} value={method.holder} />
            </div>
          ))}
        </section>
      </div>
      <p className="px-1 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('order.exactNote', { amount: formatRupiah(order.amountTotal) })}</p>
    </div>
  )
}
