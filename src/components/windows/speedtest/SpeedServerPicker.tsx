import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { useI18n } from '@/lib/i18n'
import type { SpeedServer } from '@/api/speedtest'
import { SpeedServerNotice } from './SpeedServerNotice'

interface SpeedServerPickerProps {
  servers: SpeedServer[]
  value: string
  onChange: (id: string) => void
  disabled: boolean
}

// Which public speed test server the panel measures against
export function SpeedServerPicker({ servers, value, onChange, disabled }: SpeedServerPickerProps) {
  const { t } = useI18n()
  const selected = servers.find((server) => server.id === value)
  return (
    <div className="speed-picker">
      <label htmlFor="speedtest-server" className="panel-section-label">
        {t('speedtest.serverLabel')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          id="speedtest-server"
          className="min-w-[14rem] flex-1"
          value={selected?.id ?? ''}
          onChange={onChange}
          disabled={disabled}
          options={servers.map((server) => ({
            value: server.id,
            label: server.id === 'auto' ? t('speedtest.serverAuto') : `${server.name}, ${server.location}`,
            description: server.id === 'auto' ? t('speedtest.serverAutoHint') : server.host,
            badge: !server.available ? t('speedtest.needsSetup') : server.engine !== 'http' ? t(`speedtest.engine.${server.engine}`) : server.canUpload ? undefined : t('speedtest.downloadOnly'),
          }))}
        />
        {selected && !selected.canUpload ? <Badge tone="warning">{t('speedtest.downloadOnly')}</Badge> : null}
      </div>
      {selected ? <p className="speed-picker__host">{selected.host}</p> : null}
      {selected ? <SpeedServerNotice server={selected} /> : null}
    </div>
  )
}
