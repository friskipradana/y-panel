import { Cloud, Plus, RefreshCw } from 'lucide-react'
import type { WindowState } from '@/types'
import { Button } from '@/components/ui/Button'
import { FilterMenu } from '@/components/ui/FilterMenu'
import { IconButton } from '@/components/ui/IconButton'
import { SearchInput } from '@/components/ui/SearchInput'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { BackupsModals } from './backups/BackupsModals'
import { BackupsSections } from './backups/BackupsSections'
import { useBackupsWindow, type BackupSection } from './backups/useBackupsWindow'

interface BackupsWindowProps {
  win: WindowState
  authenticated: boolean
}

export function BackupsWindow({ win, authenticated }: BackupsWindowProps) {
  const isMobile = useIsMobileLayout()
  const bw = useBackupsWindow(win, authenticated)
  const { t, section, setSection, search, setSearch, overviewQ, refresh, setAddJobOpen, setAddTargetOpen } = bw

  const data = overviewQ.data
  const filterItems = [
    { key: 'jobs', label: t('backups.tab.jobs'), count: data?.jobs.length },
    { key: 'runs', label: t('backups.tab.runs'), count: data?.runs.length },
    { key: 'targets', label: t('backups.tab.targets'), count: data?.targets.length },
  ]

  const hasTargets = (data?.targets.length ?? 0) > 0
  const actions = (
    <>
      <Button
        variant={hasTargets ? 'outline' : 'primary'}
        icon={<Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />}
        onClick={() => setAddTargetOpen(true)}
      >
        {t('backups.addTarget')}
      </Button>
      {hasTargets ? (
        <Button
          variant="primary"
          icon={<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />}
          onClick={() => setAddJobOpen(true)}
        >
          {t('backups.addJob')}
        </Button>
      ) : null}
      <IconButton variant="outline" label={t('common.refresh')} onClick={refresh}>
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
      </IconButton>
    </>
  )

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      {isMobile ? (
        <div className="docker-topbar docker-topbar--mobile">
          <div className="docker-topbar__row flex-wrap">
            <FilterMenu label={t('backups.sections')} value={section} onChange={(v) => setSection(v as BackupSection)} items={filterItems} />
            {actions}
          </div>
          <div className="docker-topbar__row">
            <SearchInput className="flex-1" value={search} onChange={setSearch} placeholder={t('backups.searchPlaceholder')} />
          </div>
        </div>
      ) : (
        <div className="docker-topbar">
          <div className="docker-topbar__left">
            <FilterMenu label={t('backups.sections')} value={section} onChange={(v) => setSection(v as BackupSection)} items={filterItems} />
          </div>
          <div className="docker-topbar__right">
            <SearchInput value={search} onChange={setSearch} placeholder={t('backups.searchPlaceholder')} />
            {actions}
          </div>
        </div>
      )}

      <BackupsSections bw={bw} />
      <BackupsModals bw={bw} />
    </div>
  )
}
