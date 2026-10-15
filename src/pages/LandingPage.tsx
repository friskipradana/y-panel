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
import { Button } from '@/components/ui/Button'
import { useMcpCatalog } from '@/pages/mcp-guide/useMcpCatalog'

export type LandingPageProps = {
  authenticated: boolean
  onNavigate: (path: string) => void
}

// Short redirect to the latest release asset (Cloudflare redirect rule); INSTALLER_URL is the direct fallback
const INSTALL_COMMAND = 'curl -fsSL https://install.reneo.my.id | sudo bash'

const MODULES: Array<{ id: string; icon: ComponentType<{ size?: number; className?: string }> }> = [
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

const NAME_PARTS = ['rein', 'neo', 'rene'] as const

export function LandingPage({ authenticated, onNavigate }: LandingPageProps) {
  const { t } = useI18n()
  const primaryPath = authenticated ? '/home' : '/login'
  const { counts } = useMcpCatalog()

  return (
    <PublicShell>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        {/* Hero */}
        <section className="mx-auto max-w-3xl text-center">
          <p className="panel-mono mb-3 text-[0.75rem] uppercase tracking-widest text-[var(--text-secondary)]">{t('landing.eyebrow')}</p>
          <h1 className="mb-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {t('landing.hero.line1')} <span className="text-[var(--panel-info-text)]">{t('landing.hero.line2')}</span>
          </h1>
          <p className="mx-auto mb-6 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--text-secondary)] sm:text-base">{t('landing.description')}</p>

          <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" onClick={() => onNavigate(primaryPath)} className="!h-10 !px-5">
              <span>{authenticated ? t('landing.openDashboard') : t('landing.loginAgent')}</span>
              <ArrowRight size={15} />
            </Button>
            <a href={INSTALLER_URL} className="panel-btn !h-10 !px-4">
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

        {/* Product preview */}
        <section className="mt-12" aria-label={t('landing.previewAria')}>
          <DesktopShowcase />
          <p className="mt-2 text-center text-[0.75rem] text-[var(--text-secondary)]">{t('landing.preview.caption')}</p>
        </section>

        {/* Modules: one table instead of a grid of identical cards */}
        <section className="mt-14" aria-labelledby="landing-modules">
          <h2 id="landing-modules" className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('landing.modules.title')}
          </h2>
          <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.modules.subtitle')}</p>

          <ul className="mt-4 divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
            {MODULES.map(({ id, icon: Icon }) => (
              <li key={id} className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[auto_9rem_1fr]">
                <Icon size={15} className="translate-y-0.5 text-[var(--text-secondary)]" />
                <span className="text-[0.875rem] font-semibold">{t(`landing.module.${id}.title`)}</span>
                <span className="col-start-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)] sm:col-start-3">
                  {t(`landing.module.${id}.desc`)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* AI agents */}
        <section className="mt-14" aria-labelledby="landing-agent">
          <h2 id="landing-agent" className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('landing.agent.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">{t('landing.agent.desc')}</p>
          <p className="panel-mono mt-3 text-[0.8125rem]">
            {t('landing.agent.counts', { admin: counts.admin, user: counts.user, anonymous: counts.anonymous })}
          </p>
          <Button variant="primary-soft" onClick={() => onNavigate('/docs/mcp')} className="mt-4">
            <Bot size={14} />
            <span>{t('landing.agent.cta')}</span>
            <ArrowRight size={13} />
          </Button>
        </section>

        {/* Name: three parts as one definition list */}
        <section className="mt-14" aria-labelledby="landing-philosophy">
          <h2 id="landing-philosophy" className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('landing.philosophy.title')}
          </h2>
          <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{t('landing.philosophy.subtitle')}</p>
          <p className="panel-mono mt-1 text-[0.75rem] text-[var(--text-secondary)]">{t('landing.hero.name')}</p>

          <dl className="mt-4 divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)] bg-[var(--panel-surface)]">
            {NAME_PARTS.map((id) => (
              <div key={id} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt className="panel-mono text-[0.8125rem] text-[var(--panel-info-text)]">{t(`landing.philosophy.${id}.tag`)}</dt>
                <dd>
                  <span className="text-[0.875rem] font-semibold">{t(`landing.philosophy.${id}.title`)}</span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{t(`landing.philosophy.${id}.desc`)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <InstallGuide installCommand={INSTALL_COMMAND} onNavigate={onNavigate} />
      </main>
    </PublicShell>
  )
}
