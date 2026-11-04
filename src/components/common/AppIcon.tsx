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
  WindowApps24Filled,
  Gauge24Filled,
  BuildingRetail24Filled,
  Shield24Filled,
  Mail24Filled,
} from '@fluentui/react-icons'
import type { WindowKind } from '@/types'

interface AppIconProps {
  kind: WindowKind | string
  size?: number
  className?: string
  style?: React.CSSProperties
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
  trash: { icon: Delete24Filled, color: '#ef4444' },
}

export function AppIcon({ kind, size = 24, className = '', style = {} }: AppIconProps) {
  const item = ICON_MAP[kind] || { icon: Apps24Filled, color: '#94a3b8' }
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
