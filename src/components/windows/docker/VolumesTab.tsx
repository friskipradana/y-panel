import { toast } from 'sonner'
import { Copy, Database, FolderOpen, HardDrive } from 'lucide-react'
import { copyTextToClipboard } from '@/api/agent'
import { DockerListState, DockerRowIcon, DockerTable } from './DockerTable'
import type { DockerWindowState } from './useDockerWindow'

// What the running containers have mounted: named volumes, bind mounts and tmpfs
export function VolumesTab({ docker }: { docker: DockerWindowState }) {
  const { t, volumesQuery, filteredMounts, search } = docker

  const copy = (text: string) => {
    void copyTextToClipboard(text).then(() => toast.success(t('docker.pathCopied')))
  }

  return (
    <DockerTable
      variant="volumes"
      empty={volumesQuery.isLoading || volumesQuery.isError || filteredMounts.length === 0}
      columns={[
        { label: t('docker.colIndex') },
        { label: t('docker.col.mount') },
        { label: t('docker.col.container') },
        { label: t('docker.col.path') },
        { label: t('docker.col.mode') },
        { label: t('docker.colActions'), actions: true },
      ]}
    >
      <DockerListState
        loading={volumesQuery.isLoading}
        error={volumesQuery.isError}
        errorTitle={t('docker.volumesLoadFailed')}
        errorHint={t('docker.agentAccessHint')}
        loadingText={t('docker.loadingList')}
        empty={filteredMounts.length === 0}
        emptyIcon={<HardDrive />}
        emptyTitle={search ? t('docker.noResults') : t('docker.noVolumes')}
        emptyHint={search ? undefined : t('docker.noVolumesHint')}
      >
        {filteredMounts.map((mount, idx) => {
          const title = mount.type === 'volume' ? mount.name || mount.destination : mount.source || mount.destination
          const Icon = mount.type === 'volume' ? Database : mount.type === 'bind' ? FolderOpen : HardDrive
          const copyable = mount.source || mount.destination
          return (
            <div key={`${mount.containerId}:${mount.destination}`} className="docker-row">
              <div className="docker-row__num">{String(idx + 1).padStart(2, '0')}</div>
              <div className="docker-row__app">
                <DockerRowIcon><Icon className="h-3.5 w-3.5" strokeWidth={1.75} /></DockerRowIcon>
                <div className="docker-row__text">
                  <span className="docker-app-name docker-app-name--mono" title={title}>{title}</span>
                  <span className="docker-row__sub">{t(`docker.mountType.${mount.type}`)}{mount.type === 'volume' && mount.source ? ` · ${mount.source}` : ''}</span>
                  <span className="docker-row__meta">{mount.containerName} · {mount.destination}</span>
                </div>
              </div>
              <div className="docker-cell">
                <span className="docker-cell__strong">{mount.containerName}</span>
                {mount.projectName ? <span className="docker-row__sub">{mount.projectName}</span> : null}
              </div>
              <div className="docker-cell docker-cell--mono" title={mount.destination}>{mount.destination}</div>
              <div className="docker-cell docker-cell--keep">
                <span className={`docker-status-pill ${mount.readOnly ? 'docker-status-pill--paused' : 'docker-status-pill--running'}`}>
                  <span className="docker-status-dot" />
                  <span>{mount.readOnly ? t('docker.readOnly') : t('docker.readWrite')}</span>
                </span>
              </div>
              <div className="docker-action-btns">
                <button type="button" className="docker-act-btn" title={t('docker.copyPath')} aria-label={t('docker.copyPath')} onClick={() => copy(copyable)}>
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          )
        })}
      </DockerListState>
    </DockerTable>
  )
}
