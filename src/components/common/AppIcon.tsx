import React from 'react'
import {
  Box24Filled,
  Code24Filled,
  Database24Filled,
  Folder24Filled,
  DocumentEdit24Filled,
  CodeBlock24Filled,
  Cloud24Filled,
  Info24Filled,
  DocumentBulletList24Filled,
  Settings24Filled,
  People24Filled,
  DocumentText24Filled,
  Megaphone24Filled,
  PersonCircle24Filled,
  Delete24Filled,
  Apps24Filled,
  AppStore24Filled,
  AppGeneric24Filled,
  WindowApps24Filled,
  Gauge24Filled,
  BuildingRetail24Filled,
  Shield24Filled,
  Mail24Filled,
  DesktopKeyboard24Filled,
} from '@fluentui/react-icons'
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
  const Glyph = APP_GLYPH_MAP[(iconKey || '').toLowerCase()] || Globe
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
  const Glyph = APP_GLYPH_MAP[(iconKey || '').toLowerCase()] || Globe
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

const ICON_MAP: Record<string, { icon: React.ComponentType<{ style?: React.CSSProperties; className?: string }>; color: string }> = {
  apps: { icon: Box24Filled, color: '#38bdf8' },
  'host-terminal': { icon: Code24Filled, color: '#4ade80' },
  terminal: { icon: Code24Filled, color: '#4ade80' },
  database: { icon: Database24Filled, color: '#f59e0b' },
  'file-manager': { icon: Folder24Filled, color: '#fbbf24' },
  'file-editor': { icon: DocumentEdit24Filled, color: '#60a5fa' },
  projects: { icon: CodeBlock24Filled, color: '#a78bfa' },
  tunnels: { icon: Cloud24Filled, color: '#f97316' },
  system: { icon: Info24Filled, color: '#06b6d4' },
  'system-logs': { icon: DocumentBulletList24Filled, color: '#94a3b8' },
  settings: { icon: Settings24Filled, color: '#94a3b8' },
  users: { icon: People24Filled, color: '#ec4899' },
  docs: { icon: DocumentText24Filled, color: '#10b981' },
  changelog: { icon: Megaphone24Filled, color: '#8b5cf6' },
  profile: { icon: PersonCircle24Filled, color: '#6366f1' },
  widgets: { icon: WindowApps24Filled, color: '#3b82f6' },
  speedtest: { icon: Gauge24Filled, color: '#14b8a6' },
  hosting: { icon: BuildingRetail24Filled, color: '#f43f5e' },
  firewall: { icon: Shield24Filled, color: '#f87171' },
  email: { icon: Mail24Filled, color: '#0ea5e9' },
  kvm: { icon: DesktopKeyboard24Filled, color: '#06b6d4' },
  trash: { icon: Delete24Filled, color: '#ef4444' },
  'app-catalog': { icon: AppStore24Filled, color: 'var(--panel-primary-text)' },
  'installed-app': { icon: AppGeneric24Filled, color: 'var(--panel-primary-text)' },
  'app-licenses': { icon: Shield24Filled, color: '#10b981' },
}

export function AppIcon({ kind, size = 24, className = '', style = {}, iconKey, iconColor }: AppIconProps) {
  if (kind === 'installed-app' || iconKey) {
    return <InstalledAppGlyph iconKey={iconKey} iconColor={iconColor} size={size} className={className} style={style} />
  }
  const item = ICON_MAP[kind] || { icon: Apps24Filled, color: 'var(--panel-neutral-text)' }
  const IconComponent = item.icon

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size,
        color: item.color,
        ...style,
      }}
    >
      <IconComponent style={{ fontSize: `${size}px`, width: `${size}px`, height: `${size}px` }} />
    </span>
  )
}
