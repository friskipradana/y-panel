import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/api/notifications'
import { DateTimeText } from '@/components/common/DateTimeText'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'

const TONE = { info: 'info', success: 'success', warning: 'warning', error: 'danger' } as const
const KEY = ['mobile-notifications']

// Phone bell: unread count in the top bar, latest notifications in a sheet
export function MobileNotifications() {
  const { t } = useI18n()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const query = useQuery({ queryKey: KEY, queryFn: listNotifications, refetchInterval: 30_000 })
  const items = (query.data ?? []).slice(0, 20)
  const unread = (query.data ?? []).filter((n) => !n.isRead).length

  const markOne = useMutation({ mutationFn: markNotificationRead, onSuccess: () => client.invalidateQueries({ queryKey: KEY }) })
  const markAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: () => client.invalidateQueries({ queryKey: KEY }) })

  return (
    <>
      <span className="relative">
        <IconButton label={t('taskbar.notifications')} onClick={() => setOpen(true)}>
          <Bell className="h-5 w-5" />
        </IconButton>
        {unread > 0 ? (
          <span className="panel-mono pointer-events-none absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--panel-danger-solid)] px-1 text-center text-[0.625rem] leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </span>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('taskbar.notifications')}
        subtitle={t('taskbar.notificationsSubtitle')}
        size="sm"
        footer={
          <Button variant="ghost" disabled={unread === 0} loading={markAll.isPending} onClick={() => markAll.mutate()}>
            {t('taskbar.markAll')}
          </Button>
        }
      >
        {items.length === 0 ? (
          <EmptyState icon={<Bell />}>{t('taskbar.noNotifications')}</EmptyState>
        ) : (
          <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)]">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.isRead && markOne.mutate(n.id)}
                  className="flex w-full flex-col gap-1 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <Badge tone={TONE[n.type] ?? 'neutral'} dot={!n.isRead}>
                      {n.title}
                    </Badge>
                  </span>
                  <span className="text-[0.8125rem] text-[var(--win-text)]">{n.body}</span>
                  <DateTimeText value={n.createdAt} className="text-[0.75rem] text-[var(--text-secondary)]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}
