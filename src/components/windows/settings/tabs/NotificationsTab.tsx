import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListOrdered, Send, ShieldAlert } from 'lucide-react'
import { getNotifyOverview } from '@/api/notify'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { MyTelegram } from './notify/MyTelegram'
import { OutboxList } from './notify/OutboxList'
import { TelegramCard } from './notify/TelegramCard'
import { ThresholdsTable } from './notify/ThresholdsTable'

type Section = 'channels' | 'queue' | 'thresholds'

// Notices outside the panel (superadmin): the channel, where this account wants the notices, the queue they go through,
// and when an alert about an attack speaks
export function NotificationsTab() {
  const { t } = useI18n()
  const [section, setSection] = useState<Section>('channels')
  const overview = useQuery({ queryKey: ['notify', 'overview'], queryFn: getNotifyOverview, retry: 0, refetchInterval: 15000 })
  const telegram = overview.data?.channels.find((c) => c.kind === 'telegram')

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Tabs
          label={t('notify.sections')}
          value={section}
          onChange={setSection}
          items={[
            { key: 'channels', label: t('notify.section.channels'), icon: <Send size={13} /> },
            { key: 'queue', label: t('notify.section.queue'), icon: <ListOrdered size={13} />, count: overview.data?.failed || undefined },
            { key: 'thresholds', label: t('notify.section.thresholds'), icon: <ShieldAlert size={13} /> },
          ]}
        />
      </div>

      {section === 'channels' ? (
        overview.isLoading ? (
          <LoadingState>{t('notify.loading')}</LoadingState>
        ) : overview.isError || !overview.data ? (
          <ErrorState title={t('notify.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
        ) : (
          <>
            {/* keyed by what is saved, so the form follows the agent after a save */}
            <TelegramCard key={`${telegram?.configured}|${telegram?.enabled}|${telegram?.botUsername}`} channel={telegram} recipient={overview.data.telegram} />
            <MyTelegram channel={telegram} recipient={overview.data.telegram} />
          </>
        )
      ) : null}
      {section === 'queue' ? <OutboxList /> : null}
      {section === 'thresholds' ? <ThresholdsTable /> : null}
    </div>
  )
}
