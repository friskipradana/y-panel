import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Globe2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { getWahaDashboardHost, openWahaDashboard, setWahaDashboardHost } from '@/api/notify'
import { Button } from '@/components/ui/Button'
import { RouteDomainModal, type RouteSubject } from '@/components/windows/tunnels/RouteDomainModal'
import { useI18n } from '@/lib/i18n'

const apiError = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback

// The address the WAHA dashboard answers on, and the button that opens it. The address is made like the domain of a
// container or a project: the same dialog points a domain of Cloudflare at the panel through a tunnel. The dashboard is only
// for the superadmin: the button asks the panel for a link that works once, and without it the address shows nothing.
export function WahaDashboard({ running }: { running: boolean }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const saved = useQuery({ queryKey: ['notify', 'waha-dashboard'], queryFn: getWahaDashboardHost, retry: 0 })
  const [routing, setRouting] = useState(false)

  const current = saved.data?.host ?? ''
  const port = saved.data?.panelPort ?? 0

  const save = useMutation({
    mutationFn: (host: string) => setWahaDashboardHost(host),
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

  // the route leads to the panel, not to WAHA: the panel is what lets only the superadmin in
  const subject: RouteSubject | null =
    routing && port > 0
      ? { id: 'waha-dashboard', name: 'waha', kind: 'waha', targets: [{ key: `panel:${port}`, host: 'localhost', port, label: t('notify.waha.routeTarget', { port }) }] }
      : null

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11.5px] leading-relaxed text-[var(--text-secondary)]">{t('notify.waha.dashboardOpenHint')}</p>

      {current ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--win-content-bg)] px-3 py-2 text-[12px]">
          <div className="min-w-0 flex items-center gap-2">
            <Globe2 className="h-3.5 w-3.5 shrink-0 text-[var(--panel-primary-text)]" />
            <span className="text-[11.5px] text-[var(--text-secondary)]">{t('notify.waha.hostLabel')}:</span>
            <span className="panel-mono font-semibold text-[var(--win-text)] truncate">{current}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="primary-soft" size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />} disabled={!running} loading={open.isPending} onClick={() => open.mutate()}>
              {t('notify.waha.openDashboard')}
            </Button>
            <Button variant="outline" size="sm" icon={<Globe2 className="h-3.5 w-3.5" />} disabled={port === 0} onClick={() => setRouting(true)}>
              {t('notify.waha.changeDomain')}
            </Button>
            <Button variant="ghost" size="sm" icon={<Unlink className="h-3.5 w-3.5" />} loading={save.isPending} onClick={() => save.mutate('')}>
              {t('notify.waha.detach')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--win-border)] bg-[var(--win-content-bg)] px-3 py-2">
          <span className="text-[12px] text-[var(--text-secondary)]">{t('notify.waha.noDomain')}</span>
          <Button variant="primary" size="sm" icon={<Globe2 className="h-3.5 w-3.5" />} disabled={port === 0} onClick={() => setRouting(true)}>
            {t('notify.waha.connectDomain')}
          </Button>
        </div>
      )}

      <RouteDomainModal subject={subject} onClose={() => setRouting(false)} onConnected={(hostname) => save.mutate(hostname)} />
    </div>
  )
}
