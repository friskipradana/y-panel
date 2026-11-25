import { Cloud, Plus, RefreshCw } from 'lucide-react'
import type { WindowState } from '@/types'
import { Button } from '@/components/ui/Button'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { SearchInput } from '@/components/ui/SearchInput'
import { BackupsModals } from './backups/BackupsModals'
import { BackupsSections } from './backups/BackupsSections'
import { useBackupsWindow, type BackupSection } from './backups/useBackupsWindow'

interface BackupsWindowProps {
  win: WindowState
  authenticated: boolean
}

export function BackupsWindow({ win, authenticated }: BackupsWindowProps) {
  const bw = useBackupsWindow(win, authenticated)
  const { t, section, setSection, search, setSearch, overviewQ, refresh, setAddJobOpen, setAddTargetOpen } = bw

  const data = overviewQ.data

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      <div className="docker-topbar">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <FilterMenu
            label={t('backups.sections')}
            value={section}
            onChange={(v) => setSection(v as BackupSection)}
            items={[
              { key: 'jobs', label: t('backups.tab.jobs'), count: data?.jobs.length },
              { key: 'runs', label: t('backups.tab.runs'), count: data?.runs.length },
              { key: 'targets', label: t('backups.tab.targets'), count: data?.targets.length },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder={t('backups.searchPlaceholder')} />
          <Button size="sm" variant="ghost" onClick={() => setAddTargetOpen(true)}>
            <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('backups.addTarget')}</span>
          </Button>
          <Button size="sm" variant="primary" disabled={(data?.targets.length ?? 0) === 0} onClick={() => setAddJobOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('backups.addJob')}</span>
          </Button>
          <IconButton size="sm" variant="outline" label={t('common.refresh')} onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      <BackupsSections bw={bw} />
      <BackupsModals bw={bw} />
    </div>
  )
}
