import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createHostingPlan, deleteHostingPlan, formatRupiah, listHostingPlans, updateHostingPlan, type HostingPlan, type PlanInput } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { getSiteSettings } from '@/api/system'
import { useI18n } from '@/lib/i18n'
import { PlanFormModal } from './PlanFormModal'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The plans on sale: they feed the pricing section of the landing page and the quota of an account
export function HostingPlansCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const plans = useQuery({ queryKey: ['hosting', 'plans'], queryFn: listHostingPlans, retry: 0 })
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
    const ok = await alertLib.confirm(
      t('hosting.plan.deleteTitle'),
      t('hosting.plan.deleteMessage', { name: plan.name }),
      t('common.delete'),
      t('common.cancel'),
      'warning',
      'settings',
    )
    if (ok) remove.mutate(plan.id)
  }

  return (
    <div className="panel-shell-card flex flex-col gap-4 p-4.5">
      <SectionHeader
        icon={<Boxes />}
        title={t('hosting.plans.title')}
        subtitle={t('hosting.plans.subtitle')}
        actions={
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setTarget('new')}>
            {t('hosting.plans.add')}
          </Button>
        }
      />

      {site.data?.examplePlansSeeded && plans.data?.some((plan) => ['starter', 'pro', 'bisnis'].includes(plan.slug)) ? (
        <p className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 text-[12px] text-[var(--text-secondary)]">{t('hosting.plans.exampleHint')}</p>
      ) : null}

      {plans.isLoading ? (
        <LoadingState>{t('hosting.plans.loading')}</LoadingState>
      ) : plans.isError ? (
        <ErrorState title={t('hosting.plans.loadFailed')} hint={t('hosting.plans.loadFailedHint')} />
      ) : plans.data && plans.data.length > 0 ? (
        <div className="flex flex-col gap-2">
          {plans.data.map((plan) => (
            <EntityRow
              key={plan.id}
              leading={<IconBadge tone={plan.highlighted ? 'primary' : 'neutral'}><Boxes /></IconBadge>}
              title={plan.name}
              badges={
                <>
                  <Badge tone="info">
                    {formatRupiah(plan.priceAmount)} {t(`hosting.period.${plan.period}`)}
                  </Badge>
                  {!plan.visible ? <Badge tone="neutral">{t('hosting.plan.hidden')}</Badge> : null}
                  {plan.highlighted ? <Badge tone="primary">{t('hosting.plan.highlightedBadge')}</Badge> : null}
                </>
              }
              subtitle={<span className="panel-mono">{plan.slug}</span>}
              meta={
                <span className="text-[11.5px] text-[var(--text-secondary)]">
                  {t('hosting.plan.summary', {
                    projects: plan.maxProjects,
                    databases: plan.maxDatabases,
                    disk: Math.round(plan.diskQuotaMb / 1024),
                    subdomains: plan.maxSubdomains,
                  })}
                  {' · '}
                  {t('hosting.plan.accounts', { count: plan.accounts })}
                </span>
              }
              actions={
                <div className="flex items-center gap-1">
                  <IconButton label={t('common.edit')} tone="primary" onClick={() => setTarget(plan)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton label={t('common.delete')} tone="danger" onClick={() => void confirmDelete(plan)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Boxes size={18} />}>{t('hosting.plans.empty')}</EmptyState>
      )}

      <PlanFormModal target={target} saving={save.isPending} error={formError} onClose={close} onSave={(plan) => save.mutate(plan)} />
    </div>
  )
}
