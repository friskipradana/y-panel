import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { listHostingDomains, setHostingDomain, setMainHostingDomain, type HostingDomain } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { HostingTableBar, indexLabel, RowAction, StatusPill, useHostingTable } from './HostingTableKit'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The domains buyers may take subdomains under. The domains of the superadmin's Cloudflare account
// are picked from a list (an account can hold many); only the ones offered are shown below it.
export function HostingDomainsCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const domains = useQuery({ queryKey: ['hosting', 'domains'], queryFn: listHostingDomains, retry: 0 })
  const table = useHostingTable<HostingDomain>('domains')
  // the status Cloudflare gives a zone, in words; one that is not known is shown as Cloudflare wrote it
  const domainStatus = (status?: string) => (status ? (['active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated'].includes(status) ? t(`hosting.domains.zone.${status}`) : status) : '-')
  const [pick, setPick] = useState('')

  const toggle = useMutation({
    mutationFn: ({ zoneId, enabled }: { zoneId: string; enabled: boolean }) => setHostingDomain(zoneId, enabled),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['hosting', 'domains'] })
      void qc.invalidateQueries({ queryKey: ['my-subdomains'] })
      if (vars.enabled) setPick('')
      toast.success(t('hosting.domains.saved'))
    },
    onError: (error) => toast.error(apiError(error, t('hosting.domains.saveFailed'))),
  })

  const makeMain = useMutation({
    mutationFn: (zoneId: string) => setMainHostingDomain(zoneId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hosting', 'domains'] })
      void qc.invalidateQueries({ queryKey: ['public-hosting'] })
      toast.success(t('hosting.domains.mainSaved'))
    },
    onError: (error) => toast.error(apiError(error, t('hosting.domains.saveFailed'))),
  })

  const all = domains.data ?? []
  const offered = all.filter((domain) => domain.enabled)
  const addable = all.filter((domain) => !domain.enabled)

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Globe2 className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t('hosting.domains.title')}</h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('hosting.domains.subtitle')}</p>
          </div>
        </div>
      </div>

      {domains.isLoading ? (
        <LoadingState>{t('hosting.domains.loading')}</LoadingState>
      ) : domains.isError ? (
        <ErrorState title={t('hosting.domains.loadFailed')} hint={apiError(domains.error, t('hosting.domains.loadFailedHint'))} />
      ) : all.length === 0 ? (
        <EmptyState icon={<Globe2 size={18} />}>{t('hosting.domains.empty')}</EmptyState>
      ) : (
        <>
          <Field label={t('hosting.domains.addLabel')} className="max-w-[640px]" hint={addable.length === 0 ? t('hosting.domains.allOffered') : t('hosting.domains.addHint', { count: addable.length })}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  value={pick}
                  onChange={setPick}
                  searchable
                  disabled={addable.length === 0}
                  placeholder={t('hosting.domains.pick')}
                  searchPlaceholder={t('hosting.domains.search')}
                  options={addable.map((domain) => ({ value: domain.zoneId, label: domain.name, description: domain.status && domain.status !== 'active' ? domainStatus(domain.status) : undefined }))}
                />
              </div>
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={pick === ''} loading={toggle.isPending} onClick={() => toggle.mutate({ zoneId: pick, enabled: true })}>
                {t('hosting.domains.offer')}
              </Button>
            </div>
          </Field>

          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('hosting.domains.offeredTitle', { count: offered.length })}</p>
            {table.all > 5 || table.narrowed ? (
              <HostingTableBar text={table.list.text} setText={table.list.setText} placeholder={t('hosting.domains.searchOffered')} total={table.total} all={table.all} fetching={table.query.isFetching && !table.query.isLoading} onRefresh={() => void table.query.refetch()} />
            ) : null}
            <ListTable
              variant="hosting-domains"
              empty={table.query.isLoading || table.query.isError || table.items.length === 0}
              columns={[
                { label: t('docker.colIndex') },
                table.list.column('name', t('hosting.col.domain'), table.facets?.name, { filterable: false }),
                table.list.column('status', t('hosting.col.status'), table.facets?.status, { labelOf: domainStatus }),
                table.list.column('role', t('hosting.col.role'), table.facets?.role, { labelOf: (v) => t(v === 'main' ? 'hosting.domains.main' : 'hosting.domains.extra') }),
                { label: t('hosting.col.actions'), actions: true },
              ]}
            >
              <ListState
                loading={table.query.isLoading}
                error={table.query.isError}
                errorTitle={t('hosting.domains.loadFailed')}
                errorHint={apiError(table.query.error, t('hosting.domains.loadFailedHint'))}
                loadingText={t('hosting.domains.loading')}
                empty={table.items.length === 0}
                emptyIcon={<Globe2 />}
                emptyTitle={table.narrowed ? t('docker.noResults') : t('hosting.domains.noneOffered')}
              >
                {table.items.map((domain, index) => (
                  <div className="docker-row" key={domain.zoneId}>
                    <div className="docker-row__num">{indexLabel(index)}</div>
                    <div className="docker-row__app">
                      <ListRowIcon><Globe2 className="h-3.5 w-3.5" /></ListRowIcon>
                      <div className="docker-row__text">
                        <span className="docker-app-name docker-app-name--mono" title={domain.name}>{domain.name}</span>
                        <span className="docker-row__sub">{domain.isMain ? t('hosting.domains.mainExample', { name: domain.name }) : t('hosting.domains.example', { name: domain.name })}</span>
                        <span className="docker-row__meta">{`${domainStatus(domain.status)} · ${t(domain.isMain ? 'hosting.domains.main' : 'hosting.domains.extra')}`}</span>
                      </div>
                    </div>
                    <div className="docker-cell--keep">
                      <StatusPill tone={domain.status === 'active' ? 'success' : 'warning'}>{domainStatus(domain.status)}</StatusPill>
                    </div>
                    <div className="docker-cell--keep">
                      <StatusPill tone={domain.isMain ? 'primary' : 'neutral'}>{t(domain.isMain ? 'hosting.domains.main' : 'hosting.domains.extra')}</StatusPill>
                    </div>
                    <div className="docker-action-btns">
                      {domain.isMain || offered.length < 2 ? null : (
                        <Button variant="outline" size="sm" disabled={makeMain.isPending} onClick={() => makeMain.mutate(domain.zoneId)}>
                          {t('hosting.domains.makeMain')}
                        </Button>
                      )}
                      <RowAction label={t('hosting.domains.stop', { name: domain.name })} danger disabled={toggle.isPending} onClick={() => toggle.mutate({ zoneId: domain.zoneId, enabled: false })}>
                        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </RowAction>
                    </div>
                  </div>
                ))}
              </ListState>
            </ListTable>
            {offered.length > 0 ? <p className="text-[11.5px] text-[var(--text-secondary)]">{t('hosting.domains.stopHint')}</p> : null}
          </div>
        </>
      )}
    </div>
  )
}
