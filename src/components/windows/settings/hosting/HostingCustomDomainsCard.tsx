import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CloudflareTokenGuide } from '@/components/cloudflare/CloudflareTokenGuide'
import { deleteMyCustomDomain, getCustomDomainSetup, listHostingDomains, setupCustomDomains, type SubdomainStatus } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EntityRow } from '@/components/ui/EntityRow'
import { Field } from '@/components/ui/Field'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { Select } from '@/components/ui/Select'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const TONE: Record<SubdomainStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', pending: 'warning', error: 'danger', suspended: 'neutral' }

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Domains of buyers' own: the name buyers point their CNAME at, and every domain that was added
export function HostingCustomDomainsCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const setup = useQuery({ queryKey: ['hosting', 'custom-domains'], queryFn: getCustomDomainSetup, retry: 0, refetchInterval: 30_000 })
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0 })
  const [pick, setPick] = useState('')
  const [guide, setGuide] = useState(false)

  const refresh = () => void qc.invalidateQueries({ queryKey: ['hosting', 'custom-domains'] })
  const save = useMutation({
    mutationFn: () => setupCustomDomains(pick || setup.data?.zoneId || ''),
    onSuccess: () => {
      toast.success(t('hosting.customAdmin.saved'))
      refresh()
      void qc.invalidateQueries({ queryKey: ['my-custom-domains'] })
    },
    onError: (e) => toast.error(apiError(e, t('hosting.customAdmin.failed'))),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteMyCustomDomain(id),
    onSuccess: () => {
      toast.success(t('hosting.custom.deleted'))
      refresh()
    },
    onError: (e) => toast.error(apiError(e, t('hosting.customAdmin.failed'))),
  })

  const offered = (domains.data ?? []).filter((domain) => domain.enabled)
  const current = pick || setup.data?.zoneId || ''
  const changed = current !== '' && current !== setup.data?.zoneId

  const confirmDelete = async (id: number, hostname: string, username?: string) => {
    const ok = await alertLib.confirm(t('hosting.custom.deleteTitle'), t('hosting.customAdmin.deleteMessage', { hostname, username: username ?? '-' }), t('common.delete'), t('common.cancel'), 'warning', 'settings')
    if (ok) remove.mutate(id)
  }

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Globe className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t('hosting.customAdmin.title')}</h2>
              {setup.data ? <Badge tone={setup.data.ready ? 'success' : 'warning'} dot>{setup.data.ready ? t('hosting.customAdmin.ready') : t('hosting.customAdmin.notReady')}</Badge> : null}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('hosting.customAdmin.subtitle')}</p>
          </div>
        </div>
      </div>

      {setup.isLoading ? (
        <LoadingState>{t('hosting.customAdmin.loading')}</LoadingState>
      ) : setup.isError || !setup.data ? (
        <ErrorState title={t('hosting.customAdmin.loadFailed')} hint={t('hosting.plans.loadFailedHint')} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label={t('hosting.customAdmin.zone')} hint={setup.data.ready ? t('hosting.customAdmin.target', { target: setup.data.target }) : t('hosting.customAdmin.zoneHint')}>
              <Select value={current} onChange={setPick} options={offered.map((domain) => ({ value: domain.zoneId, label: domain.name }))} placeholder={t('hosting.customAdmin.pick')} searchable />
            </Field>
            <Button variant="primary" size="sm" disabled={current === '' || (setup.data.ready && !changed)} loading={save.isPending} onClick={() => save.mutate()} className="!h-8">
              {setup.data.ready ? t('hosting.customAdmin.change') : t('hosting.customAdmin.setup')}
            </Button>
          </div>

          <div className="space-y-3">
            <Button variant="ghost" size="sm" aria-expanded={guide} onClick={() => setGuide((open) => !open)} className="!h-7 text-xs">
              {guide ? t('cfguide.hide') : t('cfguide.showHosting')}
            </Button>
            {guide ? <CloudflareTokenGuide focus="hosting" /> : null}
          </div>

          {setup.data.items.length > 0 ? (
            <div className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] overflow-hidden">
              {setup.data.items.map((row) => (
                <EntityRow
                  key={row.id}
                  leading={
                    <IconBadge size="md">
                      <Globe />
                    </IconBadge>
                  }
                  title={<span className="panel-mono">{row.hostname}</span>}
                  badges={<Badge tone={TONE[row.status]} dot>{t(`hosting.custom.status.${row.status}`)}</Badge>}
                  subtitle={t('hosting.subs.owner', { username: row.username ?? '-' })}
                  meta={row.note ? <span className="text-[11.5px] text-[var(--text-secondary)]">{row.note}</span> : undefined}
                  actions={
                    <IconButton label={t('common.delete')} tone="danger" onClick={() => void confirmDelete(row.id, row.hostname, row.username)} className="!h-7 !w-7">
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-secondary)]">{t('hosting.customAdmin.empty')}</p>
          )}
        </>
      )}
    </div>
  )
}
