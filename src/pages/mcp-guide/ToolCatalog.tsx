import { useMemo, useState } from 'react'
import { Wrench } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { Badge } from '@/components/ui/Badge'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/states'
import { MCP_TOOLS, MCP_TOOL_COUNTS, type ToolAccess, type ToolKind } from './toolsData'

const TOOL_GROUPS = ['overview', 'system', 'docker', 'files', 'projects', 'cloudflare', 'widgets', 'users'] as const
type GroupKey = 'all' | (typeof TOOL_GROUPS)[number]

const KIND_TONE: Record<ToolKind, 'success' | 'warning' | 'danger'> = { read: 'success', write: 'warning', destroy: 'danger' }
const ACCESS_TONE: Record<ToolAccess, 'neutral' | 'info' | 'primary'> = { anonymous: 'neutral', user: 'info', admin: 'primary' }

// Searchable catalog of every tool the agent can call, generated from the real registry
export function ToolCatalog() {
  const { t } = useI18n()
  const [group, setGroup] = useState<GroupKey>('all')
  const [query, setQuery] = useState('')

  const tabs: TabItem<GroupKey>[] = [
    { key: 'all', label: t('mcpGuide.tools.all'), count: MCP_TOOLS.length },
    ...TOOL_GROUPS.map((g) => ({
      key: g as GroupKey,
      label: t(`mcpGuide.group.${g}`),
      count: MCP_TOOLS.filter((tool) => tool.group === g).length,
    })),
  ]

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return MCP_TOOLS.filter(
      (tool) => (group === 'all' || tool.group === group) && (!q || tool.name.includes(q) || tool.desc.toLowerCase().includes(q)),
    )
  }, [group, query])

  return (
    <section className="rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5 sm:p-6" aria-labelledby="mcp-tools">
      <SectionHeader
        icon={<Wrench />}
        tone="info"
        title={t('mcpGuide.tools.title')}
        subtitle={t('mcpGuide.tools.subtitle', { count: MCP_TOOL_COUNTS.admin })}
      />

      <div className="mt-5 space-y-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t('mcpGuide.tools.search')} />
        <Tabs items={tabs} value={group} onChange={setGroup} label={t('mcpGuide.tools.groups')} className="flex-wrap" />

        <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.75rem] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            <Badge tone="success">read</Badge>
            {t('mcpGuide.tools.legendRead')}
          </span>
          <span className="flex items-center gap-1.5">
            <Badge tone="warning">write</Badge>
            {t('mcpGuide.tools.legendWrite')}
          </span>
          <span className="flex items-center gap-1.5">
            <Badge tone="danger">destroy</Badge>
            {t('mcpGuide.tools.legendDestroy')}
          </span>
        </div>

        {rows.length === 0 ? (
          <EmptyState>{t('mcpGuide.tools.empty')}</EmptyState>
        ) : (
          <ul className="max-h-[32rem] divide-y divide-[var(--win-border)] overflow-y-auto rounded-xl border border-[var(--win-border)] custom-widget-scrollbar">
            {rows.map((tool) => (
              <li key={tool.name} className="flex flex-col gap-1.5 px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <code className="panel-mono text-[0.8125rem] font-semibold text-[var(--panel-info-text)]">{tool.name}</code>
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{tool.desc}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={KIND_TONE[tool.kind]}>{tool.kind}</Badge>
                  <Badge tone={ACCESS_TONE[tool.access]}>{t(`mcpGuide.access.${tool.access}`)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
