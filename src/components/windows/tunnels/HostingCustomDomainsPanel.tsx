import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Globe, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { deleteMyCustomDomain, getMyCustomDomains, refreshMyCustomDomain, type CustomDomain, type SubdomainStatus } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { CustomDomainModal } from './CustomDomainModal'

const TONE: Record<SubdomainStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', pending: 'warning', error: 'danger', suspended: 'neutral' }

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The domains of the buyer's own that lead to their panel. Shown only when the server owner set custom domains up
// and the plan includes some (or some are already held).
export function HostingCustomDomainsPanel() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const mine = useQuery({ queryKey: ['my-custom-domains'], queryFn: getMyCustomDomains, staleTime: 10_000, retry: 0, refetchInterval: (q) => (q.state.data?.items.some((row) => row.status === 'pending') ? 20_000 : false) })
  const [open, setOpen] = useState(false)

  const refresh = () => void qc.invalidateQueries({ queryKey: ['my-custom-domains'] })
  const recheck = useMutation({
    mutationFn: (id: number) => refreshMyCustomDomain(id),
    onSuccess: refresh,
    onError: (e) => toast.error(apiError(e, t('hosting.custom.refreshFailed'))),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteMyCustomDomain(id),
    onSuccess: () => {
      toast.success(t('hosting.custom.deleted'))
      refresh()
    },
    onError: (e) => alertLib.fire(t('hosting.custom.deleteFailed'), apiError(e, t('hosting.custom.refreshFailed')), 'error', 'tunnels'),
  })

  const data = mine.data
  if (!data?.ready || (data.limit === 0 && data.items.length === 0)) return null

  const confirmDelete = async (row: CustomDomain) => {
    const ok = await alertLib.confirm(t('hosting.custom.deleteTitle'), t('hosting.custom.deleteMessage', { hostname: row.hostname }), t('common.delete'), t('common.cancel'), 'warning', 'tunnels')
    if (ok) remove.mutate(row.id)
  }
  const copyTarget = () => void copyTextToClipboard(data.target).then(() => toast.success(t('hosting.custom.targetCopied')))

  return (
    <div className="px-4 pb-3">
      <div className="panel-shell-card flex flex-col gap-3 p-3.5">
        <SectionHeader
          icon={<Globe />}
          title={t('hosting.custom.title')}
          subtitle={t('hosting.custom.quota', { used: data.used, limit: data.limit })}
          actions={
            <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} disabled={data.used >= data.limit} onClick={() => setOpen(true)}>
              {t('hosting.custom.add')}
            </Button>
          }
        />
        {data.used >= data.limit && data.limit > 0 ? <p className="text-[12px] text-[var(--text-secondary)]">{t('hosting.custom.full')}</p> : null}

        {data.items.length > 0 ? (
          <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)]">
            {data.items.map((row) => (
              <li key={row.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_7.5rem] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="panel-mono truncate text-[13px] font-semibold">{row.hostname}</span>
                    <Badge tone={TONE[row.status]} dot>{t(`hosting.custom.status.${row.status}`)}</Badge>
                  </div>
                  {row.status === 'pending' ? (
                    <p className="mt-0.5 text-[11.5px] text-[var(--text-secondary)]">
                      {t('hosting.custom.pointHint', { target: data.target })}
                      {row.note ? ` (${row.note})` : ''}
                    </p>
                  ) : row.note ? (
                    <p className="mt-0.5 text-[11.5px] text-[var(--text-secondary)]">{row.note}</p>
                  ) : null}
                </div>
                <div className="flex items-center justify-end gap-1">
                  {row.status === 'active' ? (
                    <IconButton label={t('hosting.sub.open')} tone="primary" onClick={() => window.open(`https://${row.hostname}`, '_blank', 'noopener,noreferrer')}>
                      <ExternalLink className="h-4 w-4" />
                    </IconButton>
                  ) : (
                    <IconButton label={t('hosting.custom.recheck')} disabled={recheck.isPending} onClick={() => recheck.mutate(row.id)}>
                      <RefreshCw className={`h-4 w-4 ${recheck.isPending && recheck.variables === row.id ? 'animate-spin' : ''}`} />
                    </IconButton>
                  )}
                  <IconButton label={t('common.delete')} tone="danger" onClick={() => void confirmDelete(row)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[var(--text-secondary)]">{t('hosting.custom.empty')}</p>
        )}

        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11.5px] text-[var(--text-secondary)]">{t('hosting.custom.target')}</p>
            <p className="panel-mono truncate text-[12.5px] font-semibold">{data.target}</p>
          </div>
          <IconButton label={t('hosting.custom.copyTarget')} onClick={copyTarget}>
            <Copy className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <CustomDomainModal open={open} target={data.target} onClose={() => setOpen(false)} onCreated={refresh} />
    </div>
  )
}
