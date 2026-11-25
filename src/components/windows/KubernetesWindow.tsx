import type { WindowState } from '@/types'
import { RouteDomainModal } from './tunnels/RouteDomainModal'
import { useKubernetesWindow } from './kubernetes/useKubernetesWindow'
import { K8sToolbar } from './kubernetes/K8sToolbar'
import { K8sOverviewTab } from './kubernetes/K8sOverviewTab'
import { K8sWorkloadsTab } from './kubernetes/K8sWorkloadsTab'
import { K8sModals } from './kubernetes/K8sModals'

interface KubernetesWindowProps {
  win: WindowState
  authenticated: boolean
}

export function KubernetesWindow({ win, authenticated }: KubernetesWindowProps) {
  const kw = useKubernetesWindow(win, authenticated)

  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      <K8sToolbar kw={kw} />
      {kw.section === 'overview' ? <K8sOverviewTab kw={kw} /> : <K8sWorkloadsTab kw={kw} />}
      <K8sModals kw={kw} />
      <RouteDomainModal subject={kw.tunnelSubject} onClose={() => kw.setTunnelSubject(null)} />
    </div>
  )
}
