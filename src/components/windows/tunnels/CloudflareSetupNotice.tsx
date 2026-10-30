import { AlertTriangle, Settings } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { openCloudflareSettings, useCanOpenCloudflareSettings } from './openCloudflareSettings'
import type { TunnelsWindowState } from './useTunnelsWindow'

export function CloudflareSetupNotice({ tw }: { tw: TunnelsWindowState }) {
  const {
    t,
    cfNotConfigured,
  } = tw
  const canOpen = useCanOpenCloudflareSettings()
  if (!(cfNotConfigured)) return null

  return (
    <div className="px-4 pt-3">
      <div className="panel-alert flex-wrap">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span className="min-w-0 flex-1 basis-56">{canOpen ? t('tunnels.notConfigured') : t('tunnels.notConfiguredDemo')}</span>
        {canOpen ? (
          <Button size="sm" variant="outline" icon={<Settings className="h-3.5 w-3.5" />} onClick={openCloudflareSettings}>
            {t('tunnels.openCloudflareSettings')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
