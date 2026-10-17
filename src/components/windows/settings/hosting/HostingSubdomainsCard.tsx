import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Link2, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteSubdomainAsAdmin, listAllSubdomains, setSubdomainStatus, type Subdomain, type SubdomainStatus } from '@/api/hosting'
import { Badge } from '@/components/ui/Badge'
import { EntityRow } from '@/components/ui/EntityRow'
import { IconBadge } from '@/components/ui/IconBadge'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const TONE: Record<SubdomainStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', pending: 'warning', error: 'danger', suspended: 'neutral' }

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// Every subdomain sold, who holds it, and the means to suspend or release one
export function HostingSubdomainsCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['hosting', 'subdomains'], queryFn: listAllSubdomains, retry: 0, refetchInterval: 30_000 })
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
    onError: (error) => toast.error(apiError(error, t('hosting.sub.createFailed'))),
  })

  const confirmDelete = async (row: Subdomain) => {
    const ok = await alertLib.confirm(t('hosting.sub.deleteTitle'), t('hosting.sub.adminDeleteMessage', { hostname: row.hostname, username: row.username ?? '' }), t('common.delete'), t('common.cancel'), 'warning', 'settings')
    if (ok) remove.mutate(row.id)
  }

  return (
    <div className="panel-shell-card flex flex-col gap-4 settings-card">
      <SectionHeader icon={<Link2 />} title={t('hosting.subs.title')} subtitle={t('hosting.subs.subtitle')} />

      {list.isLoading ? (
        <LoadingState>{t('hosting.subs.loading')}</LoadingState>
      ) : list.isError ? (
        <ErrorState title={t('hosting.subs.loadFailed')} hint={t('hosting.plans.loadFailedHint')} />
      ) : list.data && list.data.length > 0 ? (
        <div className="flex flex-col gap-2">
          {list.data.map((row) => (
            <EntityRow
              key={row.id}
              leading={<IconBadge tone={TONE[row.status] === 'neutral' ? 'neutral' : TONE[row.status]}><Link2 /></IconBadge>}
              title={<span className="panel-mono">{row.hostname}</span>}
              badges={<Badge tone={TONE[row.status]} dot>{t(`hosting.sub.status.${row.status}`)}</Badge>}
              subtitle={t('hosting.subs.owner', { username: row.username ?? '-' })}
              meta={row.note ? <span className="text-[11.5px] text-[var(--text-secondary)]">{row.note}</span> : undefined}
              actions={
                <div className="flex items-center gap-1">
                  {row.status === 'suspended' ? (
                    <IconButton label={t('hosting.subs.lift')} tone="success" disabled={status.isPending} onClick={() => status.mutate({ id: row.id, next: 'active' })}>
                      <RotateCcw className="h-4 w-4" />
                    </IconButton>
                  ) : (
                    <IconButton label={t('hosting.subs.suspend')} tone="warning" disabled={status.isPending} onClick={() => status.mutate({ id: row.id, next: 'suspended' })}>
                      <Ban className="h-4 w-4" />
                    </IconButton>
                  )}
                  <IconButton label={t('common.delete')} tone="danger" onClick={() => void confirmDelete(row)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Link2 size={18} />}>{t('hosting.subs.empty')}</EmptyState>
      )}
    </div>
  )
}
