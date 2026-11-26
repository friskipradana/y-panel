import type { InstalledApp } from '@/api/appCatalog'
import type { Container } from '@/types'
import { slugifyRoutePart, type TunnelTargetPreset } from './tunnelForms'

interface TunnelProjectTarget {
  id: number
  name: string
  slug?: string
  projectType: string
  assignedPort: number
  running?: boolean
}

interface BuildTunnelTargetsInput {
  tunnelProjects: TunnelProjectTarget[]
  installedApps?: InstalledApp[]
  containers?: Container[]
  t: (key: string) => string
}

export function buildTunnelTargets({
  tunnelProjects,
  installedApps,
  containers,
  t,
}: BuildTunnelTargetsInput): TunnelTargetPreset[] {
  const items: TunnelTargetPreset[] = []
  for (const project of tunnelProjects) {
    items.push({
      value: String(project.id),
      label: `${project.name} :${project.assignedPort}`,
      description: `Project \u00b7 ${project.projectType}${project.running ? ` \u00b7 ${t('tunnels.projectRunning')}` : ''}`,
      name: project.name,
      subdomain: slugifyRoutePart(project.slug || project.name),
      protocol: 'http',
      ip: 'localhost',
      port: String(project.assignedPort),
    })
  }

  const safeApps = Array.isArray(installedApps) ? installedApps : []
  const appContainerKeys = new Set<string>()
  for (const app of safeApps) {
    if (app.containerName) appContainerKeys.add(app.containerName.toLowerCase())
    if (app.containerId) appContainerKeys.add(app.containerId.toLowerCase())

    let protocol = 'http'
    let ip = 'localhost'
    let port = app.hostPort > 0 ? String(app.hostPort) : ''
    if (!port && app.targetUrl) {
      try {
        const parsed = new URL(app.targetUrl)
        protocol = parsed.protocol.replace(':', '') || 'http'
        ip = parsed.hostname || 'localhost'
        port = parsed.port || (protocol === 'https' ? '443' : '80')
      } catch {
        // skip malformed targetUrl
      }
    }
    if (!port) continue
    const running = app.containerState === 'running'
    items.push({
      value: `app:${app.id}`,
      label: `${app.name} :${port}`,
      description: `${t('window.app-catalog')}${running ? ` \u00b7 ${t('tunnels.projectRunning')}` : ''}`,
      name: app.name,
      subdomain: slugifyRoutePart(app.slug || app.name),
      protocol,
      ip,
      port,
    })
  }

  const safeContainers = Array.isArray(containers) ? containers : []
  for (const c of safeContainers) {
    const rawName = (c.Names?.[0] || '').replace(/^\//, '').trim() || c.Id.slice(0, 12)
    if (
      appContainerKeys.has(rawName.toLowerCase()) ||
      appContainerKeys.has(c.Id.toLowerCase()) ||
      (c.ProjectName && appContainerKeys.has(c.ProjectName.toLowerCase()))
    ) {
      continue
    }
    const seenPorts = new Set<number>()
    for (const p of c.Ports || []) {
      const pub = p.PublicPort ?? 0
      if (pub <= 0 || seenPorts.has(pub)) continue
      seenPorts.add(pub)
      const displayName = c.ProjectName ? `${c.ProjectName} (${rawName})` : rawName
      items.push({
        value: `docker:${c.Id}:${pub}`,
        label: `${displayName} :${pub}`,
        description: `Docker${c.State === 'running' ? ` \u00b7 ${t('tunnels.projectRunning')}` : ''}`,
        name: displayName,
        subdomain: slugifyRoutePart(c.ProjectName || rawName),
        protocol: 'http',
        ip: 'localhost',
        port: String(pub),
      })
    }
  }
  return items
}
