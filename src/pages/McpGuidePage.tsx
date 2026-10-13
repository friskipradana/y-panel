import { useNavigate } from 'react-router-dom'
import { Activity, ArrowLeft, Bot, Box, HardDrive, Shield, Sparkles, Terminal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'
import { PublicShell } from '@/components/public/PublicShell'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { IconBadge } from '@/components/ui/IconBadge'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConnectPanel } from '@/pages/mcp-guide/ConnectPanel'
import { ToolCatalog } from '@/pages/mcp-guide/ToolCatalog'
import { MCP_TOOL_COUNTS } from '@/pages/mcp-guide/toolsData'

const STEPS = ['token', 'add', 'ask'] as const
const PROMPTS: Array<{ key: string; icon: ReactNode }> = [
  { key: 'health', icon: <Activity size={14} /> },
  { key: 'docker', icon: <Box size={14} /> },
  { key: 'files', icon: <HardDrive size={14} /> },
  { key: 'shell', icon: <Terminal size={14} /> },
]
const ROLES = [
  { role: 'admin', count: MCP_TOOL_COUNTS.admin, tone: 'primary' as const },
  { role: 'user', count: MCP_TOOL_COUNTS.user, tone: 'info' as const },
  { role: 'anonymous', count: MCP_TOOL_COUNTS.anonymous, tone: 'neutral' as const },
]

export function McpGuidePage() {
  const { t } = useI18n()
  const navigate = useNavigate()

  return (
    <PublicShell>
      <main className="mx-auto max-w-5xl space-y-8 px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <header className="mx-auto max-w-3xl space-y-4 text-center">
          <Button variant="ghost" onClick={() => navigate('/')} className="mx-auto">
            <ArrowLeft size={13} />
            <span>{t('mcpGuide.back')}</span>
          </Button>
          <Badge tone="success">
            <Bot size={13} />
            {t('mcpGuide.badge')}
          </Badge>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('mcpGuide.title')}</h1>
          <p className="text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
            {t('mcpGuide.subtitle', { count: MCP_TOOL_COUNTS.admin })}
          </p>
        </header>

        <ConnectPanel />

        {/* Steps */}
        <section aria-labelledby="mcp-steps">
          <h2 id="mcp-steps" className="mb-4 text-xl font-bold tracking-tight">
            {t('mcpGuide.steps.title')}
          </h2>
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step} className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5">
                <IconBadge tone={i === 0 ? 'warning' : i === 1 ? 'success' : 'info'}>{i + 1}</IconBadge>
                <h3 className="mt-3 text-[0.875rem] font-semibold">{t(`mcpGuide.steps.${step}.title`)}</h3>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t(`mcpGuide.steps.${step}.desc`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <ToolCatalog />

        {/* Prompts */}
        <section className="rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5 sm:p-6">
          <SectionHeader icon={<Sparkles />} tone="warning" title={t('mcpGuide.prompts.title')} subtitle={t('mcpGuide.prompts.subtitle')} />
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {PROMPTS.map((item) => (
              <figure key={item.key} className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-4">
                <figcaption className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[var(--panel-info-text)]">
                  {item.icon}
                  {t(`mcpGuide.prompts.${item.key}.title`)}
                </figcaption>
                <blockquote className="mt-1.5 text-[0.8125rem] italic leading-relaxed">{t(`mcpGuide.prompts.${item.key}.text`)}</blockquote>
              </figure>
            ))}
          </div>
        </section>

        {/* Roles */}
        <section className="rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5 sm:p-6">
          <SectionHeader icon={<Shield />} tone="success" title={t('mcpGuide.roles.title')} subtitle={t('mcpGuide.roles.subtitle')} />
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {ROLES.map((item) => (
              <article key={item.role} className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-strong)] p-4">
                <div className="flex items-center justify-between">
                  <Badge tone={item.tone}>{t(`mcpGuide.access.${item.role}`)}</Badge>
                  <span className="panel-mono text-lg font-bold">{item.count}</span>
                </div>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t(`mcpGuide.roles.${item.role}.desc`)}</p>
                <p className="mt-2 text-[0.75rem] text-[var(--panel-success-text)]">{t(`mcpGuide.roles.${item.role}.guard`)}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </PublicShell>
  )
}
