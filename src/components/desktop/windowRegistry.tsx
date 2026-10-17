import React from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { lazyNamed, lazyDefault } from '@/lib/lazy'
import type { WindowKind, WindowState } from '@/types'
import { useI18n } from '@/lib/i18n'

// Code-split window components with clean 1-line syntax & preloading support
const DockerWindow = lazyNamed(() => import('@/components/windows/DockerWindow'), 'DockerWindow')
const SystemWindow = lazyNamed(() => import('@/components/windows/SystemWindow'), 'SystemWindow')
const SettingsWindow = lazyNamed(() => import('@/components/windows/SettingsWindow'), 'SettingsWindow')
const DatabaseWindow = lazyNamed(() => import('@/components/windows/DatabaseWindow'), 'DatabaseWindow')
const ChangelogWindow = lazyNamed(() => import('@/components/windows/ChangelogWindow'), 'ChangelogWindow')
const SystemLogsWindow = lazyNamed(() => import('@/components/windows/SystemLogsWindow'), 'SystemLogsWindow')
const HostTerminalWindow = lazyNamed(() => import('@/components/windows/HostTerminalWindow'), 'HostTerminalWindow')
const DocsWindow = lazyDefault(() => import('@/components/windows/DocsWindow'))
const FileManagerWindow = lazyNamed(() => import('@/components/windows/FileManagerWindow'), 'FileManagerWindow')
const FileEditorWindow = lazyNamed(() => import('@/components/windows/FileEditorWindow'), 'FileEditorWindow')
const UsersWindow = lazyDefault(() => import('@/components/windows/UsersWindow'))
const ProjectsWindow = lazyDefault(() => import('@/components/windows/ProjectsWindow'))
const TunnelsWindow = lazyDefault(() => import('@/components/windows/TunnelsWindow'))
const ProfileWindow = lazyDefault(() => import('@/components/windows/ProfileWindow'))
const WidgetsWindow = lazyNamed(() => import('@/components/windows/WidgetsWindow'), 'WidgetsWindow')
const SpeedtestWindow = lazyNamed(() => import('@/components/windows/SpeedtestWindow'), 'SpeedtestWindow')


// Every account works in its own area (terminal as its own OS account, own files, containers,
// databases, projects, Cloudflare token, widgets, settings). Only user management is for admins.
const ADMIN_ONLY_WINDOW_KINDS = new Set<WindowKind>(['users'])
// service journals show every account's activity
const SUPERADMIN_ONLY_WINDOW_KINDS = new Set<WindowKind>(['system-logs'])

// The public demo account only looks: the windows below work read-only on its own (empty) data.
// No terminal, files, users, settings or logs: they would need a shell or reach shared data.
const DEMO_WINDOW_KINDS = new Set<WindowKind>(['apps', 'projects', 'database', 'tunnels', 'system', 'widgets', 'profile'])

export function canAccessWindow(kind: WindowKind, role?: string | null) {
  if (role === 'demo') return DEMO_WINDOW_KINDS.has(kind)
  if (SUPERADMIN_ONLY_WINDOW_KINDS.has(kind)) return role === 'superadmin'
  if (role === 'admin' || role === 'superadmin') return true
  return !ADMIN_ONLY_WINDOW_KINDS.has(kind)
}

function TerminalPlaceholder() {
  const { t } = useI18n()
  return (
    <div className="rounded-lg p-4 font-mono text-xs leading-relaxed" style={{ background: 'var(--app-terminal-bg)', color: 'var(--app-terminal-text)' }}>
      <span style={{ color: 'var(--app-terminal-user)' }}>panel@ui</span>
      <span style={{ color: 'var(--app-terminal-separator)' }}>:</span>
      <span style={{ color: 'var(--app-terminal-text)' }}>~</span>$ {t('app.terminalHint')}
      <br />
      <span style={{ color: 'var(--app-terminal-muted)' }}>{t('app.terminalSubhint')}</span>
    </div>
  )
}

function TrashPlaceholder() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center h-24 gap-2" style={{ color: 'var(--sand-400)' }}>
      <Trash2 size={36} strokeWidth={1.5} />
      <span className="text-sm">{t('app.trashEmpty')}</span>
    </div>
  )
}

export function WindowFallback() {
  const { t } = useI18n()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
      <Loader2 size={32} className="animate-spin text-[var(--app-loading-spinner)] opacity-80" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-[var(--app-loading-text)]">{t('common.loadingApp')}</span>
        <span className="text-[11px] text-[var(--app-loading-meta)] uppercase tracking-widest font-medium">{t('common.loadingModule')}</span>
      </div>
    </div>
  )
}

export const WINDOW_CONTENT: Partial<Record<WindowKind, (win: WindowState, authenticated: boolean) => React.ReactNode>> = {
  apps: (win, auth) => <DockerWindow win={win} authenticated={auth} />,
  system: (_win, auth) => <SystemWindow authenticated={auth} />,
  'system-logs': (win, auth) => <SystemLogsWindow win={win} authenticated={auth} />,
  'host-terminal': (_win, auth) => <HostTerminalWindow authenticated={auth} />,
  terminal: () => <TerminalPlaceholder />,
  docs: () => <DocsWindow />,
  changelog: () => <ChangelogWindow />,
  settings: (_win, auth) => <SettingsWindow authenticated={auth} />,
  database: (_win, auth) => <DatabaseWindow authenticated={auth} />,
  'file-manager': (win, auth) => <FileManagerWindow win={win} authenticated={auth} />,
  'file-editor': (_win, auth) => <FileEditorWindow authenticated={auth} />,
  trash: () => <TrashPlaceholder />,
  users: (win) => <UsersWindow win={win} />,
  projects: (win) => <ProjectsWindow win={win} />,
  tunnels: (win) => <TunnelsWindow win={win} />,
  profile: () => <ProfileWindow />,
  widgets: () => <WidgetsWindow />,
  speedtest: () => <SpeedtestWindow />,
}


export const DESKTOP_SHORTCUTS: { id: string; label: string; windowId: WindowKind }[] = [
  { id: 'apps', label: 'Docker', windowId: 'apps' },
  { id: 'host-terminal', label: 'Terminal', windowId: 'host-terminal' },
  { id: 'widgets', label: 'Widgets', windowId: 'widgets' },
  { id: 'tunnels', label: 'Cloudflare', windowId: 'tunnels' },
  { id: 'projects', label: 'Projects', windowId: 'projects' },
  { id: 'database', label: 'Database', windowId: 'database' },
  { id: 'file-manager', label: 'Files', windowId: 'file-manager' },
  { id: 'system', label: 'System', windowId: 'system' },
  { id: 'speedtest', label: 'Speed Test', windowId: 'speedtest' },
  { id: 'users', label: 'Users', windowId: 'users' },
  { id: 'settings', label: 'Settings', windowId: 'settings' },
  { id: 'docs', label: 'Docs', windowId: 'docs' },
]
