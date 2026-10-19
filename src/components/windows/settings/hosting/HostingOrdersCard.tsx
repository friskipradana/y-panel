import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ReceiptText, X } from 'lucide-react'
import { toast } from 'sonner'
import { cancelHostingOrder, confirmHostingOrder, formatRupiah, listHostingOrders, type AdminOrder, type OrderStatus } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { EntityRow } from '@/components/ui/EntityRow'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const TONE: Record<OrderStatus, 'warning' | 'info' | 'success' | 'neutral'> = { pending: 'warning', review: 'info', paid: 'success', expired: 'neutral', cancelled: 'neutral' }
const FILTERS: ('' | OrderStatus)[] = ['', 'review', 'pending', 'paid', 'expired', 'cancelled']

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Orders of buyers: the ones to look at first (waiting for approval or payment), confirm by hand, or cancel
export function HostingOrdersCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'' | OrderStatus>('')
  const list = useQuery({ queryKey: ['hosting', 'orders', filter], queryFn: () => listHostingOrders(filter), retry: 0, refetchInterval: 15_000 })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['hosting', 'orders'] })

  const confirm = useMutation({
    mutationFn: (id: number) => confirmHostingOrder(id),
    onSuccess: () => {
      toast.success(t('hosting.orders.confirmed'))
      refresh()
      void qc.invalidateQueries({ queryKey: ['hosting', 'plans'] })
    },
    onError: (error) => toast.error(apiError(error, t('hosting.orders.failed'))),
  })
  const cancel = useMutation({
    mutationFn: (id: number) => cancelHostingOrder(id),
    onSuccess: () => {
      toast.success(t('hosting.orders.cancelled'))
      refresh()
    },
    onError: (error) => toast.error(apiError(error, t('hosting.orders.failed'))),
  })
  const busy = confirm.isPending || cancel.isPending

  const askConfirm = async (order: AdminOrder) => {
    const ok = await alertLib.confirm(
      t('hosting.orders.confirmTitle'),
      t('hosting.orders.confirmMessage', { username: order.username, plan: order.planName }),
      t('hosting.orders.confirmAction'),
      t('common.cancel'),
      'warning',
      'settings',
    )
    if (ok) confirm.mutate(order.id)
  }
  const askCancel = async (order: AdminOrder) => {
    const ok = await alertLib.confirm(
      t('hosting.orders.cancelTitle'),
      t('hosting.orders.cancelMessage', { username: order.username, plan: order.planName }),
      t('hosting.orders.cancelAction'),
      t('common.cancel'),
      'warning',
      'settings',
    )
    if (ok) cancel.mutate(order.id)
  }

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <ReceiptText className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t('hosting.orders.title')}</h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('hosting.orders.subtitle')}</p>
          </div>
        </div>
        <FilterMenu
          label={t('hosting.orders.filter')}
          value={filter}
          onChange={(value) => setFilter(value as '' | OrderStatus)}
          items={FILTERS.map((key) => ({ key, label: key === '' ? t('hosting.orders.all') : t(`hosting.orders.status.${key}`) }))}
        />
      </div>

      {list.isLoading ? (
        <LoadingState>{t('hosting.orders.loading')}</LoadingState>
      ) : list.isError ? (
        <ErrorState title={t('hosting.orders.loadFailed')} hint={t('hosting.plans.loadFailedHint')} />
      ) : list.data && list.data.items.length > 0 ? (
        <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] overflow-hidden">
          {list.data.items.map((order) => {
            const open = order.status === 'pending' || order.status === 'review'
            return (
              <EntityRow
                key={order.id}
                leading={
                  <IconBadge size="md">
                    <ReceiptText />
                  </IconBadge>
                }
                title={<span className="panel-mono">{order.username || '-'}</span>}
                badges={<Badge tone={TONE[order.status]} dot>{t(`hosting.orders.status.${order.status}`)}</Badge>}
                subtitle={`${order.planName} · ${t(`hosting.orders.kind.${order.kind}`)}${order.amountTotal > 0 ? ` · ${formatRupiah(order.amountTotal)}` : ''}${order.voucherCode ? ` · ${t('hosting.orders.voucher', { code: order.voucherCode, amount: formatRupiah(order.discountVoucher) })}` : ''}`}
                meta={
                  <span className="text-[11.5px] text-[var(--text-secondary)]">
                    <DateTimeText value={order.createdAt} />
                    {order.note ? ` · ${order.note}` : ''}
                  </span>
                }
                actions={
                  open ? (
                    <div className="flex items-center gap-1">
                      <IconButton label={t('hosting.orders.confirmAction')} tone="success" disabled={busy} onClick={() => void askConfirm(order)} className="!h-7 !w-7">
                        <Check className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label={t('hosting.orders.cancelAction')} tone="danger" disabled={busy} onClick={() => void askCancel(order)} className="!h-7 !w-7">
                        <X className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      ) : (
        <EmptyState icon={<ReceiptText size={18} />}>{t('hosting.orders.empty')}</EmptyState>
      )}
    </div>
  )
}
