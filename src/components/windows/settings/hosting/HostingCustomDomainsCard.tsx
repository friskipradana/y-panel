import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Globe, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CloudflareTokenGuide } from '@/components/cloudflare/CloudflareTokenGuide'
import { deleteMyCustomDomain, getCustomDomainSetup, listHostingDomains, setupCustomDomains, type CustomDomain, type SubdomainStatus } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { Select } from '@/components/ui/Select'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { DateTimeText } from '@/components/common/DateTimeText'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { HostingTableBar, indexLabel, RowAction, StatusPill, useHostingTable } from './HostingTableKit'

const TONE: Record<SubdomainStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', pending: 'warning', error: 'danger', suspended: 'neutral' }

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Domains of buyers' own: the name buyers point their CNAME at, and every domain that was added
export function HostingCustomDomainsCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const setup = useQuery({ queryKey: ['hosting', 'custom-domains'], queryFn: getCustomDomainSetup, retry: 0, refetchInterval: 30_000 })
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0 })
  const table = useHostingTable<CustomDomain>('custom-domains', 30_000)
  const [pick, setPick] = useState('')
  const [guide, setGuide] = useState(false)

  const save = useMutation({
    mutationFn: () => setupCustomDomains(pick || setup.data?.zoneId || ''),
    onSuccess: (data) => {
      toast.success(t('hosting.customAdmin.saved'))
      qc.setQueryData(['hosting', 'custom-domains'], data)
      setPick('')
    },
    onError: (e) => toast.error(apiError(e, t('hosting.customAdmin.failed'))),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteMyCustomDomain(id),
    onSuccess: () => {
      toast.success(t('hosting.custom.deleted'))
      void qc.invalidateQueries({ queryKey: ['hosting', 'custom-domains'] })
    },
    onError: (e) => toast.error(apiError(e, t('hosting.customAdmin.failed'))),
  })

  const offered = (domains.data ?? []).filter((domain) => domain.enabled)
  const current = pick || setup.data?.zoneId || ''
  const changed = current !== '' && current !== setup.data?.zoneId

  const confirmDelete = async (row: CustomDomain) => {
    const ok = await alertLib.confirm(t('hosting.custom.deleteTitle'), t('hosting.customAdmin.deleteMessage', { hostname: row.hostname, username: row.username ?? '-' }), t('common.delete'), t('common.cancel'), 'warning', 'settings')
    if (ok) remove.mutate(row.id)
  }

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
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

      {setup.isLoading ? (
        <LoadingState>{t('hosting.customAdmin.loading')}</LoadingState>
      ) : setup.isError || !setup.data ? (
        <ErrorState title={t('hosting.customAdmin.loadFailed')} hint={t('hosting.plans.loadFailedHint')} />
      ) : (
        <>
          <Field label={t('hosting.customAdmin.zone')} className="max-w-[640px]" hint={setup.data.ready ? t('hosting.customAdmin.target', { target: setup.data.target }) : t('hosting.customAdmin.zoneHint')}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Select value={current} onChange={setPick} options={offered.map((domain) => ({ value: domain.zoneId, label: domain.name }))} placeholder={t('hosting.customAdmin.pick')} searchable />
              </div>
              <Button variant="primary" disabled={current === '' || (setup.data.ready && !changed)} loading={save.isPending} onClick={() => save.mutate()}>
                {setup.data.ready ? t('hosting.customAdmin.change') : t('hosting.customAdmin.setup')}
              </Button>
            </div>
          </Field>

          <div className="space-y-3">
            <Button variant="outline" size="sm" aria-expanded={guide} icon={<ChevronDown className={`h-3.5 w-3.5 transition-transform ${guide ? 'rotate-180' : ''}`} />} onClick={() => setGuide((open) => !open)}>
              {guide ? t('cfguide.hide') : t('cfguide.showHosting')}
            </Button>
            {guide ? <CloudflareTokenGuide focus="hosting" /> : null}
          </div>

          {table.all > 5 || table.narrowed ? (
            <HostingTableBar text={table.list.text} setText={table.list.setText} placeholder={t('hosting.customAdmin.search')} total={table.total} all={table.all} fetching={table.query.isFetching && !table.query.isLoading} onRefresh={() => void table.query.refetch()} />
          ) : null}

          <ListTable
            variant="hosting-custom-domains"
            empty={table.query.isLoading || table.query.isError || table.items.length === 0}
            columns={[
              { label: t('docker.colIndex') },
              table.list.column('hostname', t('hosting.col.domain'), undefined, { filterable: false }),
              table.list.column('owner', t('hosting.col.owner'), table.facets?.owner),
              table.list.column('status', t('hosting.col.status'), table.facets?.status, { labelOf: (v) => t(`hosting.custom.status.${v}`) }),
              table.list.column('ssl', t('hosting.col.ssl'), table.facets?.ssl),
              table.list.column('created', t('hosting.col.created'), undefined, { filterable: false }),
              { label: t('hosting.col.actions'), actions: true },
            ]}
          >
            <ListState
              loading={table.query.isLoading}
              error={table.query.isError}
              errorTitle={t('hosting.customAdmin.loadFailed')}
              errorHint={t('hosting.plans.loadFailedHint')}
              loadingText={t('hosting.customAdmin.loading')}
              empty={table.items.length === 0}
              emptyIcon={<Globe />}
              emptyTitle={table.narrowed ? t('docker.noResults') : t('hosting.customAdmin.empty')}
            >
              {table.items.map((row, index) => (
                <div className="docker-row" key={row.id}>
                  <div className="docker-row__num">{indexLabel(index)}</div>
                  <div className="docker-row__app">
                    <ListRowIcon><Globe className="h-3.5 w-3.5" /></ListRowIcon>
                    <div className="docker-row__text">
                      <span className="docker-app-name docker-app-name--mono" title={row.hostname}>{row.hostname}</span>
                      <span className="docker-row__sub">{row.note || t('hosting.subs.owner', { username: row.username ?? '-' })}</span>
                      <span className="docker-row__meta">{`${row.username ?? '-'} · SSL ${row.sslStatus || '-'}`}</span>
                    </div>
                  </div>
                  <div className="docker-cell">{row.username ?? '-'}</div>
                  <div className="docker-cell--keep">
                    <StatusPill tone={TONE[row.status]}>{t(`hosting.custom.status.${row.status}`)}</StatusPill>
                  </div>
                  <div className="docker-cell">{row.sslStatus || '-'}</div>
                  <div className="docker-cell">
                    <DateTimeText value={row.createdAt} />
                  </div>
                  <div className="docker-action-btns">
                    <RowAction label={t('common.delete')} danger disabled={remove.isPending} onClick={() => void confirmDelete(row)}>
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </RowAction>
                  </div>
                </div>
              ))}
            </ListState>
          </ListTable>
        </>
      )}
    </div>
  )
}
