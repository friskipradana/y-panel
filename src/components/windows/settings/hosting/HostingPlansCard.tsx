import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createHostingPlan, deleteHostingPlan, formatRupiah, updateHostingPlan, type HostingPlan, type PlanInput } from '@/api/hosting'
import { getSiteSettings } from '@/api/system'
import { Button } from '@/components/ui/Button'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { HostingTableBar, indexLabel, RowAction, StatusPill, useHostingTable } from './HostingTableKit'
import { PlanFormModal } from './PlanFormModal'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The plans on sale: they feed the pricing section of the landing page and the quota of an account
export function HostingPlansCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const table = useHostingTable<HostingPlan>('plans')
  const { list, query, items, facets } = table
  const site = useQuery({ queryKey: ['settings', 'site'], queryFn: getSiteSettings, retry: 0 })
  const [target, setTarget] = useState<HostingPlan | 'new' | null>(null)
  const [formError, setFormError] = useState('')

  const close = () => {
    setTarget(null)
    setFormError('')
  }
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['hosting', 'plans'] })
    void qc.invalidateQueries({ queryKey: ['public-hosting'] })
  }

  const save = useMutation({
    mutationFn: (plan: PlanInput) => (target !== null && target !== 'new' ? updateHostingPlan(target.id, plan) : createHostingPlan(plan)),
    onSuccess: () => {
      toast.success(t('hosting.plan.saved'))
      refresh()
      close()
    },
    onError: (error) => setFormError(apiError(error, t('hosting.plan.saveFailed'))),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteHostingPlan(id),
    onSuccess: () => {
      toast.success(t('hosting.plan.deleted'))
      refresh()
    },
    onError: (error) => alertLib.fire(t('hosting.plan.deleteFailedTitle'), apiError(error, t('hosting.plan.saveFailed')), 'error', 'settings'),
  })

  const confirmDelete = async (plan: HostingPlan) => {
    const ok = await alertLib.confirm(t('hosting.plan.deleteTitle'), t('hosting.plan.deleteMessage', { name: plan.name }), t('common.delete'), t('common.cancel'), 'warning', 'settings')
    if (ok) remove.mutate(plan.id)
  }

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Boxes className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t('hosting.plans.title')}</h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('hosting.plans.subtitle')}</p>
          </div>
        </div>
        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setTarget('new')} className="!h-8 shrink-0">
          {t('hosting.plans.add')}
        </Button>
      </div>

      {site.data?.examplePlansSeeded && items.some((plan) => ['starter', 'pro', 'bisnis'].includes(plan.slug)) ? (
        <p className="settings-inset p-2.5 text-[11.5px] text-[var(--text-secondary)] rounded-md border border-[var(--win-border)] bg-[var(--panel-surface-subtle)] leading-relaxed">
          {t('hosting.plans.exampleHint')}
        </p>
      ) : null}

      <HostingTableBar text={list.text} setText={list.setText} placeholder={t('hosting.plans.search')} total={table.total} all={table.all} fetching={query.isFetching && !query.isLoading} onRefresh={() => void query.refetch()} />

      <ListTable
        variant="hosting-plans"
        empty={query.isLoading || query.isError || items.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          list.column('name', t('hosting.col.plan'), facets?.name, { filterable: false }),
          list.column('price', t('hosting.col.price'), undefined, { filterable: false }),
          { label: t('hosting.col.resources') },
          list.column('accounts', t('hosting.col.accounts'), undefined, { filterable: false }),
          list.column('visible', t('hosting.col.visible'), facets?.visible, { labelOf: (v) => t(v === 'yes' ? 'hosting.col.yes' : 'hosting.col.no') }),
          { label: t('hosting.col.actions'), actions: true },
        ]}
      >
        <ListState
          loading={query.isLoading}
          error={query.isError}
          errorTitle={t('hosting.plans.loadFailed')}
          errorHint={t('hosting.plans.loadFailedHint')}
          loadingText={t('hosting.plans.loading')}
          empty={items.length === 0}
          emptyIcon={<Boxes />}
          emptyTitle={table.narrowed ? t('docker.noResults') : t('hosting.plans.empty')}
        >
          {items.map((plan, index) => {
            const price = plan.priceAmount === 0 ? t('hosting.landing.free') : `${formatRupiah(plan.priceAmount)} ${t(`hosting.period.${plan.period}`)}`
            const resources = t('hosting.plan.summary', { projects: plan.maxProjects, databases: plan.maxDatabases, disk: Math.round(plan.diskQuotaMb / 1024), subdomains: plan.maxSubdomains })
            return (
              <div className="docker-row" key={plan.id}>
                <div className="docker-row__num">{indexLabel(index)}</div>
                <div className="docker-row__app">
                  <ListRowIcon><Boxes className="h-3.5 w-3.5" /></ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name" title={plan.name}>
                      {plan.name}
                      {plan.highlighted ? <span className="ml-1.5 text-[10.5px] font-normal text-[var(--panel-primary-text)]">{t('hosting.plan.highlightedBadge')}</span> : null}
                    </span>
                    <span className="docker-row__sub" title={plan.tagline}>{plan.tagline || plan.slug}</span>
                    <span className="docker-row__meta">{`${price} · ${t('hosting.plan.accounts', { count: plan.accounts })}`}</span>
                  </div>
                </div>
                <div className="docker-cell docker-cell--mono">{price}</div>
                <div className="docker-cell" title={resources}>{resources}</div>
                <div className="docker-cell">{plan.accounts}</div>
                <div className="docker-cell--keep">
                  <StatusPill tone={plan.visible ? 'success' : 'neutral'}>{t(plan.visible ? 'hosting.plan.shown' : 'hosting.plan.hidden')}</StatusPill>
                </div>
                <div className="docker-action-btns">
                  <RowAction label={t('common.edit')} onClick={() => setTarget(plan)}>
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </RowAction>
                  <RowAction label={t('common.delete')} danger disabled={remove.isPending} onClick={() => void confirmDelete(plan)}>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </RowAction>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>

      <PlanFormModal target={target} saving={save.isPending} error={formError} onClose={close} onSave={(plan) => save.mutate(plan)} />
    </div>
  )
}
