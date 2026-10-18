import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListOrdered, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { listOutbox, retryOutbox, type OutboxItem, type OutboxStatus } from '@/api/notify'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { EntityRow } from '@/components/ui/EntityRow'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'

const TONE: Record<OutboxStatus, 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  sending: 'info',
  sent: 'success',
  failed: 'danger',
  cancelled: 'neutral',
}
const FILTERS: ('' | OutboxStatus)[] = ['', 'failed', 'pending', 'sent', 'cancelled']

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// the message as plain text: the catalog's few tags are for Telegram, not for this list
const plain = (text: string) => text.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')

// The queue: what was sent, what waits, and what failed with the reason, moving by itself while it is open
export function OutboxList() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'' | OutboxStatus>('')
  const list = useQuery({ queryKey: ['notify', 'outbox', filter], queryFn: () => listOutbox(filter), retry: 0, refetchInterval: 4000 })

  const retry = useMutation({
    mutationFn: (id: number) => retryOutbox(id),
    onSuccess: () => {
      toast.success(t('notify.queue.retried'))
      void qc.invalidateQueries({ queryKey: ['notify'] })
    },
    onError: (error) => toast.error(apiError(error, t('notify.queue.retryFailed'))),
  })

  return (
    <div className="panel-shell-card flex flex-col gap-4 settings-card">
      <SectionHeader
        icon={<ListOrdered />}
        title={t('notify.queue.title')}
        subtitle={t('notify.queue.subtitle')}
        actions={
          <FilterMenu
            label={t('notify.queue.filter')}
            value={filter}
            onChange={(key) => setFilter(key as '' | OutboxStatus)}
            items={FILTERS.map((key) => ({
              key,
              label: key === '' ? t('notify.queue.all') : t(`notify.status.${key}`),
              count: key === 'failed' ? list.data?.failed : key === 'pending' ? list.data?.pending : undefined,
            }))}
          />
        }
      />

      {list.isLoading ? (
        <LoadingState>{t('notify.queue.loading')}</LoadingState>
      ) : list.isError ? (
        <ErrorState title={t('notify.queue.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
      ) : list.data && list.data.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {list.data.items.map((item: OutboxItem) => (
            <EntityRow
              key={item.id}
              title={<span className="text-[13px] font-semibold">{t(`notify.event.${item.event}`)}</span>}
              badges={<Badge tone={TONE[item.status]} dot size="sm">{t(`notify.status.${item.status}`)}</Badge>}
              subtitle={
                <span className="line-clamp-2 text-[12px] text-[var(--text-secondary)]">
                  {plain(item.text)}
                </span>
              }
              meta={
                <span className="panel-mono text-[11px] text-[var(--text-secondary)]">
                  {item.username || '-'} · {item.address} · <DateTimeText value={item.sentAt ?? item.createdAt} />
                  {item.attempts > 1 ? ` · ${t('notify.queue.attempts', { count: item.attempts })}` : ''}
                  {item.providerStatus ? ` · ${t(`notify.provider.${item.providerStatus}`)}` : ''}
                  {item.error ? ` · ${item.error}` : ''}
                </span>
              }
              actions={
                item.status === 'failed' || item.status === 'cancelled' ? (
                  <IconButton label={t('notify.queue.retry')} disabled={retry.isPending} onClick={() => retry.mutate(item.id)}>
                    <RotateCw className="h-4 w-4" />
                  </IconButton>
                ) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={<ListOrdered size={18} />}>{t('notify.queue.empty')}</EmptyState>
      )}
    </div>
  )
}
