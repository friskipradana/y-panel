import { Server, Smartphone } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import { useI18n } from '@/lib/i18n'
import { SpeedHistory } from './speedtest/SpeedHistory'
import { SpeedPanel } from './speedtest/SpeedPanel'
import { useSpeedtestWindow } from './speedtest/useSpeedtestWindow'

// Speed test: this device to the panel (everyone) and the panel to the internet (superadmin)
export function SpeedtestWindow() {
  const { t } = useI18n()
  const state = useSpeedtestWindow()
  const { tab, setTab, isSuperadmin, serverMutation } = state
  const active = isSuperadmin ? tab : 'browser'

  return (
    <div className="panel-window flex h-full flex-col overflow-hidden">
      <div className="panel-window__body min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
        {isSuperadmin ? (
          <Tabs
            label={t('speedtest.tabs')}
            value={active}
            onChange={setTab}
            items={[
              { key: 'browser', label: t('speedtest.tab.browser'), icon: <Smartphone size={14} /> },
              { key: 'server', label: t('speedtest.tab.server'), icon: <Server size={14} /> },
            ]}
          />
        ) : null}

        {active === 'browser' ? (
          <SpeedPanel
            title={t('speedtest.browser.title')}
            subtitle={t('speedtest.browser.subtitle')}
            result={state.browserResult}
            progress={state.progress}
            running={state.runningBrowser}
            onStart={() => void state.startBrowser()}
            onStop={state.stopBrowser}
          />
        ) : (
          <SpeedPanel
            title={t('speedtest.server.title')}
            subtitle={t('speedtest.server.subtitle')}
            result={serverMutation.data ?? null}
            running={serverMutation.isPending}
            onStart={() => serverMutation.mutate()}
            busyHint={t('speedtest.server.busy')}
          />
        )}

        <SpeedHistory items={state.history.filter((item) => isSuperadmin || item.kind === 'browser')} />
      </div>
    </div>
  )
}
