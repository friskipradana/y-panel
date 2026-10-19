import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { getWahaDashboardHost, openWahaDashboard, setWahaDashboardHost } from '@/api/notify'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The address the WAHA dashboard answers on, and the button that opens it. The dashboard is only for the superadmin: the
// button asks the panel for a link that works once, and without it the address shows nothing.
export function WahaDashboard({ running }: { running: boolean }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const saved = useQuery({ queryKey: ['notify', 'waha-dashboard'], queryFn: getWahaDashboardHost, retry: 0 })
  const [host, setHost] = useState('')
  useEffect(() => {
    if (saved.data) setHost(saved.data.host)
  }, [saved.data])

  const save = useMutation({
    mutationFn: () => setWahaDashboardHost(host.trim()),
    onSuccess: (data) => {
      qc.setQueryData(['notify', 'waha-dashboard'], data)
      toast.success(data.host ? t('notify.waha.hostSaved') : t('notify.waha.hostCleared'))
    },
    onError: (error) => toast.error(apiError(error, t('notify.waha.hostFailed'))),
  })
  const open = useMutation({
    mutationFn: openWahaDashboard,
    onSuccess: (data) => window.open(data.url, '_blank', 'noopener,noreferrer'),
    onError: (error) => toast.error(apiError(error, t('notify.waha.openFailed'))),
  })

  const current = saved.data?.host ?? ''
  const dirty = host.trim().toLowerCase() !== current

  return (
    <div className="flex flex-col gap-2.5">
      <p>{t('notify.waha.dashboardOpenHint')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Field label={t('notify.waha.hostLabel')} htmlFor="waha-dashboard-host" hint={t('notify.waha.hostHint')}>
            <TextInput
              id="waha-dashboard-host"
              mono
              autoComplete="off"
              placeholder="waha.example.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </Field>
        </div>
        <Button variant="outline" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
      <div>
        <Button
          variant="primary-soft"
          icon={<ExternalLink className="h-3.5 w-3.5" />}
          disabled={!running || current === '' || dirty}
          loading={open.isPending}
          onClick={() => open.mutate()}
        >
          {t('notify.waha.openDashboard')}
        </Button>
      </div>
    </div>
  )
}
