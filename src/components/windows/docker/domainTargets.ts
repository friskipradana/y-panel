import type { Container } from '@/types'
import type { RouteSubject, RouteTarget } from '@/components/windows/tunnels/RouteDomainModal'

// Where a tunnel on this machine can reach the container: a port it publishes on the host, or, when it
// publishes none, its own address on the Docker network
export function domainTargets(container: Container): RouteTarget[] {
  const seen = new Set<string>()
  const targets: RouteTarget[] = []
  const tcp = (container.Ports ?? []).filter((p) => (p.Type || 'tcp') === 'tcp')
  for (const p of tcp) {
    if (!p.PublicPort || seen.has(`pub:${p.PublicPort}`)) continue
    seen.add(`pub:${p.PublicPort}`)
    targets.push({ key: `pub:${p.PublicPort}`, host: 'localhost', port: p.PublicPort, label: `localhost:${p.PublicPort} → ${p.PrivatePort}` })
  }
  const ip = container.IpAddresses?.[0]
  if (targets.length === 0 && ip) {
    for (const p of tcp) {
      if (seen.has(`priv:${p.PrivatePort}`)) continue
      seen.add(`priv:${p.PrivatePort}`)
      targets.push({ key: `priv:${p.PrivatePort}`, host: ip, port: p.PrivatePort, label: `${ip}:${p.PrivatePort}` })
    }
  }
  return targets
}

// A container as what a domain can be pointed at
export function containerSubject(container: Container): RouteSubject {
  return {
    id: container.Id,
    name: container.Names?.[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12),
    kind: 'container',
    targets: domainTargets(container),
  }
}
