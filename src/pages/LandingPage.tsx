import {
  Activity,
  ArrowRight,
  Bot,
  Box,
  Database,
  Download,
  FileText,
  FolderKanban,
  Globe,
  HardDrive,
  LayoutGrid,
  Settings,
  Terminal,
  Users,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useI18n } from '@/lib/i18n'
import { DesktopShowcase } from '@/components/landing/DesktopShowcase'
import { PublicShell, INSTALLER_URL } from '@/components/public/PublicShell'
import { CopyBlock } from '@/components/public/CopyBlock'
import { InstallGuide } from '@/pages/landing/InstallGuide'
import { IconBadge } from '@/components/ui/IconBadge'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useMcpCatalog } from '@/pages/mcp-guide/useMcpCatalog'

export type LandingPageProps = {
  authenticated: boolean
  onNavigate: (path: string) => void
}

// Short redirect to the latest release asset (Cloudflare redirect rule); INSTALLER_URL is the direct fallback
const INSTALL_COMMAND = 'curl -fsSL https://install.reneo.my.id | sudo bash'

const MODULES: Array<{ id: string; icon: ComponentType<{ size?: number }> }> = [
  { id: 'docker', icon: Box },
  { id: 'projects', icon: FolderKanban },
  { id: 'cloudflare', icon: Globe },
  { id: 'terminal', icon: Terminal },
  { id: 'files', icon: HardDrive },
  { id: 'users', icon: Users },
  { id: 'database', icon: Database },
  { id: 'system', icon: Activity },
  { id: 'logs', icon: FileText },
  { id: 'widgets', icon: LayoutGrid },
  { id: 'settings', icon: Settings },
  { id: 'mcp', icon: Bot },
]

const PHILOSOPHY = [{ id: 'rein' }, { id: 'neo' }, { id: 'rene' }] as const

export function LandingPage({ authenticated, onNavigate }: LandingPageProps) {
  const { t } = useI18n()
  const primaryPath = authenticated ? '/home' : '/login'
  const { counts } = useMcpCatalog()

  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        {/* Hero */}
        <section className="mx-auto max-w-3xl text-center">
          <p className="panel-mono mb-4 text-[0.75rem] uppercase tracking-widest text-[var(--panel-info-text)]">{t('landing.eyebrow')}</p>
          <h1 className="mb-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
            {t('landing.hero.line1')}{' '}
            <span className="bg-gradient-to-r from-[var(--panel-info-text)] to-[var(--panel-primary-text)] bg-clip-text text-transparent">
              {t('landing.hero.line2')}
            </span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">{t('landing.description')}</p>

          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" onClick={() => onNavigate(primaryPath)} className="!h-11 !px-6">
              <span>{authenticated ? t('landing.openDashboard') : t('landing.loginAgent')}</span>
              <ArrowRight size={15} />
            </Button>
            <a href={INSTALLER_URL} className="panel-btn !h-11 !px-5">
              <Download size={15} />
              <span>{t('landing.downloadInstaller')}</span>
            </a>
          </div>

          <div className="mx-auto max-w-2xl text-left">
            <CopyBlock text={INSTALL_COMMAND} prompt="$" />
            <p className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[0.75rem] text-[var(--text-secondary)]">
              <span>{t('landing.pasteTerminal')}</span>
              <span aria-hidden="true">·</span>
              <a href="#landing-guide" className="text-[var(--panel-info-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
                {t('landing.hero.guideLink')}
              </a>
            </p>
          </div>
        </section>

        {/* Live desktop preview */}
        <section className="mt-14" aria-label={t('landing.previewAria')}>
          <DesktopShowcase />
        </section>

        {/* Name and philosophy */}
        <section className="mt-20" aria-labelledby="landing-philosophy">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <h2 id="landing-philosophy" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t('landing.philosophy.title')}
            </h2>
            <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.philosophy.subtitle')}</p>
            <p className="panel-mono mt-1 text-[0.75rem] text-[var(--text-secondary)]">{t('landing.hero.name')}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {PHILOSOPHY.map((item) => (
              <article key={item.id} className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-5">
                <p className="panel-mono text-[0.75rem] uppercase tracking-widest text-[var(--panel-info-text)]">{t(`landing.philosophy.${item.id}.tag`)}</p>
                <h3 className="mt-2 text-xl font-bold tracking-tight">{t(`landing.philosophy.${item.id}.title`)}</h3>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t(`landing.philosophy.${item.id}.desc`)}</p>
              </article>
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-2xl text-center text-[0.9375rem] font-medium leading-relaxed">
            {t('landing.philosophy.summary')}
          </p>
        </section>

        {/* Modules */}
        <section className="mt-20" aria-labelledby="landing-modules">
          <div className="mb-8 text-center">
            <h2 id="landing-modules" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t('landing.modules.title')}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-[0.875rem] text-[var(--text-secondary)]">{t('landing.modules.subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(({ id, icon: Icon }) => (
              <article
                key={id}
                className="flex items-start gap-3 rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-4 transition-colors hover:bg-[var(--panel-surface-hover)]"
              >
                <IconBadge tone={id === 'mcp' ? 'warning' : 'info'}>
                  <Icon />
                </IconBadge>
                <div className="min-w-0">
                  <h3 className="text-[0.875rem] font-semibold">{t(`landing.module.${id}.title`)}</h3>
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t(`landing.module.${id}.desc`)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* AI agents */}
        <section
          className="mt-20 rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-6 sm:p-8"
          aria-labelledby="landing-agent"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <Badge tone="warning" className="mb-3">{t('landing.agent.badge')}</Badge>
              <h2 id="landing-agent" className="text-2xl font-bold tracking-tight">
                {t('landing.agent.title')}
              </h2>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.agent.desc')}</p>
              <Button variant="primary-soft" onClick={() => onNavigate('/docs/mcp')} className="mt-5">
                <Bot size={14} />
                <span>{t('landing.agent.cta')}</span>
                <ArrowRight size={13} />
              </Button>
            </div>

            <dl className="grid grid-cols-3 gap-3 text-center md:min-w-[18rem]">
              {(
                [
                  [counts.admin, t('landing.agent.statTools')],
                  [counts.user, t('landing.agent.statUser')],
                  [3, t('landing.agent.statRoles')],
                ] as Array<[number, string]>
              ).map(([value, label]) => (
                <div key={label} className="rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface-strong)] px-3 py-4">
                  <dt className="panel-mono text-2xl font-bold">{value}</dt>
                  <dd className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <InstallGuide installCommand={INSTALL_COMMAND} onNavigate={onNavigate} />
      </main>
    </PublicShell>
  )
}
