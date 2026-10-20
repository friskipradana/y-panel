import { PublicBuyerDomainsCard } from '../publicip/PublicBuyerDomainsCard'
import { PublicEngineCard } from '../publicip/PublicEngineCard'
import { PublicIpStatusCard } from '../publicip/PublicIpStatusCard'
import { PublicRoutesCard } from '../publicip/PublicRoutesCard'

// Serving domains straight from this machine, for an install that has a public address: the switch, and the domains
export function PublicIpTab() {
  return (
    <div className="space-y-3">
      <PublicEngineCard />
      <PublicIpStatusCard />
      <PublicBuyerDomainsCard />
      <PublicRoutesCard />
    </div>
  )
}
