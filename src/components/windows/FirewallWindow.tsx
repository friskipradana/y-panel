import type { WindowState } from '@/types'
import { FirewallToolbar } from './firewall/FirewallToolbar'
import { PolicySection } from './firewall/PolicySection'
import { PortsSection } from './firewall/PortsSection'
import { RuleModal } from './firewall/RuleModal'
import { RulesSection } from './firewall/RulesSection'
import { useFirewallWindow } from './firewall/useFirewallWindow'

// Firewall of the server (ufw): its rules, the ports that listen and who can reach them, and its defaults. Superadmin only.
export function FirewallWindow({ win }: { win?: WindowState; authenticated?: boolean }) {
  const fw = useFirewallWindow(win)
  return (
    <div className="panel-window docker-window-root relative flex flex-col overflow-hidden">
      <FirewallToolbar fw={fw} />
      {fw.section === 'rules' ? <RulesSection fw={fw} /> : null}
      {fw.section === 'ports' ? <PortsSection fw={fw} /> : null}
      {fw.section === 'policy' ? <PolicySection fw={fw} /> : null}
      <RuleModal fw={fw} />
    </div>
  )
}
