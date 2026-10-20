import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cloud, Globe, Plus, Power, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { checkPublicRoute, createRouteDns, deletePublicRoute, getPublicProxy, updatePublicRoute, type PublicRoute, type PublicRouteState } from '@/api/publicProxy'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Button } from '@/components/ui/Button'
import type { UiTone } from '@/components/ui/IconBadge'
import { ListRowIcon, ListState, ListTable } from '@/components/ui/ListTable'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'
import { HostingTableBar, indexLabel, RowAction, StatusPill, useHostingTable } from '../hosting/HostingTableKit'
import { PublicRouteModal } from './PublicRouteModal'

const TONE: Record<PublicRouteState, UiTone> = { issued: 'success', waiting: 'warning', error: 'danger', off: 'neutral', disabled: 'neutral' }

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The domains the public proxy answers for: what each leads to, the state of its certificate, and the actions on it
export function PublicRoutesCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const table = useHostingTable<PublicRoute>('public-routes', 15_000)
  const status = useQuery({ queryKey: ['public-proxy'], queryFn: getPublicProxy, retry: 0 })
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['public-proxy', 'routes'] })

  const toggle = useMutation({
    mutationFn: (row: PublicRoute) => updatePublicRoute(row.id, { kind: row.kind, projectId: row.projectId, port: row.port, note: row.note, enabled: !row.enabled }),
    onSuccess: refresh,
    onError: (e) => toast.error(apiError(e, t('publicip.route.saveFailed'))),
  })
  const remove = useMutation({
    mutationFn: (row: PublicRoute) => deletePublicRoute(row.id),
    onSuccess: () => {
      refresh()
      toast.success(t('publicip.route.deleted'))
    },
    onError: (e) => toast.error(apiError(e, t('publicip.route.saveFailed'))),
  })
  const dns = useMutation({
    mutationFn: (row: PublicRoute) => createRouteDns(row.id),
    onMutate: (row) => setBusyId(row.id),
    onSettled: () => setBusyId(null),
    onSuccess: (result) => toast.success(t(result.created ? 'publicip.route.dnsCreated' : 'publicip.route.dnsExists', { type: result.type, zone: result.zone })),
    onError: (e) => toast.error(apiError(e, t('publicip.route.dnsFailed')), { description: undefined }),
  })
  const check = useMutation({
    mutationFn: (row: PublicRoute) => checkPublicRoute(row.id),
    onMutate: (row) => setBusyId(row.id),
    onSettled: () => setBusyId(null),
    onSuccess: (result) => {
      refresh()
      if (result.ok) toast.success(t('publicip.route.checkOk'))
      else toast.error(t('publicip.route.checkFailed'), { description: localizeServerMessage(result.error) ?? result.error })
    },
    onError: (e) => toast.error(apiError(e, t('publicip.route.checkFailed'))),
  })

  const askDelete = async (row: PublicRoute) => {
    const ok = await alertLib.confirm(t('publicip.route.deleteTitle'), t('publicip.route.deleteMessage', { hostname: row.hostname }), t('common.delete'), t('common.cancel'), 'warning', 'settings')
    if (ok) remove.mutate(row)
  }

  const running = status.data?.running === true
  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--panel-primary-text)]" strokeWidth={1.75} />
        <div>
          <h2 className="text-[13px] font-semibold leading-tight text-[var(--win-text)]">{t('publicip.routes.title')}</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{t('publicip.routes.subtitle')}</p>
        </div>
      </div>
      {status.data && !running ? <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('publicip.routes.proxyOff')}</p> : null}

      <HostingTableBar
        text={table.list.text}
        setText={table.list.setText}
        placeholder={t('publicip.routes.search')}
        total={table.total}
        all={table.all}
        fetching={table.query.isFetching && !table.query.isLoading}
        onRefresh={() => void table.query.refetch()}
        extra={
          <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdding(true)}>
            {t('publicip.route.add')}
          </Button>
        }
      />

      <ListTable
        variant="public-routes"
        empty={table.query.isLoading || table.query.isError || table.items.length === 0}
        columns={[
          { label: t('docker.colIndex') },
          table.list.column('hostname', t('publicip.col.domain'), undefined, { filterable: false }),
          table.list.column('target', t('publicip.col.target'), undefined, { filterable: false }),
          table.list.column('state', t('publicip.col.state'), table.facets?.state, { labelOf: (v) => t(`publicip.route.state.${v}`) }),
          { label: t('publicip.col.cert') },
          { label: t('hosting.col.actions'), actions: true },
        ]}
      >
        <ListState
          loading={table.query.isLoading}
          error={table.query.isError}
          errorTitle={t('publicip.routes.loadFailed')}
          errorHint={t('hosting.plans.loadFailedHint')}
          loadingText={t('publicip.loading')}
          empty={table.items.length === 0}
          emptyIcon={<Globe />}
          emptyTitle={table.narrowed ? t('docker.noResults') : t('publicip.routes.empty')}
        >
          {table.items.map((row, index) => {
            const working = busyId === row.id
            return (
              <div className="docker-row" key={row.id}>
                <div className="docker-row__num">{indexLabel(index)}</div>
                <div className="docker-row__app">
                  <ListRowIcon><Globe className="h-3.5 w-3.5" /></ListRowIcon>
                  <div className="docker-row__text">
                    <span className="docker-app-name docker-app-name--mono" title={row.hostname}>{row.hostname}</span>
                    <span className="docker-row__sub" title={row.checkError || row.note}>{row.state === 'error' && row.checkError ? (localizeServerMessage(row.checkError) ?? row.checkError) : row.note || t(`publicip.kind.${row.kind}`)}</span>
                    <span className="docker-row__meta">{row.kind === 'panel' ? t('publicip.kind.panel') : `${t(`publicip.kind.${row.kind}`)} · ${row.target}`}</span>
                  </div>
                </div>
                <div className="docker-cell" title={row.target}>{row.kind === 'panel' ? t('publicip.kind.panel') : `${t(`publicip.kind.${row.kind}`)}: ${row.target}`}</div>
                <div className="docker-cell--keep">
                  <StatusPill tone={TONE[row.state]}>{t(`publicip.route.state.${row.state}`)}</StatusPill>
                </div>
                <div className="docker-cell">{row.certExpires ? <DateTimeText value={row.certExpires} /> : '-'}</div>
                <div className="docker-action-btns">
                  {status.data?.cloudflare ? (
                    <RowAction label={t('publicip.route.makeDns')} disabled={working} onClick={() => dns.mutate(row)}>
                      <Cloud className={`h-3.5 w-3.5 ${working && dns.isPending ? 'animate-pulse' : ''}`} strokeWidth={1.75} />
                    </RowAction>
                  ) : null}
                  <RowAction label={t('publicip.route.check')} disabled={working || !running || !row.enabled} onClick={() => check.mutate(row)}>
                    <ShieldCheck className={`h-3.5 w-3.5 ${working ? 'animate-pulse' : ''}`} strokeWidth={1.75} />
                  </RowAction>
                  <RowAction label={row.enabled ? t('publicip.route.switchOff') : t('publicip.route.switchOn')} disabled={toggle.isPending} onClick={() => toggle.mutate(row)}>
                    <Power className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </RowAction>
                  <RowAction label={t('common.delete')} danger disabled={remove.isPending} onClick={() => void askDelete(row)}>
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </RowAction>
                </div>
              </div>
            )
          })}
        </ListState>
      </ListTable>

      <PublicRouteModal open={adding} status={status.data} onClose={() => setAdding(false)} />
    </div>
  )
}
