import { Play, Square } from 'lucide-react'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/lib/i18n'
import { SpeedHistory } from './speedtest/SpeedHistory'
import { SpeedPanel } from './speedtest/SpeedPanel'
import { SpeedServerNotice } from './speedtest/SpeedServerNotice'
import { SpeedServerPicker } from './speedtest/SpeedServerPicker'
import { useSpeedtestWindow, type SpeedTab } from './speedtest/useSpeedtestWindow'

// Speed test: this device to the panel (everyone) and the panel to the internet (superadmin)
export function SpeedtestWindow() {
  const { t } = useI18n()
  const { tab, setTab, isSuperadmin, browser, server, history, clearHistory, servers, selected, setServerId } = useSpeedtestWindow()
  const active: SpeedTab = isSuperadmin ? tab : 'browser'
  const run = active === 'browser' ? browser : server
  // switching tabs mid-test would hide the one that is running
  const locked = browser.running || server.running

  // the latest test of this kind before the one on screen, for the percent change
  const sameKind = history.filter((item) => item.kind === active)
  const previous = (run.running || !run.result ? sameKind[0] : sameKind[1]) ?? null
  const uploadAvailable = active === 'browser' ? true : (run.result?.canUpload ?? selected?.canUpload ?? true)
  const startDisabled = active === 'server' && selected !== null && !selected.available

  const hostText = active === 'server'
    ? selected?.host
    : t('speedtest.browser.target', { host: window.location.host })

  const serverName = active === 'server'
    ? (selected?.name ?? 'Cloudflare')
    : t('speedtest.tab.browser')

  return (
    <div className="panel-window docker-window-root relative overflow-hidden">
      <div className="docker-topbar flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 sm:px-4 sm:py-2">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isSuperadmin ? (
            <FilterMenu
              label={t('speedtest.tabs')}
              value={active}
              onChange={(key) => {
                if (!locked) setTab(key as SpeedTab)
              }}
              items={[
                { key: 'browser', label: t('speedtest.tab.browser') },
                { key: 'server', label: t('speedtest.tab.server') },
              ]}
            />
          ) : (
            <span className="text-[0.8125rem] font-semibold text-[var(--win-text)]">{t('speedtest.tab.browser')}</span>
          )}

          {run.running ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={run.stop}
              className="!h-8 !px-3 font-medium shrink-0"
            >
              <Square className="h-3 w-3 fill-current mr-1.5" strokeWidth={1.75} />
              <span>{t('speedtest.stop')}</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={startDisabled}
              onClick={run.start}
              className="!h-8 !px-3 font-medium shrink-0"
            >
              <Play className="h-3 w-3 fill-current mr-1.5" strokeWidth={1.75} />
              <span>{run.result ? t('speedtest.again') : t('speedtest.start')}</span>
            </Button>
          )}
        </div>

        {active === 'server' && servers.data ? (
          <div className="w-full sm:w-auto sm:ml-auto min-w-0">
            <SpeedServerPicker
              servers={servers.data}
              value={selected?.id ?? ''}
              onChange={setServerId}
              disabled={server.running}
            />
          </div>
        ) : null}
      </div>

      <div className="panel-window__body min-h-0 flex-1 space-y-4 overflow-y-auto p-3.5 pb-8 sm:pb-3.5">
        <SpeedPanel
          key={active}
          description={t(`speedtest.${active}.subtitle`)}
          hostText={hostText}
          serverName={serverName}
          notice={active === 'server' && selected ? <SpeedServerNotice server={selected} /> : null}
          live={run.live}
          result={run.result}
          previous={previous}
          running={run.running}
          uploadAvailable={uploadAvailable}
        />

        <SpeedHistory
          items={history.filter((item) => isSuperadmin || item.kind === 'browser')}
          onClear={clearHistory}
        />
      </div>
    </div>
  )
}
