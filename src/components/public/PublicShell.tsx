import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Bot, Download, ExternalLink, GitBranch } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/lib/i18n'
import { RELEASES_URL, releaseUrl, usePanelVersion } from '@/lib/version'
import { Button } from '@/components/ui/Button'

export const GITHUB_URL = 'https://github.com/friskipradana/y-panel'
export const INSTALLER_URL = `${GITHUB_URL}/releases/latest/download/ypanel-installer.run`

interface PublicShellProps {
  children: ReactNode
}

// Shared frame of the public pages (landing, MCP guide). Always dark, whatever the desktop theme.
export function PublicShell({ children }: PublicShellProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const authenticated = useAuthStore((s) => s.authenticated)
  const { version } = usePanelVersion()
  const primaryPath = authenticated ? '/home' : '/login'

  const navLink =
    'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

  return (
    <div data-theme="dark" className="relative min-h-full w-full bg-[var(--win-bg)] font-sans text-[var(--win-text)] antialiased">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{ background: 'radial-gradient(ellipse 80% 55% at 50% -10%, var(--panel-info-bg), transparent 70%)' }}
      />

      <header className="sticky top-0 z-50 border-b border-[var(--win-border)] bg-[var(--win-bg)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
              <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
              <span className="text-[0.9375rem] font-bold tracking-tight">Reneo</span>
            </button>
            <a
              href={releaseUrl(version)}
              target="_blank"
              rel="noreferrer"
              title={t('public.versionTitle')}
              className="panel-badge panel-badge--info panel-mono !text-[0.6875rem]"
            >
              v{version}
            </a>
          </div>

          <nav aria-label={t('public.navLabel')} className="flex items-center gap-1">
            <button type="button" onClick={() => navigate('/docs/mcp')} className={navLink}>
              <Bot size={14} />
              <span className="hidden md:inline">{t('public.nav.mcp')}</span>
            </button>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={navLink}>
              <GitBranch size={14} />
              <span className="hidden md:inline">GitHub</span>
              <ExternalLink size={11} className="hidden opacity-60 md:inline" />
            </a>
            <a href={INSTALLER_URL} className={navLink}>
              <Download size={14} />
              <span className="hidden md:inline">{t('public.nav.installer')}</span>
            </a>
            <Button variant="primary" onClick={() => navigate(primaryPath)} className="ml-1 !h-8">
              <span>{authenticated ? t('landing.openDashboard') : t('landing.loginAgent')}</span>
              <ArrowRight size={13} />
            </Button>
          </nav>
        </div>
      </header>

      <div className="relative z-10">{children}</div>

      <footer className="relative z-10 border-t border-[var(--win-border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-[0.75rem] text-[var(--text-secondary)] sm:flex-row sm:px-6">
          <span>
            {t('public.footer.owner')} <strong className="text-[var(--win-text)]">Y_Corp</strong> · {t('public.footer.contributors')}{' '}
            <strong className="text-[var(--win-text)]">AknalRe · FriskiPradana</strong>
          </span>
          <span className="flex items-center gap-3">
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="panel-mono hover:text-[var(--win-text)]">
              v{version}
            </a>
            <span>{t('public.footer.tagline')}</span>
            <span className="hidden sm:inline">{t('public.footer.formerly')}</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
