import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  Box,
  Database,
  FileText,
  FolderKanban,
  GalleryHorizontal,
  Gauge,
  Globe,
  HardDrive,
  LayoutGrid,
  List,
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
  const [mobileMode, setMobileMode] = useState<'swipe' | 'list'>('swipe')
  const group = GROUPS.find((g) => g.id === groupId) ?? GROUPS[0]
  return (
    <section className="mt-14" aria-labelledby="landing-modules">
      <h2 id="landing-modules" className="text-xl font-bold tracking-tight sm:text-2xl">
        {t('landing.modules.title')}
      </h2>
      <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.modules.subtitle', { count: MODULE_COUNT })}</p>

      {/* Mobile Category Dropdown & View Mode Toggle */}
      <div className="mt-4 flex items-center gap-2 sm:hidden">
        <label htmlFor="landing-modules-mobile-select" className="sr-only">
          {t('landing.modules.title')}
        </label>
        <div className="min-w-0 flex-1">
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

        {/* View Mode Toggle: Swipe vs List */}
        <div
          role="group"
          aria-label={t('landing.modules.title')}
          className="flex shrink-0 items-center rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)]/60 p-0.5 shadow-2xs"
        >
          <button
            type="button"
            onClick={() => setMobileMode('swipe')}
            aria-label={t('landing.modules.viewSwipe')}
            title={t('landing.modules.viewSwipe')}
            aria-pressed={mobileMode === 'swipe'}
            className={`flex h-8.5 w-8.5 items-center justify-center rounded-md transition-colors ${
              mobileMode === 'swipe'
                ? 'border border-[var(--panel-primary-border)] bg-[var(--panel-primary-subtle)] text-[var(--panel-primary-text)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
            }`}
          >
            <GalleryHorizontal size={15} />
          </button>
          <button
            type="button"
            onClick={() => setMobileMode('list')}
            aria-label={t('landing.modules.viewList')}
            title={t('landing.modules.viewList')}
            aria-pressed={mobileMode === 'list'}
            className={`flex h-8.5 w-8.5 items-center justify-center rounded-md transition-colors ${
              mobileMode === 'list'
                ? 'border border-[var(--panel-primary-border)] bg-[var(--panel-primary-subtle)] text-[var(--panel-primary-text)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--win-text)]'
            }`}
          >
            <List size={15} />
          </button>
        </div>
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

      {/* Mobile View: Swipe Carousel OR List View */}
      <div className="mt-4 sm:hidden" role="tabpanel" aria-label={t(`landing.modules.group.${group.id}`)}>
        {mobileMode === 'swipe' ? (
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pt-1 pb-3.5 px-1 -mx-1">
            {group.modules.map(({ id, icon: Icon }, idx) => (
              <div
                key={id}
                className="flex w-[82vw] max-w-[310px] shrink-0 snap-start flex-col justify-between rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)]/40 p-4 shadow-2xs backdrop-blur-xs transition-colors hover:border-[var(--panel-primary-border)]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <IconBadge size="lg" tone="neutral">
                      <Icon />
                    </IconBadge>
                    <span className="panel-mono text-[0.6875rem] font-medium text-[var(--text-muted)]">
                      {idx + 1} / {group.modules.length}
                    </span>
                  </div>

                  <h3 className="mt-3.5 text-[0.9375rem] font-bold tracking-tight text-[var(--win-text)]">
                    {t(`landing.module.${id}.title`)}
                  </h3>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                    {t(`landing.module.${id}.desc`)}
                  </p>
                </div>

                <div className="mt-4 border-t border-[var(--win-border)]/50 pt-3">
                  <ul className="flex flex-wrap gap-1.5">
                    {t(`landing.module.${id}.tags`)
                      .split('|')
                      .map((tag) => (
                        <li
                          key={tag}
                          className="panel-mono rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)]/60 px-2 py-0.5 text-[0.6875rem] font-medium leading-none text-[var(--text-secondary)]"
                        >
                          {tag}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]/25 shadow-2xs backdrop-blur-xs">
            <ul className="divide-y divide-[var(--win-border)]/40">
              {group.modules.map(({ id, icon: Icon }) => {
                const tags = t(`landing.module.${id}.tags`).split('|')
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-[var(--panel-surface)]/60"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <IconBadge size="md" tone="neutral" className="shrink-0">
                        <Icon />
                      </IconBadge>
                      <div className="min-w-0">
                        <h3 className="truncate text-[0.875rem] font-bold tracking-tight text-[var(--win-text)]">
                          {t(`landing.module.${id}.title`)}
                        </h3>
                        <p className="line-clamp-1 text-[0.75rem] leading-snug text-[var(--text-secondary)]">
                          {t(`landing.module.${id}.desc`)}
                        </p>
                      </div>
                    </div>

                    {/* Compact Tag Pills on Right */}
                    <div className="hidden shrink-0 min-[380px]:flex items-center gap-1">
                      {tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="panel-mono rounded border border-[var(--win-border)] bg-[var(--panel-surface)]/70 px-1.5 py-0.5 text-[0.625rem] font-medium text-[var(--text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                      {tags.length > 2 && (
                        <span className="panel-mono text-[0.625rem] text-[var(--text-muted)] font-medium">
                          +{tags.length - 2}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Desktop / Tablet: Workstation List View */}
      <div
        role="tabpanel"
        aria-label={t(`landing.modules.group.${group.id}`)}
        className="mt-4 hidden overflow-hidden rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)]/25 shadow-2xs backdrop-blur-xs sm:block"
      >
        <ul className="divide-y divide-[var(--win-border)]/50">
          {group.modules.map(({ id, icon: Icon }) => (
            <li
              key={id}
              className="group flex flex-row items-center justify-between gap-4 p-4.5 transition-all duration-150 hover:bg-[var(--panel-surface)]/60"
            >
              {/* Left: IconBadge + Title + Description */}
              <div className="flex max-w-xl items-start gap-3.5">
                <IconBadge
                  size="lg"
                  tone="neutral"
                  className="mt-0.5 shrink-0 transition-colors group-hover:border-[var(--panel-primary-border)] group-hover:bg-[var(--panel-primary-subtle)] group-hover:text-[var(--panel-primary-text)]"
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
              <div className="shrink-0">
                <ul className="flex max-w-sm flex-wrap justify-end gap-1.5">
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
