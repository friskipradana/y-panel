import React from 'react'
import {
  Box24Filled,
  Code24Filled,
  Database24Filled,
  Folder24Filled,
  DocumentEdit24Filled,
  Grid24Filled,
  Globe24Filled,
  DesktopPulse24Filled,
  DocumentBulletList24Filled,
  Settings24Filled,
  People24Filled,
  BookOpen24Filled,
  Megaphone24Filled,
  PersonCircle24Filled,
  Delete24Filled,
  Apps24Filled,
  Board24Filled,
} from '@fluentui/react-icons'
import type { WindowKind } from '@/types'

interface AppIconProps {
  kind: WindowKind | string
  size?: number
  className?: string
  style?: React.CSSProperties
}

const ICON_MAP: Record<string, { icon: React.ComponentType<{ style?: React.CSSProperties; className?: string }>; color: string }> = {
  apps: { icon: Box24Filled, color: '#38bdf8' }, // Docker (Cyan/Blue)
  'host-terminal': { icon: Code24Filled, color: '#4ade80' }, // Terminal (Green)
  terminal: { icon: Code24Filled, color: '#4ade80' },
  database: { icon: Database24Filled, color: '#f59e0b' }, // Database (Amber)
  'file-manager': { icon: Folder24Filled, color: '#fbbf24' }, // Files (Yellow)
  'file-editor': { icon: DocumentEdit24Filled, color: '#60a5fa' }, // Editor (Blue)
  projects: { icon: Grid24Filled, color: '#a78bfa' }, // Projects (Purple)
  tunnels: { icon: Globe24Filled, color: '#f97316' }, // Cloudflare (Orange)
  system: { icon: DesktopPulse24Filled, color: '#38bdf8' }, // System (Sky)
  'system-logs': { icon: DocumentBulletList24Filled, color: '#94a3b8' }, // Logs (Slate)
  settings: { icon: Settings24Filled, color: '#94a3b8' }, // Settings (Zinc)
  users: { icon: People24Filled, color: '#ec4899' }, // Users (Pink)
  docs: { icon: BookOpen24Filled, color: '#10b981' }, // Docs (Emerald)
  changelog: { icon: Megaphone24Filled, color: '#8b5cf6' }, // Changelog (Violet)
  profile: { icon: PersonCircle24Filled, color: '#6366f1' }, // Profile (Indigo)
  widgets: { icon: Board24Filled, color: '#06b6d4' }, // Widgets (Cyan)
  trash: { icon: Delete24Filled, color: '#ef4444' }, // Trash (Red)
  portainer: { icon: Box24Filled, color: '#38bdf8' },
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
