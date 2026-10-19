import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, PlugZap, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { connectWhatsApp, disconnectWhatsApp, getMyWhatsApp, getWhatsAppQR, setWhatsAppMuted, testWhatsApp, type MyWhatsApp } from '@/api/notify'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SettingRow } from '@/components/ui/SettingRow'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { ErrorState, LoadingState } from '@/components/ui/states'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

const KEY = ['whatsapp', 'me']

// The WhatsApp of this account: connect a phone by scanning a code, and choose which notices come to it.
// `groups` are the kinds of notice this account can get; the owner has more than the others.
export function MyWhatsAppCard({ groups, ownerHint = false, bare }: { groups: readonly string[]; ownerHint?: boolean; bare?: boolean }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: KEY,
    queryFn: getMyWhatsApp,
    retry: 0,
    // while a phone is being connected the page asks every few seconds whether the scan happened
    refetchInterval: (query) => (query.state.data?.status === 'SCAN_QR_CODE' || query.state.data?.status === 'STARTING' ? 3000 : false),
  })
  const data = me.data
  const scanning = data?.status === 'SCAN_QR_CODE'
  const set = (next: MyWhatsApp) => qc.setQueryData(KEY, next)

  const qr = useQuery({ queryKey: ['whatsapp', 'qr'], queryFn: getWhatsAppQR, enabled: scanning, retry: 0, refetchInterval: scanning ? 15000 : false })
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    if (!qr.data) return
    const url = URL.createObjectURL(qr.data)
    setImage(url)
    return () => URL.revokeObjectURL(url)
  }, [qr.data])

  const connect = useMutation({
    mutationFn: connectWhatsApp,
    onSuccess: set,
    onError: (error) => toast.error(apiError(error, t('notify.wa.connectFailed'))),
  })
  const disconnect = useMutation({
    mutationFn: disconnectWhatsApp,
    onSuccess: () => {
      setImage(null)
      void qc.invalidateQueries({ queryKey: KEY })
      void qc.invalidateQueries({ queryKey: ['notify', 'waha'] })
    },
    onError: (error) => toast.error(apiError(error, t('notify.wa.disconnectFailed'))),
  })
  const test = useMutation({
    mutationFn: testWhatsApp,
    onSuccess: () => {
      toast.success(t('notify.wa.testQueued'))
      void qc.invalidateQueries({ queryKey: ['notify', 'outbox'] })
    },
    onError: (error) => toast.error(apiError(error, t('notify.wa.testFailed'))),
  })
  const muted = useMutation({
    mutationFn: setWhatsAppMuted,
    onSuccess: (recipient) => data && set({ ...data, recipient }),
    onError: (error) => toast.error(apiError(error, t('notify.me.saveFailed'))),
  })

  const confirmDisconnect = async () => {
    const ok = await alertLib.confirm(t('notify.wa.disconnectTitle'), t('notify.wa.disconnectMessage'), t('notify.wa.disconnect'), t('common.cancel'), 'warning', 'settings')
    if (ok) disconnect.mutate()
  }
  const toggleGroup = (group: string) => {
    const current = data?.recipient.mutedEvents ?? []
    muted.mutate(current.includes(group) ? current.filter((g) => g !== group) : [...current, group])
  }

  const connected = !!data?.connected && !!data.recipient.linked
  const badge = connected ? (
    <Badge tone="success" dot>{t('notify.me.linked')}</Badge>
  ) : scanning ? (
    <Badge tone="warning" dot>{t('notify.wa.waitingScan')}</Badge>
  ) : undefined

  return (
    <div className={bare ? 'flex flex-col gap-4' : 'panel-shell-card flex flex-col gap-4 settings-card'}>
      <SectionHeader icon={<MessageCircle />} title={t('notify.wa.title')} subtitle={t('notify.wa.subtitle')} actions={badge} />

      {me.isLoading ? (
        <LoadingState>{t('notify.wa.loading')}</LoadingState>
      ) : me.isError || !data ? (
        <ErrorState title={t('notify.wa.loadFailed')} hint={t('notify.queue.loadFailedHint')} />
      ) : !data.available ? (
        <p className="text-[12.5px] text-[var(--text-secondary)]">{ownerHint ? t('notify.wa.offOwner') : t('notify.wa.offUser')}</p>
      ) : connected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2.5 text-[12.5px]">
            <div className="min-w-0">
              <p className="text-[11.5px] text-[var(--text-secondary)]">{t('notify.wa.number')}</p>
              <p className="panel-mono font-semibold">{data.phone}</p>
              <p className="panel-mono text-[11.5px] text-[var(--text-secondary)]">{data.sessionName}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" loading={test.isPending} onClick={() => test.mutate()}>
                {t('notify.telegram.test')}
              </Button>
              <Button variant="danger-soft" size="sm" icon={<Unplug className="h-3.5 w-3.5" />} loading={disconnect.isPending} onClick={() => void confirmDisconnect()}>
                {t('notify.wa.disconnect')}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[12px] font-medium text-[var(--text-secondary)]">{t('notify.me.which')}</p>
            {groups.map((group) => (
              <SettingRow
                key={group}
                title={t(`notify.group.${group}`)}
                description={t(`notify.group.${group}.hint`)}
                control={
                  <ToggleSwitch
                    checked={!data.recipient.mutedEvents.includes(group)}
                    disabled={muted.isPending}
                    label={t(`notify.group.${group}`)}
                    onChange={() => toggleGroup(group)}
                  />
                }
              />
            ))}
          </div>
        </>
      ) : scanning || data.status === 'STARTING' ? (
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 text-[12.5px]">
          <div className="flex min-w-[240px] flex-1 flex-col gap-3">
            <ol className="list-decimal space-y-1.5 pl-4 text-[var(--text-secondary)]">
              <li>{t('notify.wa.step1')}</li>
              <li>{t('notify.wa.step2')}</li>
              <li>{t('notify.wa.step3')}</li>
            </ol>
            {qr.isError ? <p role="alert" className="text-[var(--panel-danger-text)]">{apiError(qr.error, t('notify.wa.qrFailed'))}</p> : null}
            <div>
              <Button variant="ghost" size="sm" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
          <div className="flex h-52 w-52 shrink-0 items-center justify-center rounded-xl border border-[var(--win-border)] bg-white p-2">
            {image && scanning ? (
              <img src={image} alt={t('notify.wa.qrAlt')} className="h-full w-full object-contain" />
            ) : (
              <LoadingState>{t('notify.wa.qrLoading')}</LoadingState>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          {data.status === 'FAILED' ? <p role="alert" className="text-[12px] text-[var(--panel-danger-text)]">{t('notify.wa.failed')}</p> : null}
          <p className="text-[12.5px] text-[var(--text-secondary)]">{t('notify.wa.notConnected')}</p>
          <Button variant="primary" icon={<PlugZap className="h-3.5 w-3.5" />} loading={connect.isPending} onClick={() => connect.mutate()}>
            {t('notify.wa.connect')}
          </Button>
        </div>
      )}
    </div>
  )
}
