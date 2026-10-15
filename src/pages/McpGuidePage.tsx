import { useNavigate } from 'react-router-dom'
import { Activity, ArrowLeft, Bot, Box, HardDrive, MessageSquareText, Shield, Terminal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'
import { PublicShell } from '@/components/public/PublicShell'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { IconBadge } from '@/components/ui/IconBadge'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConnectPanel } from '@/pages/mcp-guide/ConnectPanel'
import { ToolCatalog } from '@/pages/mcp-guide/ToolCatalog'
import { useMcpCatalog } from '@/pages/mcp-guide/useMcpCatalog'

const STEPS = ['token', 'add', 'ask'] as const
const PROMPTS: Array<{ key: string; icon: ReactNode }> = [
  { key: 'health', icon: <Activity size={14} /> },
  { key: 'docker', icon: <Box size={14} /> },
  { key: 'files', icon: <HardDrive size={14} /> },
  { key: 'shell', icon: <Terminal size={14} /> },
]
const ROLE_TONES = [
  { role: 'admin', tone: 'primary' as const },
  { role: 'user', tone: 'info' as const },
  { role: 'anonymous', tone: 'neutral' as const },
]

export function McpGuidePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { counts } = useMcpCatalog()
  const ROLES = ROLE_TONES.map((r) => ({ ...r, count: counts[r.role as keyof typeof counts] }))

  return (
    <PublicShell>
      <main className="mx-auto max-w-4xl space-y-8 px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
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
            {t('mcpGuide.subtitle', { count: counts.admin })}
          </p>
        </header>

        <ConnectPanel />

        {/* Steps */}
        <section aria-labelledby="mcp-steps">
          <h2 id="mcp-steps" className="mb-3 text-xl font-bold tracking-tight">
            {t('mcpGuide.steps.title')}
          </h2>
          <ol className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
            {STEPS.map((step, i) => (
              <li key={step} className="grid grid-cols-[1.75rem_1fr] gap-x-3 px-4 py-3">
                <IconBadge size="sm">{i + 1}</IconBadge>
                <div>
                  <h3 className="pt-0.5 text-[0.875rem] font-semibold">{t(`mcpGuide.steps.${step}.title`)}</h3>
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t(`mcpGuide.steps.${step}.desc`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <ToolCatalog />

        {/* Prompts */}
        <section className="rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5 sm:p-6">
          <SectionHeader icon={<MessageSquareText />} tone="warning" title={t('mcpGuide.prompts.title')} subtitle={t('mcpGuide.prompts.subtitle')} />
          <ul className="mt-4 divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)]">
            {PROMPTS.map((item) => (
              <li key={item.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[var(--panel-info-text)]">
                  {item.icon}
                  {t(`mcpGuide.prompts.${item.key}.title`)}
                </span>
                <q className="text-[0.8125rem] italic leading-relaxed">{t(`mcpGuide.prompts.${item.key}.text`)}</q>
              </li>
            ))}
          </ul>
        </section>

        {/* Roles */}
        <section className="rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5 sm:p-6">
          <SectionHeader icon={<Shield />} tone="success" title={t('mcpGuide.roles.title')} subtitle={t('mcpGuide.roles.subtitle')} />
          <dl className="mt-4 divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)]">
            {ROLES.map((item) => (
              <div key={item.role} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[9rem_1fr_auto] sm:gap-x-4">
                <dt>
                  <Badge tone={item.tone}>{t(`mcpGuide.access.${item.role}`)}</Badge>
                </dt>
                <dd className="panel-mono text-right text-[0.9375rem] font-bold sm:order-last">{item.count}</dd>
                <dd className="col-span-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)] sm:col-span-1">
                  {t(`mcpGuide.roles.${item.role}.desc`)}
                  <span className="mt-0.5 block text-[var(--panel-success-text)]">{t(`mcpGuide.roles.${item.role}.guard`)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </PublicShell>
  )
}
