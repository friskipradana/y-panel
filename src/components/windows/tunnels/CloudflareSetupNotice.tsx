import { AlertTriangle } from 'lucide-react'
import type { TunnelsWindowState } from './useTunnelsWindow'

export function CloudflareSetupNotice({ tw }: { tw: TunnelsWindowState }) {
  const {
    t,
    cfNotConfigured,
  } = tw
  if (!(cfNotConfigured)) return null

  return (
    <div className="px-4 pt-3">
      <div className="panel-alert">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>{t('tunnels.notConfigured')}</span>
      </div>
    </div>
  )
}
