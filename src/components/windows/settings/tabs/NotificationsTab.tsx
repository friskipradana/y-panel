import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cloud, ListOrdered, MessageCircle, MessageSquareText, Send, ShieldAlert } from 'lucide-react'
import { getNotifyOverview } from '@/api/notify'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { useI18n } from '@/lib/i18n'
import { MyWhatsAppCard } from '@/components/windows/profile/MyWhatsAppCard'
import { CloudCard } from './notify/CloudCard'
import { MyCloudNumber } from './notify/MyCloudNumber'
import { MyTelegram } from './notify/MyTelegram'
import { OutboxList } from './notify/OutboxList'
import { TelegramCard } from './notify/TelegramCard'
import { TemplatesCard } from './notify/TemplatesCard'
import { ThresholdsTable } from './notify/ThresholdsTable'
import { WahaCard } from './notify/WahaCard'

const OWNER_GROUPS = ['security', 'attack', 'order', 'plan', 'domain'] as const

type Section = 'telegram' | 'waha' | 'cloud' | 'templates' | 'queue' | 'thresholds'

export function NotificationsTab() {
  const { t } = useI18n()
  const [section, setSection] = useState<Section>('telegram')
  const overview = useQuery({ queryKey: ['notify', 'overview'], queryFn: getNotifyOverview, retry: 0, refetchInterval: 15000 })
  const telegram = overview.data?.channels.find((c) => c.kind === 'telegram')
  const cloud = overview.data?.channels.find((c) => c.kind === 'whatsapp_cloud')

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Tabs
          label={t('notify.sections')}
          value={section}
          onChange={setSection}
          items={[
            { key: 'telegram', label: t('notify.channel.telegram'), icon: <Send size={13} /> },
            { key: 'waha', label: t('notify.channel.waha'), icon: <MessageCircle size={13} /> },
            { key: 'cloud', label: t('notify.channel.cloud'), icon: <Cloud size={13} /> },
            { key: 'templates', label: t('notify.section.templates'), icon: <MessageSquareText size={13} /> },
            { key: 'queue', label: t('notify.section.queue'), icon: <ListOrdered size={13} />, count: overview.data?.failed || undefined },
            { key: 'thresholds', label: t('notify.section.thresholds'), icon: <ShieldAlert size={13} /> },
          ]}
        />
      </div>

      {section === 'telegram' ? (
        <div className="panel-shell-card settings-card !p-3.5 flex flex-col gap-3.5">
          {overview.isLoading ? (
            <LoadingState>{t('notify.loading')}</LoadingState>
          ) : overview.isError || !overview.data ? (
            <ErrorState title={t('notify.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
          ) : (
            <>
              <TelegramCard
                bare
                key={`${telegram?.configured}|${telegram?.enabled}|${telegram?.botUsername}`}
                channel={telegram}
                recipient={overview.data.telegram}
              />
              <div className="border-t border-[var(--win-border)]" />
              <MyTelegram bare channel={telegram} recipient={overview.data.telegram} />
            </>
          )}
        </div>
      ) : null}

      {section === 'templates' ? (
        <div className="panel-shell-card settings-card !p-3.5">
          <TemplatesCard />
        </div>
      ) : null}

      {section === 'waha' ? (
        <div className="panel-shell-card settings-card !p-3.5 flex flex-col gap-3.5">
          <WahaCard bare />
          <div className="border-t border-[var(--win-border)]" />
          <MyWhatsAppCard bare groups={OWNER_GROUPS} ownerHint />
        </div>
      ) : null}

      {section === 'cloud' ? (
        <div className="panel-shell-card settings-card !p-3.5 flex flex-col gap-3.5">
          {overview.isLoading ? (
            <LoadingState>{t('notify.loading')}</LoadingState>
          ) : overview.isError || !overview.data ? (
            <ErrorState title={t('notify.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
          ) : (
            <>
              <CloudCard
                bare
                key={`${cloud?.configured}|${cloud?.enabled}|${cloud?.phoneId}|${cloud?.wabaId}|${overview.data.cloudWebhook?.secretSet}`}
                channel={cloud}
                webhook={overview.data.cloudWebhook}
              />
              <div className="border-t border-[var(--win-border)]" />
              <MyCloudNumber bare channel={cloud} recipient={overview.data.whatsappCloud} />
            </>
          )}
        </div>
      ) : null}

      {section === 'queue' ? <OutboxList /> : null}
      {section === 'thresholds' ? <ThresholdsTable /> : null}
    </div>
  )
}
