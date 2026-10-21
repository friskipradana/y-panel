import { type WindowState } from '@/types'
import { useDockerWindow } from './docker/useDockerWindow'
import { DockerToolbar } from './docker/DockerToolbar'
import { DeployModal } from './docker/DeployModal'
import { DeleteContainerModal } from './docker/DeleteContainerModal'
import { LogModal } from './docker/LogModal'
import { DockerUpdateModal } from './docker/DockerUpdateModal'
import { RouteDomainModal } from './tunnels/RouteDomainModal'
import { containerSubject } from './docker/domainTargets'
import { ContainersTab } from './docker/ContainersTab'
import { ImagesTab } from './docker/ImagesTab'
import { NetworksTab } from './docker/NetworksTab'
import { TemplatesTab } from './docker/TemplatesTab'
import { VolumesTab } from './docker/VolumesTab'

export function DockerWindow({ win, authenticated }: { win?: WindowState; authenticated?: boolean }) {
  const docker = useDockerWindow({ win, authenticated })
  const { activeTab } = docker

  return (
    <div className="panel-window docker-window-root">
      <DockerToolbar docker={docker} />
      <DeployModal docker={docker} />
      <DeleteContainerModal docker={docker} />
      <LogModal target={docker.logModal} onClose={() => docker.setLogModal(null)} />
      <DockerUpdateModal
        target={docker.updateTarget}
        onClose={() => docker.setUpdateTarget(null)}
        onFinished={() => {
          void docker.containersQuery.refetch()
          void docker.imagesQuery.refetch()
        }}
        onApplyToContainer={(c) => docker.setUpdateTarget({ kind: 'container', id: c.id, name: c.name, image: c.image, autoStart: true })}
      />
      <RouteDomainModal subject={docker.domainContainer ? containerSubject(docker.domainContainer) : null} onClose={() => docker.setDomainContainer(null)} />
      <div className="docker-window__body">
        {activeTab === 'containers' && <ContainersTab docker={docker} />}
        {activeTab === 'images' && <ImagesTab docker={docker} />}
        {activeTab === 'networks' && <NetworksTab docker={docker} />}
        {activeTab === 'volumes' && <VolumesTab docker={docker} />}
        {activeTab === 'templates' && <TemplatesTab docker={docker} />}
      </div>
    </div>
  )
}
