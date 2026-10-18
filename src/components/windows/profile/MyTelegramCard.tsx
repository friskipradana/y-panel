import { useQuery } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { getMyTelegramOverview } from '@/api/notify'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { MyTelegram } from '@/components/windows/settings/tabs/notify/MyTelegram'
import { useI18n } from '@/lib/i18n'

// The Telegram of this account, for the roles that have no Settings > Notifications: the owner sets the bot up once,
// and each account links its own chat to get its security notices there
export function MyTelegramCard({ groups }: { groups: readonly string[] }) {
  const { t } = useI18n()
  const overview = useQuery({ queryKey: ['notify', 'overview'], queryFn: getMyTelegramOverview, retry: 0 })
  if (overview.isLoading) {
    return (
      <div className="panel-shell-card flex flex-col gap-4 settings-card">
        <SectionHeader icon={<Link2 />} title={t('notify.me.title')} subtitle={t('notify.me.subtitle')} />
        <LoadingState>{t('notify.loading')}</LoadingState>
      </div>
    )
  }
  if (overview.isError || !overview.data) {
    return (
      <div className="panel-shell-card flex flex-col gap-4 settings-card">
        <SectionHeader icon={<Link2 />} title={t('notify.me.title')} subtitle={t('notify.me.subtitle')} />
        <ErrorState title={t('notify.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
      </div>
    )
  }
  const channel = overview.data.channels.find((c) => c && c.kind === 'telegram')
  return <MyTelegram channel={channel} recipient={overview.data.telegram} groups={groups} />
}
