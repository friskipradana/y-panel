import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Server } from 'lucide-react'
import { toast } from 'sonner'
import { getPublicEngines, getPublicProxy, setPublicProxy, type EngineReport, type PublicEngineName } from '@/api/publicProxy'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import { localizeServerMessage } from '@/lib/serverMessages'
import { OptionCards } from '../OptionCards'

const apiError = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
  return message ? (localizeServerMessage(message) ?? message) : fallback
}

// What each way to serve needs and has on this machine, in a line
function describe(report: EngineReport | undefined, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!report) return ''
  if (report.name === 'builtin') {
    return report.portsBusy && report.portsBusy.length > 0 ? t('publicip.engine.builtinBusy', { ports: report.portsBusy.join(', ') }) : t('publicip.engine.builtinHint')
  }
  if (!report.installed) return t('publicip.engine.notInstalled')
  const parts = [report.version || t('publicip.engine.installed'), report.running ? t('publicip.engine.running') : t('publicip.engine.stopped')]
  if (!report.certbot) parts.push(t('publicip.engine.noCertbot'))
  if (report.missing && report.missing.length > 0) parts.push(t('publicip.engine.modules', { modules: report.missing.join(', ') }))
  return parts.join(' · ')
}

// Who serves the domains: the proxy of Reneo, or the nginx or Apache that this machine already runs. Either way the domains and the
// certificates are the same; with a web server Reneo writes its own files in its config folder and never touches the rest.
export function PublicEngineCard() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const status = useQuery({ queryKey: ['public-proxy'], queryFn: getPublicProxy, retry: 0 })
  const engines = useQuery({ queryKey: ['public-proxy', 'engines'], queryFn: getPublicEngines, retry: 0, staleTime: 30_000 })

  const choose = useMutation({
    mutationFn: (engine: PublicEngineName) => setPublicProxy({ engine }),
    onSuccess: (next) => {
      qc.setQueryData(['public-proxy'], next)
      void qc.invalidateQueries({ queryKey: ['public-proxy', 'routes'] })
      toast.success(t('publicip.saved'))
    },
    onError: (e) => toast.error(apiError(e, t('publicip.saveFailed'))),
  })

  const data = status.data
  if (!data) return null
  const report = (name: PublicEngineName) => engines.data?.find((e) => e.name === name)
  const current = data.engine
  const pick = async (engine: PublicEngineName) => {
    if (engine === current || choose.isPending) return
    // changing it while the domains are served restarts the serving
    if (data.running) {
      const ok = await alertLib.confirm(t('publicip.engine.switchTitle'), t('publicip.engine.switchMessage', { engine: t(`publicip.engine.${engine}`) }), t('publicip.engine.switch'), t('common.cancel'), 'warning', 'settings')
      if (!ok) return
    }
    choose.mutate(engine)
  }
  const selected = report(current)

  return (
    <div className="panel-shell-card flex flex-col settings-card !p-3.5 !gap-3.5">
      <SectionHeader
        icon={<Server />}
        title={t('publicip.engine.title')}
        subtitle={t('publicip.engine.subtitle')}
        tone="primary"
        className="mb-0"
        actions={
          <Button variant="outline" size="sm" icon={<RefreshCw className={`h-3.5 w-3.5 ${engines.isFetching ? 'animate-spin' : ''}`} />} onClick={() => void engines.refetch()}>
            {t('publicip.engine.recheck')}
          </Button>
        }
      />
      <OptionCards
        label={t('publicip.engine.title')}
        value={current}
        onChange={(engine) => void pick(engine)}
        options={(['builtin', 'nginx', 'apache'] as PublicEngineName[]).map((name) => ({
          key: name,
          label: t(`publicip.engine.${name}`),
          description: engines.isLoading ? t('publicip.loading') : describe(report(name), t),
        }))}
      />
      {current !== 'builtin' ? <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('publicip.engine.webNote', { dir: selected?.confDir ?? '-' })}</p> : null}
      {current === 'builtin' && selected?.portsBusy && selected.portsBusy.length > 0 && !data.running ? (
        <p className="panel-muted-block px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--panel-warning-text)]">{t('publicip.engine.busyAdvice')}</p>
      ) : null}
    </div>
  )
}
