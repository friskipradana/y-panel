import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Pencil, Plus, Ticket, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import {
  createHostingVoucher,
  deleteHostingVoucher,
  formatRupiah,
  listHostingPlans,
  listHostingVouchers,
  updateHostingVoucher,
  type HostingVoucher,
  type VoucherInput,
} from '@/api/hosting'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { VoucherFormModal } from './VoucherFormModal'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

type VoucherState = 'active' | 'off' | 'notStarted' | 'expired' | 'usedUp'

// Why a voucher cannot be used now, or that it can
function stateOf(voucher: HostingVoucher): VoucherState {
  const now = Date.now()
  if (!voucher.enabled) return 'off'
  if (voucher.validFrom && now < new Date(voucher.validFrom).getTime()) return 'notStarted'
  if (voucher.validUntil && now > new Date(voucher.validUntil).getTime()) return 'expired'
  if (voucher.maxUses > 0 && voucher.used >= voucher.maxUses) return 'usedUp'
  return 'active'
}

const STATE_TONE = { active: 'success', off: 'neutral', notStarted: 'info', expired: 'neutral', usedUp: 'warning' } as const

// The vouchers buyers can type at the order form: what they take off, who may use them, how many times, until when
export function HostingVouchersCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const vouchers = useQuery({ queryKey: ['hosting', 'vouchers'], queryFn: listHostingVouchers, retry: 0 })
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
    const ok = await alertLib.confirm(
      t('hosting.voucher.deleteTitle'),
      t('hosting.voucher.deleteMessage', { code: voucher.code, used: voucher.used }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      'settings',
    )
    if (ok) remove.mutate(voucher.id)
  }

  const planNames = (voucher: HostingVoucher) => {
    if (voucher.planIds.length === 0) return t('hosting.voucher.allPlans')
    const names = voucher.planIds.map((id) => plans.data?.find((plan) => plan.id === id)?.name ?? `#${id}`)
    return names.join(', ')
  }

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
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

      {vouchers.isLoading ? (
        <LoadingState>{t('hosting.vouchers.loading')}</LoadingState>
      ) : vouchers.isError ? (
        <ErrorState
          title={t('hosting.vouchers.loadFailed')}
          hint={t('hosting.vouchers.loadFailedHint')}
          action={
            <Button variant="primary" size="sm" onClick={() => void vouchers.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : vouchers.data && vouchers.data.length > 0 ? (
        <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] overflow-hidden">
          {vouchers.data.map((voucher) => {
            const state = stateOf(voucher)
            return (
              <EntityRow
                key={voucher.id}
                leading={
                  <IconBadge size="md" tone={state === 'active' ? 'success' : 'neutral'}>
                    <Ticket />
                  </IconBadge>
                }
                title={<span className="panel-mono">{voucher.code}</span>}
                badges={
                  <>
                    <Badge size="sm" tone="primary">
                      {voucher.kind === 'percent' ? `${voucher.value}%` : formatRupiah(voucher.value)}
                    </Badge>
                    <Badge size="sm" tone={STATE_TONE[state]} dot>
                      {t(`hosting.voucher.state.${state}`)}
                    </Badge>
                  </>
                }
                subtitle={voucher.note || undefined}
                meta={
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {voucher.maxUses > 0 ? t('hosting.voucher.usedOf', { used: voucher.used, max: voucher.maxUses }) : t('hosting.voucher.usedCount', { used: voucher.used })}
                    {' · '}
                    {t(`hosting.voucher.applies.${voucher.appliesTo}`)}
                    {' · '}
                    {planNames(voucher)}
                    {voucher.validUntil ? (
                      <>
                        {' · '}
                        {t('hosting.voucher.until')} <DateTimeText value={voucher.validUntil} />
                      </>
                    ) : null}
                  </span>
                }
                actions={
                  <div className="flex items-center gap-1">
                    <IconButton label={t('hosting.voucher.copy')} onClick={() => void copyTextToClipboard(voucher.code).then(() => toast.success(t('common.copied')))} className="!h-7 !w-7">
                      <Copy className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label={t('common.edit')} tone="primary" onClick={() => setTarget(voucher)} className="!h-7 !w-7">
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label={t('common.delete')} tone="danger" disabled={remove.isPending} onClick={() => void confirmDelete(voucher)} className="!h-7 !w-7">
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                }
              />
            )
          })}
        </div>
      ) : (
        <EmptyState icon={<Ticket size={18} />}>{t('hosting.vouchers.empty')}</EmptyState>
      )}

      <VoucherFormModal target={target} plans={plans.data ?? []} saving={save.isPending} error={formError} onClose={close} onSave={(voucher) => save.mutate(voucher)} />
    </div>
  )
}
