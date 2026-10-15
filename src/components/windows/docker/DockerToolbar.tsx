import { RefreshCw, Plus } from 'lucide-react'
import type { DockerWindowState } from './useDockerWindow'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'

export function DockerToolbar({ docker }: { docker: DockerWindowState }) {
  const {
    t,
    activeTab,
    setActiveTab,
    refetch,
    isFetching,
    refetchNetworks,
    refetchImages,
    refetchTemplates,
    openDeployModal,
  } = docker

  return (
    <div className="flex items-center justify-between border-b border-[var(--win-border)] px-3 py-1 bg-[var(--win-bar)] shrink-0 min-h-[40px]">
      <div className="flex items-center gap-1 mobile:min-w-0 mobile:overflow-x-auto">
        {(['containers', 'images', 'networks', 'templates'] as const).map((tab) => (
          <button
            key={tab}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === tab
                ? 'bg-[var(--panel-primary-bg)] text-[var(--panel-primary-text)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--win-text)] hover:bg-[var(--tb-hover)]'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {t(`docker.tab.${tab}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mobile:shrink-0">
        <IconButton
          type="button"
          onClick={() => {
            void refetch(); void refetchNetworks(); void refetchImages(); void refetchTemplates()
          }} label={t('docker.refresh')}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </IconButton>
        <Button onClick={openDeployModal} variant="primary-soft" className="text-xs py-1 px-2.5">
          <Plus className="h-3.5 w-3.5" />
          {t('docker.deploy')}
        </Button>
      </div>
    </div>
  )
}
