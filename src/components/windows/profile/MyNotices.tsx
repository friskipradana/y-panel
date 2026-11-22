import { useQuery } from '@tanstack/react-query'
import { getNotifyMode } from '@/api/notify'
import { MyTelegramCard } from '@/components/windows/profile/MyTelegramCard'
import { MyWhatsAppCard } from '@/components/windows/profile/MyWhatsAppCard'
import { OwnBotCard } from '@/components/windows/profile/OwnBotCard'
import { WhatsAppVerifyCard } from '@/components/windows/profile/WhatsAppVerifyCard'
import { useI18n } from '@/lib/i18n'

// Where this account gets its notices, by what its plan allows. A plan that brings its own channels: the account's own
// Telegram bot (its token) and its own WhatsApp (scanned). Any other plan follows the server: a chat linked to the bot of
// the seller, and a WhatsApp number proved with a code. Shared by the Profile window and Settings > Notifications.
export function MyNotices() {
  const { t } = useI18n()
  const mode = useQuery({ queryKey: ['notify', 'mode'], queryFn: getNotifyMode, retry: 0 })
  const own = !!mode.data?.own
  // an account that already scanned a phone keeps it, whatever its plan says now
  const ownWhatsApp = own || !!mode.data?.hasSession

  return (
    <div className="flex flex-col gap-3">
      {mode.data ? <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t(own ? 'notify.mode.own' : 'notify.mode.server')}</p> : null}
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @[720px]:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            {own ? <OwnBotCard /> : null}
            {mode.data && !own && !mode.data.serverTelegram ? <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('notify.mode.telegramOff')}</p> : null}
            <MyTelegramCard groups={['security']} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {ownWhatsApp ? <MyWhatsAppCard groups={['security', 'buyer']} /> : <WhatsAppVerifyCard groups={['security', 'buyer']} />}
          </div>
        </div>
      </div>
    </div>
  )
}
