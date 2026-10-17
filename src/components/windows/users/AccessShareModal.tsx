import { useQuery } from '@tanstack/react-query'
import { Copy, Mail, MessageCircle, Send } from 'lucide-react'
import { toast } from 'sonner'
import { copyTextToClipboard } from '@/api/agent'
import { listAllSubdomains } from '@/api/hosting'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Field'
import { useI18n } from '@/lib/i18n'
import { useAuthStore } from '@/store/authStore'

export interface AccessInfo {
  userId: number
  username: string
  displayName: string
  email: string
  password: string
  /** The account has to choose its own password at the first sign-in */
  forcedChange: boolean
  /** Panel address made just now, if any */
  address?: string
}

// The sign-in details of an account an admin just made or reset, as a message ready to send. The
// password is only known here, so the dialog is the one chance to pass it on.
export function AccessShareModal({ info, onClose }: { info: AccessInfo | null; onClose: () => void }) {
  const { t } = useI18n()
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin'
  // the address of the account's own panel when it has one; otherwise the one this panel is opened on
  const subdomains = useQuery({ queryKey: ['hosting', 'subdomains'], queryFn: listAllSubdomains, enabled: !!info && isSuperadmin, staleTime: 10_000, retry: 0 })

  const held = (subdomains.data ?? []).find((row) => row.userId === info?.userId && row.status !== 'suspended')
  const address = info?.address ?? (held ? `https://${held.hostname}` : window.location.origin)
  const message = info
    ? t(info.forcedChange ? 'users.access.messageForced' : 'users.access.message', {
        name: info.displayName || info.username,
        address,
        username: info.username,
        password: info.password,
      })
    : ''

  const copy = () => {
    void copyTextToClipboard(message).then(() => toast.success(t('users.access.copied')))
  }

  return (
    <Modal
      open={!!info}
      onClose={onClose}
      title={t('users.access.title')}
      subtitle={info?.username}
      icon={<Send />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          <Button
            variant="outline"
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')}
          >
            {t('users.access.whatsapp')}
          </Button>
          {info?.email ? (
            <Button
              variant="outline"
              icon={<Mail className="h-3.5 w-3.5" />}
              onClick={() => {
                window.location.href = `mailto:${encodeURIComponent(info.email)}?subject=${encodeURIComponent(t('users.access.subject'))}&body=${encodeURIComponent(message)}`
              }}
            >
              {t('users.access.email')}
            </Button>
          ) : null}
          <Button variant="primary" icon={<Copy className="h-3.5 w-3.5" />} onClick={copy}>
            {t('users.access.copy')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-xl border border-[var(--panel-warning-text)]/40 bg-[var(--panel-warning-bg)] p-3 text-[0.8125rem] text-[var(--panel-warning-text)]">{t('users.access.warning')}</p>
        <Textarea mono readOnly rows={9} value={message} onFocus={(e) => e.currentTarget.select()} aria-label={t('users.access.title')} />
        <p className="text-[0.75rem] text-[var(--text-secondary)]">{info?.forcedChange ? t('users.access.forcedHint') : t('users.access.notForcedHint')}</p>
      </div>
    </Modal>
  )
}
