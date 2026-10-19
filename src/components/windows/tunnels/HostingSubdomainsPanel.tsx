import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Globe2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createMySubdomain, deleteMySubdomain, getMySubdomains, type Subdomain, type SubdomainStatus } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { SubdomainModal } from './SubdomainModal'

const TONE: Record<SubdomainStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', pending: 'warning', error: 'danger', suspended: 'neutral' }

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The addresses this account holds under the domains the server owner sells: the address of its own panel, which comes
// with every plan, and the subdomains of its plan. Shown only while hosting mode is on and the account has any.
export function HostingSubdomainsPanel() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const mine = useQuery({ queryKey: ['my-subdomains'], queryFn: getMySubdomains, staleTime: 15_000, retry: 0 })
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => void qc.invalidateQueries({ queryKey: ['my-subdomains'] })

  const create = useMutation({
    mutationFn: createMySubdomain,
    onSuccess: (row) => {
      toast.success(t('hosting.sub.created', { hostname: row.hostname }))
      setOpen(false)
      setError('')
      refresh()
    },
    onError: (e) => setError(apiError(e, t('hosting.sub.createFailed'))),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteMySubdomain(id),
    onSuccess: () => {
      toast.success(t('hosting.sub.deleted'))
      refresh()
    },
    onError: (e) => alertLib.fire(t('hosting.sub.deleteFailed'), apiError(e, t('hosting.sub.createFailed')), 'error', 'tunnels'),
  })

  const data = mine.data
  if (!data?.enabled || (data.limit === 0 && data.items.length === 0)) return null

  const confirmDelete = async (row: Subdomain) => {
    const ok = await alertLib.confirm(t('hosting.sub.deleteTitle'), t('hosting.sub.deleteMessage', { hostname: row.hostname }), t('common.delete'), t('common.cancel'), 'warning', 'tunnels')
    if (ok) remove.mutate(row.id)
  }

  const canAdd = data.used < data.limit && data.domains.length > 0
  const panel = data.items.filter((row) => row.panel)
  const extra = data.items.filter((row) => !row.panel)

  return (
    <div className="px-4 py-3">
      <div className="panel-shell-card flex flex-col gap-3 p-3.5">
        <SectionHeader
          icon={<Globe2 />}
          title={t('hosting.sub.title')}
          subtitle={data.limit > 0 ? t('hosting.sub.quota', { used: data.used, limit: data.limit }) : t('hosting.sub.panelOnly')}
          actions={
            data.limit > 0 ? (
              <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} disabled={!canAdd} onClick={() => setOpen(true)}>
                {t('hosting.sub.add')}
              </Button>
            ) : undefined
          }
        />

        {data.domains.length === 0 ? <p className="text-[12px] text-[var(--text-secondary)]">{t('hosting.sub.noDomains')}</p> : null}
        {data.used >= data.limit && data.limit > 0 ? <p className="text-[12px] text-[var(--text-secondary)]">{t('hosting.sub.full')}</p> : null}

        {data.items.length > 0 ? (
          <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)]">
            {[...panel, ...extra].map((row) => (
              <li key={row.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_5.5rem] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="panel-mono truncate text-[13px] font-semibold">{row.hostname}</span>
                    <Badge tone={TONE[row.status]} dot>{t(`hosting.sub.status.${row.status}`)}</Badge>
                    {row.panel ? <Badge tone="primary">{t('hosting.sub.panelBadge')}</Badge> : null}
                  </div>
                  {row.note ? <p className="mt-0.5 text-[11.5px] text-[var(--text-secondary)]">{row.note}</p> : null}
                </div>
                <div className="flex items-center justify-end gap-1">
                  {row.status === 'active' ? (
                    <IconButton label={t('hosting.sub.open')} tone="primary" onClick={() => window.open(`https://${row.hostname}`, '_blank', 'noopener,noreferrer')}>
                      <ExternalLink className="h-4 w-4" />
                    </IconButton>
                  ) : null}
                  {row.panel ? null : (
                    <IconButton label={t('common.delete')} tone="danger" onClick={() => void confirmDelete(row)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[var(--text-secondary)]">{t('hosting.sub.empty')}</p>
        )}
      </div>

      <SubdomainModal
        open={open}
        domains={data.domains}
        saving={create.isPending}
        error={error}
        onClose={() => {
          setOpen(false)
          setError('')
        }}
        onCreate={(body) => create.mutate(body)}
      />
    </div>
  )
}
