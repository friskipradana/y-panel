import { createTunnel, type Tunnel } from '@/api/agent'

export const STATUS_CONFIG: Record<string, { variant: string; labelKey: string }> = {
  active: { variant: 'panel-status--success', labelKey: 'tunnels.status.active' },
  healthy: { variant: 'panel-status--success', labelKey: 'tunnels.status.healthy' },
  down: { variant: 'panel-status--danger', labelKey: 'tunnels.status.down' },
  degraded: { variant: 'panel-status--warning', labelKey: 'tunnels.status.degraded' },
  creating: { variant: 'panel-status--warning', labelKey: 'tunnels.status.creating' },
  pending: { variant: 'panel-status--warning', labelKey: 'tunnels.status.pending' },
  error: { variant: 'panel-status--danger', labelKey: 'tunnels.status.error' },
  inactive: { variant: 'panel-status--neutral', labelKey: 'tunnels.status.inactive' },
}

export const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'NS', 'CAA']

export const emptyDnsForm = { type: 'A', name: '', content: '', ttl: 1, proxied: false, priority: '', comment: '' }

export const emptyTunnelForm = { name: '', subdomain: '', domain: '', zoneId: '', profileId: '', path: '', protocol: 'http', ip: 'localhost', port: '3000', projectId: '' }

export const emptyDomainForm = { name: '' }

export const emptyProfileForm = { name: '', mode: 'managed' as 'managed' | 'custom', tunnelId: '' }

export type DnsForm = typeof emptyDnsForm

export type TunnelForm = typeof emptyTunnelForm

export type DomainForm = typeof emptyDomainForm

export type ProfileForm = typeof emptyProfileForm

export function buildTunnelFormFromTunnel(t: Tunnel, cfZones: { id: string; name: string }[]): TunnelForm {
  let protocol = 'http'
  let ip = 'localhost'
  let port = '3000'
  let path = ''

  try {
    const parsed = new URL(t.targetUrl)
    protocol = parsed.protocol.replace(':', '')
    const hostParts = parsed.host.split(':')
    ip = hostParts[0] || 'localhost'
    port = hostParts[1] || (protocol === 'https' ? '443' : '80')
    path = parsed.pathname === '/' ? '' : parsed.pathname
  } catch {
    // keep defaults for malformed/legacy targets
  }

  let subdomain = ''
  let domain = ''
  let zoneId = ''

  if (t.cfHostname) {
    const zone = cfZones.find((z) => t.cfHostname.endsWith(z.name))
    if (zone) {
      zoneId = zone.id
      domain = zone.name
      if (t.cfHostname !== zone.name) subdomain = t.cfHostname.slice(0, -(zone.name.length + 1))
    } else {
      const parts = t.cfHostname.split('.')
      if (parts.length > 2) {
        subdomain = parts[0]
        domain = parts.slice(1).join('.')
      } else {
        domain = t.cfHostname
      }
    }
  }

  return { name: t.name, subdomain, domain, zoneId, profileId: t.cfTunnelId || '', path, protocol, ip, port, projectId: t.projectId ? String(t.projectId) : '' }
}

export function slugifyRoutePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function tunnelPayload(form: TunnelForm): Parameters<typeof createTunnel>[0] {
  return {
    ...form,
    projectId: form.projectId ? Number(form.projectId) : null,
  }
}
