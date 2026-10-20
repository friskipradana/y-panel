import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Bot, Download, ExternalLink, GitBranch, Languages, Moon, Sun } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { RELEASES_URL, releaseUrl, usePanelVersion } from '@/lib/version'
import { IconButton } from '@/components/ui/IconButton'
import { useThemeStore } from '@/store/themeStore'

export const GITHUB_URL = 'https://github.com/friskipradana/y-panel'
export const INSTALLER_URL = `${GITHUB_URL}/releases/latest/download/reneo-installer.run`

const LEGAL_LINKS = [
  { path: '/terms', key: 'legal.link.terms' },
  { path: '/privacy', key: 'legal.link.privacy' },
] as const

interface PublicShellProps {
  children: ReactNode
}

// Shared frame of the public pages (landing, MCP guide, articles). Follows the saved light/dark mode.
export function PublicShell({ children }: PublicShellProps) {
  const { t, language, setLanguage } = useI18n()
  const navigate = useNavigate()
  const { version } = usePanelVersion()
  const themeMode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)

  const navLink =
    'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] text-[var(--text-secondary)] transition-colors hover:bg-[var(--panel-surface-hover)] hover:text-[var(--win-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

  return (
    <div className="relative flex min-h-full w-full flex-col overflow-x-clip bg-[var(--win-bg)] font-sans text-[var(--win-text)] antialiased">

      <header className="sticky top-0 z-50 border-b border-[var(--win-border)] bg-[var(--win-bg)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
              <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
              <span className="text-[0.9375rem] font-bold tracking-tight">Reneo</span>
            </button>
            <span className="max-[520px]:hidden">
              <a
                href={releaseUrl(version)}
                target="_blank"
                rel="noreferrer"
                title={t('public.versionTitle')}
                className="panel-badge panel-badge--info panel-mono !text-[0.6875rem]"
              >
                v{version}
              </a>
            </span>
          </div>

          <nav aria-label={t('public.navLabel')} className="flex items-center gap-1">
            <button type="button" onClick={() => navigate('/articles')} className={navLink}>
              <BookOpen size={14} />
              <span className="hidden md:inline">{t('public.nav.articles')}</span>
            </button>
            <button type="button" onClick={() => navigate('/docs/mcp')} className={navLink}>
              <Bot size={14} />
              <span className="hidden md:inline">{t('public.nav.mcp')}</span>
            </button>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={navLink}>
              <GitBranch size={14} />
              <span className="hidden md:inline">GitHub</span>
              <ExternalLink size={11} className="hidden opacity-60 md:inline" />
            </a>
            <a href={INSTALLER_URL} className={`${navLink} max-sm:hidden`}>
              <Download size={14} />
              <span className="hidden md:inline">{t('public.nav.installer')}</span>
            </a>
            <button
              type="button"
              onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
              title={`${t('language.label')}: ${language === 'id' ? t('language.english') : t('language.indonesian')}`}
              aria-label={`${t('language.label')}: ${language === 'id' ? t('language.english') : t('language.indonesian')}`}
              className={navLink}
            >
              <Languages size={14} />
              <span className="text-[0.75rem] font-semibold uppercase">{language}</span>
            </button>
            <IconButton label={themeMode === 'dark' ? t('public.theme.toLight') : t('public.theme.toDark')} onClick={toggleMode}>
              {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </IconButton>
          </nav>
        </div>
      </header>

      <div className="relative z-10 flex-1">{children}</div>

      <footer className="relative z-10 border-t border-[var(--win-border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-2 text-center text-[0.6875rem] text-[var(--text-secondary)] sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <nav aria-label={t('public.footer.legal')} className="flex flex-wrap items-center justify-center gap-x-2.5">
            {LEGAL_LINKS.map(({ path, key }) => (
              <a
                key={path}
                href={path}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(path)
                }}
                className="inline-flex h-5 items-center hover:text-[var(--win-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {t(key)}
              </a>
            ))}
          </nav>
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 leading-5">
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="panel-mono hover:text-[var(--win-text)] hover:underline">
              v{version}
            </a>
            <span aria-hidden="true">·</span>
            <span>{t('public.footer.tagline')}</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
