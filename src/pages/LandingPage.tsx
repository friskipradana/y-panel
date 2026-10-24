import { ArrowRight, Bot, Download, Eye } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { DesktopShowcase } from '@/components/landing/DesktopShowcase'
import { PublicShell, INSTALLER_URL } from '@/components/public/PublicShell'
import { CopyBlock } from '@/components/public/CopyBlock'
import { Button } from '@/components/ui/Button'
import { useQuery } from '@tanstack/react-query'
import { getDemoInfo } from '@/api/agent'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useMcpCatalog } from '@/pages/mcp-guide/useMcpCatalog'
import { Background } from '@/pages/landing/Background'
import { Faq } from '@/pages/landing/Faq'
import { Modules } from '@/pages/landing/Modules'
import { Philosophy } from '@/pages/landing/Philosophy'
import { Pricing } from '@/pages/landing/Pricing'

export type LandingPageProps = {
  authenticated: boolean
  onNavigate: (path: string) => void
}

// Short redirect to the latest release asset (Cloudflare redirect rule); INSTALLER_URL is the direct fallback
const INSTALL_COMMAND = 'curl -fsSL https://panel.reneo.my.id/install | sudo bash'

const HERO_FACTS = ['linux', 'agent', 'reach', 'mcp'] as const

const HERO_ACTION = '!h-11 w-full justify-center !px-4'
// Login is solid blue, the demo is the same soft outline as the installer with a blue edge and label, the installer is a neutral outline
const HERO_TINT = '!border-[color-mix(in_srgb,var(--panel-primary-text)_35%,var(--win-border))] !text-[var(--panel-primary-text)]'

export function LandingPage({ authenticated, onNavigate }: LandingPageProps) {
  const { data: demo } = useQuery({ queryKey: ['public-demo'], queryFn: getDemoInfo, staleTime: 5 * 60_000, retry: false })
  const { t } = useI18n()
  const primaryPath = authenticated ? '/home' : '/login'
  const { counts } = useMcpCatalog(false)
  usePageMeta(t('landing.metaTitle'), t('landing.description'))

  return (
    <PublicShell>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        {/* Hero */}
        <section className="mx-auto max-w-4xl text-center">
          <p className="panel-mono mb-4 text-[0.75rem] uppercase tracking-widest text-[var(--text-secondary)]">{t('landing.eyebrow')}</p>
          <h1 className="mx-auto mb-4 max-w-3xl text-balance text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            {t('landing.hero.line1')} <span className="text-[var(--panel-info-text)]">{t('landing.hero.line2')}</span>
          </h1>
          <p className="mb-4 text-balance text-base font-semibold text-[var(--panel-info-text)] sm:text-lg">{t('landing.tagline')}</p>
          <p className="mx-auto max-w-2xl text-balance text-[0.9375rem] leading-relaxed text-[var(--text-secondary)] sm:text-base">{t('landing.description')}</p>

          {/* Mobile: Infinite smooth sliding ticker */}
          <div
            className="mx-auto mb-7 mt-5 w-full max-w-2xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] sm:hidden"
            aria-hidden="true"
          >
            <div className="hero-facts-marquee py-0.5">
              {[...HERO_FACTS, ...HERO_FACTS].map((id, index) => (
                <span
                  key={`${id}-${index}`}
                  className="panel-mono mr-2 flex shrink-0 items-center justify-center rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-2.5 py-1 text-center text-[0.6875rem] leading-none text-[var(--text-secondary)] shadow-xs"
                >
                  {t(`landing.hero.fact.${id}`)}
                </span>
              ))}
            </div>
          </div>

          {/* Desktop: Static centered row */}
          <ul
            className="mx-auto mb-7 mt-5 hidden sm:flex sm:max-w-2xl sm:flex-wrap sm:justify-center sm:gap-1.5"
            aria-label={t('landing.hero.factsLabel')}
          >
            {HERO_FACTS.map((id) => (
              <li
                key={id}
                className="panel-mono rounded-md border border-[var(--win-border)] bg-[var(--panel-surface)] px-2 py-1 text-[0.75rem] leading-none text-[var(--text-secondary)]"
              >
                {t(`landing.hero.fact.${id}`)}
              </li>
            ))}
          </ul>

          {/* Primary actions: Login and Demo */}
          <div className="mx-auto mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-md">
            <Button variant="primary" onClick={() => onNavigate(primaryPath)} className={HERO_ACTION}>
              <span>{authenticated ? t('landing.openDashboard') : t('landing.loginAgent')}</span>
              <ArrowRight size={15} />
            </Button>
            {!authenticated && demo?.enabled ? (
              <Button variant="outline" onClick={() => onNavigate('/login?demo=1')} className={`${HERO_ACTION} ${HERO_TINT}`}>
                <Eye size={15} />
                <span>{t('landing.demo.heroCta')}</span>
              </Button>
            ) : null}
          </div>

          <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--win-border)] bg-[var(--panel-surface)] p-3 sm:p-4 text-left shadow-xs">
            <CopyBlock text={INSTALL_COMMAND} prompt="$" />
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-center text-[0.75rem] text-[var(--text-secondary)]">
              <span>{t('landing.pasteTerminal')}</span>
              <span aria-hidden="true">·</span>
              <a
                href={INSTALLER_URL}
                className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--win-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <Download size={13} />
                <span>{t('landing.downloadInstaller')}</span>
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="/install"
                onClick={(e) => {
                  e.preventDefault()
                  onNavigate('/install')
                }}
                className="text-[var(--panel-info-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
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

        {/* What is offered comes first, then why the panel exists and what the name means */}
        <Pricing />

        <Background />

        <Philosophy />

        <Modules />

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

        <Faq />
      </main>
    </PublicShell>
  )
}
