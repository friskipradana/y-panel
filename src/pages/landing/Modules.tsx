import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  Box,
  Database,
  FileText,
  FolderKanban,
  Gauge,
  Globe,
  HardDrive,
  LayoutGrid,
  Network,
  Settings,
  Store,
  Terminal,
  Users,
} from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { useI18n } from '@/lib/i18n'
import { Tabs } from '@/components/ui/Tabs'
import { Select } from '@/components/ui/Select'
import { IconBadge } from '@/components/ui/IconBadge'

type ModuleIcon = ComponentType<{ size?: number; className?: string }>

// Grouped by what the owner does with them; each module lists the real things it handles
const GROUPS: Array<{ id: string; modules: Array<{ id: string; icon: ModuleIcon }> }> = [
  {
    id: 'server',
    modules: [
      { id: 'docker', icon: Box },
      { id: 'projects', icon: FolderKanban },
      { id: 'terminal', icon: Terminal },
      { id: 'files', icon: HardDrive },
      { id: 'database', icon: Database },
    ],
  },
  {
    id: 'network',
    modules: [
      { id: 'cloudflare', icon: Globe },
      { id: 'publicip', icon: Network },
      { id: 'speedtest', icon: Gauge },
    ],
  },
  {
    id: 'business',
    modules: [
      { id: 'hosting', icon: Store },
      { id: 'users', icon: Users },
      { id: 'notify', icon: Bell },
    ],
  },
  {
    id: 'workspace',
    modules: [
      { id: 'system', icon: Activity },
      { id: 'logs', icon: FileText },
      { id: 'widgets', icon: LayoutGrid },
      { id: 'docs', icon: BookOpen },
      { id: 'settings', icon: Settings },
      { id: 'mcp', icon: Bot },
    ],
  },
]

const MODULE_COUNT = GROUPS.reduce((sum, group) => sum + group.modules.length, 0)

// Every module of the panel, modern workstation list view with IconBadge & feature chips
export function Modules() {
  const { t } = useI18n()
  const [groupId, setGroupId] = useState(GROUPS[0].id)
  const group = GROUPS.find((g) => g.id === groupId) ?? GROUPS[0]
  return (
    <section className="mt-14" aria-labelledby="landing-modules">
      <h2 id="landing-modules" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.modules.title')}
      </h2>
      <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.modules.subtitle', { count: MODULE_COUNT })}</p>

      {/* Mobile Category Dropdown */}
      <div className="mt-4 sm:hidden">
        <label htmlFor="landing-modules-mobile-select" className="sr-only">
          {t('landing.modules.title')}
        </label>
        <Select
          id="landing-modules-mobile-select"
          value={groupId}
          onChange={setGroupId}
          options={GROUPS.map((g) => ({
            value: g.id,
            label: t(`landing.modules.group.${g.id}`),
            badge: String(g.modules.length),
          }))}
          className="w-full"
        />
      </div>

      {/* Desktop / Tablet Tabs */}
      <div className="hidden sm:block">
        <Tabs
          label={t('landing.modules.title')}
          className="mt-4"
          value={groupId}
          onChange={setGroupId}
          items={GROUPS.map((g) => ({ key: g.id, label: t(`landing.modules.group.${g.id}`), count: g.modules.length }))}
        />
      </div>

      <div
        role="tabpanel"
        aria-label={t(`landing.modules.group.${group.id}`)}
        className="mt-4 overflow-hidden rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)]/25 shadow-2xs backdrop-blur-xs"
      >
        <ul className="divide-y divide-[var(--win-border)]/50">
          {group.modules.map(({ id, icon: Icon }) => (
            <li
              key={id}
              className="group flex flex-col justify-between gap-4 p-4 transition-all duration-150 hover:bg-[var(--panel-surface)]/60 sm:flex-row sm:items-center sm:p-4.5"
            >
              {/* Left: IconBadge + Title + Description */}
              <div className="flex items-start gap-3.5 sm:max-w-xl">
                <IconBadge
                  size="lg"
                  tone="neutral"
                  className="mt-0.5 transition-colors group-hover:border-[var(--panel-primary-border)] group-hover:bg-[var(--panel-primary-subtle)] group-hover:text-[var(--panel-primary-text)]"
                >
                  <Icon />
                </IconBadge>

                <div>
                  <h3 className="text-[0.9375rem] font-bold tracking-tight text-[var(--win-text)] transition-colors group-hover:text-[var(--panel-primary-text)]">
                    {t(`landing.module.${id}.title`)}
                  </h3>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                    {t(`landing.module.${id}.desc`)}
                  </p>
                </div>
              </div>

              {/* Right: Feature Capabilities Chips */}
              <div className="shrink-0 pl-11 sm:pl-0">
                <ul className="flex flex-wrap gap-1.5 sm:justify-end sm:max-w-sm">
                  {t(`landing.module.${id}.tags`)
                    .split('|')
                    .map((tag) => (
                      <li
                        key={tag}
                        className="panel-mono rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)]/60 px-2 py-0.5 text-[0.6875rem] font-medium leading-none text-[var(--text-secondary)] transition-colors group-hover:border-[var(--panel-border-focus)]"
                      >
                        {tag}
                      </li>
                    ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
