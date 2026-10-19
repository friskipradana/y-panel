import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Pencil, Plus, Ticket, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { createHostingVoucher, deleteHostingVoucher, formatRupiah, listHostingPlans, updateHostingVoucher, type HostingVoucher, type VoucherInput } from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Button } from '@/components/ui/Button'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { HostingTableBar, indexLabel, RowAction, StatusPill, useHostingTable } from './HostingTableKit'
import { VoucherFormModal } from './VoucherFormModal'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

type VoucherState = 'active' | 'off' | 'notStarted' | 'expired' | 'usedUp'
const STATE_TONE = { active: 'success', off: 'neutral', notStarted: 'info', expired: 'neutral', usedUp: 'warning' } as const

// The vouchers buyers can type at the order form: what they take off, who may use them, how many times, until when
export function HostingVouchersCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const table = useHostingTable<HostingVoucher & { state?: VoucherState }>('vouchers')
  const { list, query, items, facets } = table
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, retry: 0 })
  const [target, setTarget] = useState<HostingVoucher | 'new' | null>(null)
  const [formError, setFormError] = useState('')

  const close = () => {
    setTarget(null)
    setFormError('')
  }
  const refresh = () => void qc.invalidateQueries({ queryKey: ['hosting', 'vouchers'] })

  const save = useMutation({
    mutationFn: (voucher: VoucherInput) => (target !== null && target !== 'new' ? updateHostingVoucher(target.id, voucher) : createHostingVoucher(voucher)),
    onSuccess: () => {
      toast.success(t('hosting.voucher.saved'))
      refresh()
      close()
    },
    onError: (error) => setFormError(apiError(error, t('hosting.voucher.saveFailed'))),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteHostingVoucher(id),
    onSuccess: () => {
      toast.success(t('hosting.voucher.deleted'))
      refresh()
    },
    onError: (error) => alertLib.fire(t('hosting.voucher.deleteFailedTitle'), apiError(error, t('hosting.voucher.deleteFailed')), 'error', 'settings'),
  })

  const confirmDelete = async (voucher: HostingVoucher) => {
    const ok = await alertLib.confirm(t('hosting.voucher.deleteTitle'), t('hosting.voucher.deleteMessage', { code: voucher.code, used: voucher.used }), t('common.delete'), t('common.cancel'), 'warning', 'settings')
    if (ok) remove.mutate(voucher.id)
  }

  // the state of a voucher as the agent works it out, so the list and its filter always agree
  const stateOf = (voucher: HostingVoucher): VoucherState => {
    const now = Date.now()
    if (!voucher.enabled) return 'off'
    if (voucher.validFrom && now < new Date(voucher.validFrom).getTime()) return 'notStarted'
    if (voucher.validUntil && now > new Date(voucher.validUntil).getTime()) return 'expired'
    if (voucher.maxUses > 0 && voucher.used >= voucher.maxUses) return 'usedUp'
    return 'active'
  }
  const planNames = (voucher: HostingVoucher) =>
    voucher.planIds.length === 0 ? t('hosting.voucher.allPlans') : voucher.planIds.map((id) => plans.data?.find((plan) => plan.id === id)?.name ?? `#${id}`).join(', ')

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Ticket className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t('hosting.vouchers.title')}</h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('hosting.vouchers.subtitle')}</p>
          </div>
        </div>
        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setTarget('new')} className="!h-8 shrink-0">
          {t('hosting.vouchers.add')}
        </Button>
      </div>

      <HostingTableBar text={list.text} setText={list.setText} placeholder={t('hosting.vouchers.search')} total={table.total} all={table.all} fetching={query.isFetching && !query.isLoading} onRefresh={() => void query.refetch()} />

      <ListTable
        variant="hosting-vouchers"
        empty={query.isLoading || query.isError || items.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          list.column('code', t('hosting.col.code'), facets?.code, { filterable: false }),
          list.column('kind', t('hosting.col.kind'), facets?.kind, { labelOf: (v) => t(`hosting.voucher.kind${v === 'percent' ? 'Percent' : 'Fixed'}`) }),
          list.column('value', t('hosting.col.discount'), undefined, { filterable: false }),
          list.column('used', t('hosting.col.used'), undefined, { filterable: false }),
          list.column('applies', t('hosting.col.applies'), facets?.applies, { labelOf: (v) => t(`hosting.voucher.applies.${v}`) }),
          list.column('state', t('hosting.col.status'), facets?.state, { labelOf: (v) => t(`hosting.voucher.state.${v}`) }),
          list.column('until', t('hosting.col.until'), undefined, { filterable: false }),
          { label: t('hosting.col.actions'), actions: true },
        ]}
      >
        <ListState
          loading={query.isLoading}
          error={query.isError}
          errorTitle={t('hosting.vouchers.loadFailed')}
          errorHint={t('hosting.vouchers.loadFailedHint')}
          loadingText={t('hosting.vouchers.loading')}
          empty={items.length === 0}
          emptyIcon={<Ticket />}
          emptyTitle={table.narrowed ? t('docker.noResults') : t('hosting.vouchers.empty')}
        >
          {items.map((voucher, index) => {
            const state = stateOf(voucher)
            const discount = voucher.kind === 'percent' ? `${voucher.value}%` : formatRupiah(voucher.value)
            const used = voucher.maxUses > 0 ? t('hosting.voucher.usedOf', { used: voucher.used, max: voucher.maxUses }) : t('hosting.voucher.usedCount', { used: voucher.used })
            return (
              <div className="docker-row" key={voucher.id}>
                <div className="docker-row__num">{indexLabel(index)}</div>
                <div className="docker-row__app">
                  <ListRowIcon><Ticket className="h-3.5 w-3.5" /></ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name docker-app-name--mono" title={voucher.code}>{voucher.code}</span>
                    <span className="docker-row__sub" title={planNames(voucher)}>{voucher.note || planNames(voucher)}</span>
                    <span className="docker-row__meta">{`${discount} · ${used} · ${t(`hosting.voucher.state.${state}`)}`}</span>
                  </div>
                </div>
                <div className="docker-cell">{t(voucher.kind === 'percent' ? 'hosting.voucher.kindPercent' : 'hosting.voucher.kindFixed')}</div>
                <div className="docker-cell docker-cell--mono">{discount}</div>
                <div className="docker-cell">{used}</div>
                <div className="docker-cell">{t(`hosting.voucher.applies.${voucher.appliesTo}`)}</div>
                <div className="docker-cell--keep">
                  <StatusPill tone={STATE_TONE[state]}>{t(`hosting.voucher.state.${state}`)}</StatusPill>
                </div>
                <div className="docker-cell">{voucher.validUntil ? <DateTimeText value={voucher.validUntil} /> : '-'}</div>
                <div className="docker-action-btns">
                  <RowAction label={t('hosting.voucher.copy')} onClick={() => void copyTextToClipboard(voucher.code).then(() => toast.success(t('common.copied')))}>
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </RowAction>
                  <RowAction label={t('common.edit')} onClick={() => setTarget(voucher)}>
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </RowAction>
                  <RowAction label={t('common.delete')} danger disabled={remove.isPending} onClick={() => void confirmDelete(voucher)}>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </RowAction>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>

      <VoucherFormModal target={target} plans={plans.data ?? []} saving={save.isPending} error={formError} onClose={close} onSave={(voucher) => save.mutate(voucher)} />
    </div>
  )
}
