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

// Every module of the panel, one group per tab, with the technical things each one covers as chips
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

      <Tabs
        label={t('landing.modules.title')}
        className="mt-4 overflow-x-auto"
        value={groupId}
        onChange={setGroupId}
        items={GROUPS.map((g) => ({ key: g.id, label: t(`landing.modules.group.${g.id}`), count: g.modules.length }))}
      />

      <div role="tabpanel" aria-label={t(`landing.modules.group.${group.id}`)} className="mt-3">
      <ul className="divide-y divide-[var(--win-border)] border-y border-[var(--win-border)]">
        {group.modules.map(({ id, icon: Icon }) => (
          <li key={id} className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 py-3 sm:grid-cols-[auto_8rem_1fr]">
            <Icon size={15} className="translate-y-0.5 text-[var(--text-secondary)]" />
            <span className="text-[0.875rem] font-semibold">{t(`landing.module.${id}.title`)}</span>
            <div className="col-start-2 sm:col-start-3">
              <p className="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t(`landing.module.${id}.desc`)}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {t(`landing.module.${id}.tags`)
                  .split('|')
                  .map((tag) => (
                    <li key={tag} className="panel-mono rounded-md border border-[var(--win-border)] px-1.5 py-0.5 text-[0.75rem] leading-none text-[var(--text-secondary)]">
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
