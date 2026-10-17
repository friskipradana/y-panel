import { type WindowState } from '@/types'
import { useDockerWindow } from './docker/useDockerWindow'
import { DockerToolbar } from './docker/DockerToolbar'
import { DeployModal } from './docker/DeployModal'
import { DeleteContainerModal } from './docker/DeleteContainerModal'
import { LogModal } from './docker/LogModal'
import { ContainerDomainModal } from './docker/ContainerDomainModal'
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
      <ContainerDomainModal container={docker.domainContainer} onClose={() => docker.setDomainContainer(null)} />
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
