import { Server, Smartphone } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import { useI18n } from '@/lib/i18n'
import { SpeedHistory } from './speedtest/SpeedHistory'
import { SpeedPanel } from './speedtest/SpeedPanel'
import { SpeedServerPicker } from './speedtest/SpeedServerPicker'
import { useSpeedtestWindow, type SpeedTab } from './speedtest/useSpeedtestWindow'

// Speed test: this device to the panel (everyone) and the panel to the internet (superadmin)
export function SpeedtestWindow() {
  const { t } = useI18n()
  const { tab, setTab, isSuperadmin, browser, server, history, servers, selected, setServerId } = useSpeedtestWindow()
  const active: SpeedTab = isSuperadmin ? tab : 'browser'
  const run = active === 'browser' ? browser : server
  // switching tabs mid-test would hide the one that is running
  const locked = browser.running || server.running

  // the latest test of this kind before the one on screen, for the percent change
  const sameKind = history.filter((item) => item.kind === active)
  const previous = (run.running || !run.result ? sameKind[0] : sameKind[1]) ?? null
  const uploadAvailable = active === 'browser' ? true : (run.result?.canUpload ?? selected?.canUpload ?? true)

  return (
    <div className="panel-window flex h-full flex-col overflow-hidden">
      <div className="panel-window__body min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
        {isSuperadmin ? (
          <Tabs
            label={t('speedtest.tabs')}
            value={active}
            onChange={(key) => {
              if (!locked) setTab(key)
            }}
            items={[
              { key: 'browser', label: t('speedtest.tab.browser'), icon: <Smartphone size={14} /> },
              { key: 'server', label: t('speedtest.tab.server'), icon: <Server size={14} /> },
            ]}
          />
        ) : null}

        <SpeedPanel
          key={active}
          title={t(`speedtest.${active}.title`)}
          subtitle={t(`speedtest.${active}.subtitle`)}
          toolbar={
            active === 'server' && servers.data ? (
              <SpeedServerPicker servers={servers.data} value={selected?.id ?? ''} onChange={setServerId} disabled={server.running} />
            ) : (
              <p className="speed-picker__host">{t('speedtest.browser.target', { host: window.location.host })}</p>
            )
          }
          live={run.live}
          result={run.result}
          previous={previous}
          running={run.running}
          uploadAvailable={uploadAvailable}
          onStart={run.start}
          onStop={run.stop}
        />

        <SpeedHistory items={history.filter((item) => isSuperadmin || item.kind === 'browser')} />
      </div>
    </div>
  )
}
