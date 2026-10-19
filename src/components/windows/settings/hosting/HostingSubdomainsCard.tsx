import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, Link2, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteSubdomainAsAdmin, setSubdomainStatus, type Subdomain, type SubdomainStatus } from '@/api/hosting'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { HostingTableBar, indexLabel, RowAction, StatusPill, useHostingTable } from './HostingTableKit'

const TONE: Record<SubdomainStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', pending: 'warning', error: 'danger', suspended: 'neutral' }

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Every subdomain sold, who holds it, and the means to suspend or release one
export function HostingSubdomainsCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const table = useHostingTable<Subdomain>('subdomains', 30_000)
  const { list, query, items, facets } = table
  const refresh = () => void qc.invalidateQueries({ queryKey: ['hosting', 'subdomains'] })

  const status = useMutation({
    mutationFn: ({ id, next }: { id: number; next: 'active' | 'suspended' }) => setSubdomainStatus(id, next),
    onSuccess: refresh,
    onError: (error) => toast.error(apiError(error, t('hosting.sub.createFailed'))),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteSubdomainAsAdmin(id),
    onSuccess: () => {
      toast.success(t('hosting.sub.deleted'))
      refresh()
    },
    onError: (error) => toast.error(apiError(error, t('hosting.sub.deleteFailed'))),
  })

  const confirmDelete = async (row: Subdomain) => {
    const ok = await alertLib.confirm(t('hosting.sub.deleteTitle'), t('hosting.sub.adminDeleteMessage', { hostname: row.hostname, username: row.username ?? '' }), t('common.delete'), t('common.cancel'), 'warning', 'settings')
    if (ok) remove.mutate(row.id)
  }

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <Link2 className="h-4 w-4 text-[var(--panel-primary-text)] shrink-0 mt-0.5" strokeWidth={1.75} />
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--win-text)] leading-tight">{t('hosting.subs.title')}</h2>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{t('hosting.subs.subtitle')}</p>
        </div>
      </div>

      <HostingTableBar text={list.text} setText={list.setText} placeholder={t('hosting.subs.search')} total={table.total} all={table.all} fetching={query.isFetching && !query.isLoading} onRefresh={() => void query.refetch()} />

      <ListTable
        variant="hosting-subdomains"
        empty={query.isLoading || query.isError || items.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          list.column('hostname', t('hosting.col.address'), facets?.hostname, { filterable: false }),
          list.column('owner', t('hosting.col.owner'), facets?.owner),
          list.column('kind', t('hosting.col.kind'), facets?.kind, { labelOf: (v) => t(`hosting.subs.kind.${v}`) }),
          list.column('status', t('hosting.col.status'), facets?.status, { labelOf: (v) => t(`hosting.sub.status.${v}`) }),
          { label: t('hosting.col.actions'), actions: true },
        ]}
      >
        <ListState
          loading={query.isLoading}
          error={query.isError}
          errorTitle={t('hosting.subs.loadFailed')}
          errorHint={t('hosting.plans.loadFailedHint')}
          loadingText={t('hosting.subs.loading')}
          empty={items.length === 0}
          emptyIcon={<Link2 />}
          emptyTitle={table.narrowed ? t('docker.noResults') : t('hosting.subs.empty')}
        >
          {items.map((row, index) => {
            const kind = t(row.panel ? 'hosting.subs.kind.panel' : 'hosting.subs.kind.extra')
            return (
              <div className="docker-row" key={row.id}>
                <div className="docker-row__num">{indexLabel(index)}</div>
                <div className="docker-row__app">
                  <ListRowIcon><Link2 className="h-3.5 w-3.5" /></ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name docker-app-name--mono" title={row.hostname}>{row.hostname}</span>
                    <span className="docker-row__sub">{row.note || t('hosting.subs.owner', { username: row.username ?? '-' })}</span>
                    <span className="docker-row__meta">{`${row.username ?? '-'} · ${kind}`}</span>
                  </div>
                </div>
                <div className="docker-cell">{row.username ?? '-'}</div>
                <div className="docker-cell">{kind}</div>
                <div className="docker-cell--keep">
                  <StatusPill tone={TONE[row.status]}>{t(`hosting.sub.status.${row.status}`)}</StatusPill>
                </div>
                <div className="docker-action-btns">
                  {row.status === 'suspended' ? (
                    <RowAction label={t('hosting.subs.lift')} disabled={status.isPending} onClick={() => status.mutate({ id: row.id, next: 'active' })}>
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </RowAction>
                  ) : (
                    <RowAction label={t('hosting.subs.suspend')} disabled={status.isPending} onClick={() => status.mutate({ id: row.id, next: 'suspended' })}>
                      <Ban className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </RowAction>
                  )}
                  <RowAction label={t('common.delete')} danger disabled={remove.isPending} onClick={() => void confirmDelete(row)}>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
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
