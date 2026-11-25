import React from 'react'
import {
  Activity,
  BarChart3,
  Box,
  Database,
  FileText,
  Folder,
  GitBranch,
  Globe,
  PenTool,
  Server,
  Shield,
  StickyNote,
  Terminal,
  Workflow,
  Wrench,
} from 'lucide-react'
import { IconBadge, type IconBadgeSize, type UiTone } from '@/components/ui/IconBadge'
import type { WindowKind } from '@/types'

interface AppIconProps {
  kind: WindowKind | string
  size?: number
  className?: string
  style?: React.CSSProperties
  iconKey?: string
  iconColor?: string
}

const BRAND_ICON_MAP: Record<string, string> = {
  'uptime-kuma': '/icons/apps/uptime-kuma.svg',
  filebrowser: '/icons/apps/filebrowser.svg',
  'it-tools': '/icons/apps/it-tools.svg',
  n8n: '/icons/apps/n8n.svg',
  vaultwarden: '/icons/apps/vaultwarden.svg',
  grafana: '/icons/apps/grafana.svg',
  'stirling-pdf': '/icons/apps/stirling-pdf.svg',
  excalidraw: '/icons/apps/excalidraw.svg',
  gitea: '/icons/apps/gitea.svg',
  memos: '/icons/apps/memos.png',
  'reneo-crm': '/icons/apps/reneo-crm.svg?v=3',
  'reneo-sidesa': '/icons/apps/reneo-sidesa.svg?v=2',
  'reneo-skills': '/icons/apps/reneo-skills.svg?v=1',
  'reneo-icons': '/icons/apps/reneo-icons.svg?v=2',
  'reneo-resto': '/icons/apps/reneo-resto.svg?v=2',
  'adguard-home': '/icons/apps/adguard-home.svg',
  jellyfin: '/icons/apps/jellyfin.svg',
  nextcloud: '/icons/apps/nextcloud.svg',
  'nginx-proxy-manager': '/icons/apps/nginx-proxy-manager.svg',
  'open-webui': '/icons/apps/open-webui.svg',
  beszel: '/icons/apps/beszel.svg',
  'actual-budget': '/icons/apps/actual-budget.svg',
  vikunja: '/icons/apps/vikunja.svg',
  metube: '/icons/apps/metube.svg',
  pairdrop: '/icons/apps/pairdrop.svg',
}

const APP_GLYPH_MAP: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  activity: Activity,
  folder: Folder,
  wrench: Wrench,
  workflow: Workflow,
  shield: Shield,
  chart: BarChart3,
  'bar-chart': BarChart3,
  'file-text': FileText,
  pen: PenTool,
  'pen-tool': PenTool,
  'git-branch': GitBranch,
  note: StickyNote,
  notebook: StickyNote,
  globe: Globe,
  box: Box,
  server: Server,
  database: Database,
  terminal: Terminal,
}

const APP_COLOR_TOKEN_MAP: Record<string, string> = {
  emerald: 'var(--panel-success-text)',
  green: 'var(--panel-success-text)',
  amber: 'var(--panel-warning-text)',
  orange: 'var(--accent)',
  blue: 'var(--panel-primary-text)',
  indigo: 'var(--panel-primary-text)',
  cyan: 'var(--panel-info-text)',
  sky: 'var(--panel-info-text)',
  teal: 'var(--panel-info-text)',
  rose: 'var(--panel-danger-text)',
  red: 'var(--panel-danger-text)',
  violet: 'var(--panel-primary-text)',
  slate: 'var(--panel-neutral-text)',
}

const APP_BADGE_TONE_MAP: Record<string, UiTone> = {
  emerald: 'success',
  green: 'success',
  amber: 'warning',
  orange: 'warning',
  blue: 'primary',
  indigo: 'primary',
  violet: 'primary',
  cyan: 'info',
  sky: 'info',
  teal: 'info',
  rose: 'danger',
  red: 'danger',
  slate: 'neutral',
}

function resolveAppColorToken(color?: string): string {
  if (!color) return 'var(--panel-primary-text)'
  return APP_COLOR_TOKEN_MAP[color.toLowerCase()] || 'var(--panel-primary-text)'
}

function resolveAppBadgeTone(color?: string): UiTone {
  if (!color) return 'primary'
  return APP_BADGE_TONE_MAP[color.toLowerCase()] || 'primary'
}

function resolveIconImageSrc(iconKey?: string): string | null {
  const raw = (iconKey || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) {
    return raw
  }
  return BRAND_ICON_MAP[raw.toLowerCase()] || null
}

export function InstalledAppBadge({
  iconKey,
  iconColor,
  size = 'md',
  className = '',
}: {
  iconKey?: string
  iconColor?: string
  size?: IconBadgeSize
  className?: string
}) {
  const [imgFailed, setImgFailed] = React.useState(false)
  React.useEffect(() => {
    setImgFailed(false)
  }, [iconKey])
  const key = (iconKey || '').toLowerCase()
  const brandSrc = !imgFailed ? resolveIconImageSrc(iconKey) : null
  if (brandSrc) {
    return (
      <IconBadge size={size} tone="neutral" className={className}>
        <img
          src={brandSrc}
          alt=""
          className="h-[72%] w-[72%] object-contain rounded-sm"
          loading="lazy"
          draggable={false}
          onError={() => setImgFailed(true)}
        />
      </IconBadge>
    )
  }
  const Glyph = APP_GLYPH_MAP[key] || Globe
  return (
    <IconBadge size={size} tone={resolveAppBadgeTone(iconColor)} className={className}>
      <Glyph />
    </IconBadge>
  )
}

export function InstalledAppGlyph({
  iconKey,
  iconColor,
  size = 24,
  className = '',
  style = {},
}: {
  iconKey?: string
  iconColor?: string
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  const [imgFailed, setImgFailed] = React.useState(false)
  React.useEffect(() => {
    setImgFailed(false)
  }, [iconKey])
  const key = (iconKey || '').toLowerCase()
  const brandSrc = !imgFailed ? resolveIconImageSrc(iconKey) : null
  if (brandSrc) {
    const imgSize = Math.max(14, Math.round(size * 0.92))
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          ...style,
        }}
      >
        <img
          src={brandSrc}
          alt=""
          width={imgSize}
          height={imgSize}
          className="object-contain rounded-sm"
          style={{ width: imgSize, height: imgSize }}
          draggable={false}
          onError={() => setImgFailed(true)}
        />
      </span>
    )
  }
  const Glyph = APP_GLYPH_MAP[key] || Globe
  const glyphSize = Math.max(14, Math.round(size * 0.82))
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        color: resolveAppColorToken(iconColor),
        ...style,
      }}
    >
      <Glyph size={glyphSize} strokeWidth={1.75} />
    </span>
  )
}

const PANEL_ICON_MAP: Record<string, string> = {
  apps: '/icons/panel/apps.svg?v=2',
  kubernetes: '/icons/panel/kubernetes.svg?v=1',
  backups: '/icons/panel/backups.svg?v=1',
  uptime: '/icons/panel/uptime.svg?v=1',
  'host-terminal': '/icons/panel/host-terminal.svg?v=1',
  terminal: '/icons/panel/host-terminal.svg?v=1',
  database: '/icons/panel/database.svg?v=1',
  'file-manager': '/icons/panel/file-manager.svg?v=1',
  'file-editor': '/icons/panel/file-editor.svg?v=1',
  projects: '/icons/panel/projects.svg?v=1',
  tunnels: '/icons/panel/tunnels.svg?v=1',
  system: '/icons/panel/system.svg?v=1',
  'system-logs': '/icons/panel/system-logs.svg?v=1',
  settings: '/icons/panel/settings.svg?v=1',
  users: '/icons/panel/users.svg?v=1',
  docs: '/icons/panel/docs.svg?v=1',
  changelog: '/icons/panel/changelog.svg?v=1',
  profile: '/icons/panel/profile.svg?v=1',
  widgets: '/icons/panel/widgets.svg?v=1',
  speedtest: '/icons/panel/speedtest.svg?v=1',
  hosting: '/icons/panel/hosting.svg?v=1',
  firewall: '/icons/panel/firewall.svg?v=1',
  email: '/icons/panel/email.svg?v=1',
  kvm: '/icons/panel/kvm.svg?v=1',
  trash: '/icons/panel/trash.svg?v=1',
  'app-catalog': '/icons/panel/app-catalog.svg?v=1',
  'installed-app': '/icons/panel/installed-app.svg?v=1',
  'app-licenses': '/icons/panel/app-licenses.svg?v=1',
}

export function AppIcon({ kind, size = 24, className = '', style = {}, iconKey, iconColor }: AppIconProps) {
  if (kind === 'installed-app' || iconKey) {
    return <InstalledAppGlyph iconKey={iconKey} iconColor={iconColor} size={size} className={className} style={style} />
  }
  const panelSrc = PANEL_ICON_MAP[kind] || PANEL_ICON_MAP['installed-app']

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        ...style,
      }}
    >
      <img
        src={panelSrc}
        alt=""
        width={size}
        height={size}
        className="object-contain"
        style={{ width: size, height: size }}
        draggable={false}
      />
    </span>
  )
}
