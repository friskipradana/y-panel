import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, FileText, ReceiptText, X } from 'lucide-react'
import { toast } from 'sonner'
import { cancelHostingOrder, confirmHostingOrder, formatRupiah, type AdminOrder, type OrderStatus } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { HostingTableBar, indexLabel, RowAction, StatusPill, useHostingTable } from './HostingTableKit'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

const TONE = { pending: 'warning', review: 'info', paid: 'success', expired: 'neutral', cancelled: 'neutral' } as const

// Orders of buyers: the ones to look at first (waiting for approval or payment), confirm by hand, or cancel
export function HostingOrdersCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const table = useHostingTable<AdminOrder>('orders', 15_000)
  const { list, query, items, facets } = table
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
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <ReceiptText className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t('hosting.orders.title')}</h2>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('hosting.orders.subtitle')}</p>
        </div>
      </div>

      <HostingTableBar text={list.text} setText={list.setText} placeholder={t('hosting.orders.search')} total={table.total} all={table.all} fetching={query.isFetching && !query.isLoading} onRefresh={() => void query.refetch()} />

      <ListTable
        variant="hosting-orders"
        empty={query.isLoading || query.isError || items.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          list.column('user', t('hosting.col.user'), facets?.user),
          list.column('plan', t('hosting.col.plan'), facets?.plan),
          list.column('kind', t('hosting.col.kind'), facets?.kind, { labelOf: (v) => t(`hosting.orders.kind.${v}`) }),
          list.column('status', t('hosting.col.status'), facets?.status, { labelOf: (v) => t(`hosting.orders.status.${v}`) }),
          list.column('total', t('hosting.col.total'), undefined, { filterable: false }),
          list.column('created', t('hosting.col.created'), undefined, { filterable: false }),
          { label: t('hosting.col.actions'), actions: true },
        ]}
      >
        <ListState
          loading={query.isLoading}
          error={query.isError}
          errorTitle={t('hosting.orders.loadFailed')}
          errorHint={t('hosting.plans.loadFailedHint')}
          loadingText={t('hosting.orders.loading')}
          empty={items.length === 0}
          emptyIcon={<ReceiptText />}
          emptyTitle={table.narrowed ? t('docker.noResults') : t('hosting.orders.empty')}
        >
          {items.map((order, index) => {
            const open = order.status === 'pending' || order.status === 'review'
            const status = order.status as OrderStatus
            const kind = t(`hosting.orders.kind.${order.kind}`)
            const voucher = order.voucherCode ? t('hosting.orders.voucher', { code: order.voucherCode, amount: formatRupiah(order.discountVoucher) }) : ''
            const total = order.amountTotal > 0 ? formatRupiah(order.amountTotal) : '-'
            return (
              <div className="docker-row" key={order.id}>
                <div className="docker-row__num">{indexLabel(index)}</div>
                <div className="docker-row__app">
                  <ListRowIcon><ReceiptText className="h-3.5 w-3.5" /></ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name docker-app-name--mono" title={order.username}>{order.username || '-'}</span>
                    <span className="docker-row__sub">{voucher || order.note || kind}</span>
                    <span className="docker-row__meta">{`${order.planName} · ${kind} · ${total}`}</span>
                  </div>
                </div>
                <div className="docker-cell" title={order.planName}>{order.planName}</div>
                <div className="docker-cell">{kind}</div>
                <div className="docker-cell--keep">
                  <StatusPill tone={TONE[status]}>{t(`hosting.orders.status.${status}`)}</StatusPill>
                </div>
                <div className="docker-cell docker-cell--mono">{total}</div>
                <div className="docker-cell">
                  <DateTimeText value={order.createdAt} />
                </div>
                <div className="docker-action-btns">
                  {open ? (
                    <>
                      <RowAction label={t('hosting.orders.confirmAction')} disabled={busy} onClick={() => void askConfirm(order)}>
                        <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </RowAction>
                      <RowAction label={t('hosting.orders.cancelAction')} danger disabled={busy} onClick={() => void askCancel(order)}>
                        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </RowAction>
                    </>
                  ) : null}
                  <RowAction label={t('invoice.open')} onClick={() => window.open(`/order/${order.publicId}/invoice`, '_blank', 'noopener')}>
                    <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </RowAction>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>
    </div>
  )
}
