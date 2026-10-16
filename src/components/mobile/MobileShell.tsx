import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ChevronLeft, Home, Layers, Lock, LogOut, Monitor, Moon, Search, Sun, User, X } from 'lucide-react'
import { AppIcon } from '@/components/common/AppIcon'
import { InnerAlert } from '@/components/alert/GlobalAlert'
import { WindowErrorBoundary } from '@/components/system/WindowErrorBoundary'
import { WINDOW_CONTENT, WindowFallback, canAccessWindow } from '@/components/desktop/windowRegistry'
import { MobileHome } from '@/components/mobile/MobileHome'
import { MobileNotifications } from '@/components/mobile/MobileNotifications'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { IconBadge } from '@/components/ui/IconBadge'
import { useSystemSampler } from '@/hooks/useSystemSampler'
import { useWidgetSync } from '@/hooks/useWidgetSync'
import { setUiMode } from '@/hooks/useIsMobileLayout'
import { useAlertStore } from '@/store/alertStore'
import { useAuthStore } from '@/store/authStore'
import { useCommandStore } from '@/store/commandStore'
import { useThemeStore } from '@/store/themeStore'
import { useWindowStore } from '@/store/windowStore'
import { useI18n, windowTitleKey } from '@/lib/i18n'
import type { WindowKind } from '@/types'

interface MobileShellProps {
  authenticated: boolean
  onLogout: () => void
}

const QUICK_APPS: WindowKind[] = ['apps', 'host-terminal', 'file-manager']
const SCROLL_OWNERS: WindowKind[] = ['host-terminal', 'system-logs', 'file-editor']

// Phone layout: one app at a time, bottom navigation, no floating windows
export function MobileShell({ authenticated, onLogout }: MobileShellProps) {
  const { t, language, setLanguage } = useI18n()
  const user = useAuthStore((s) => s.user)
  const role = user?.role ?? null
  const { windows, focusedId, openWindow, closeWindow, focusWindow } = useWindowStore()
  const openPalette = useCommandStore((s) => s.openCommandPalette)
  const alertState = useAlertStore()
  const themeMode = useThemeStore((s) => s.mode)
  const setThemeMode = useThemeStore((s) => s.setMode)
  const setIsLocked = useThemeStore((s) => s.setIsLocked)

  const [view, setView] = useState<'home' | 'app'>('home')
  const [switcher, setSwitcher] = useState(false)
  const [account, setAccount] = useState(false)

  // The desktop layer normally owns these background jobs
  useSystemSampler()
  useWidgetSync()

  // A window opened from elsewhere (palette, another app) takes over the screen
  const openCount = useRef(windows.length)
  useEffect(() => {
    if (windows.length > openCount.current) setView('app')
    openCount.current = windows.length
  }, [windows.length])

  const open = useMemo(() => windows.filter((w) => canAccessWindow(w.kind, role)), [windows, role])
  const current = view === 'app' ? open.find((w) => w.id === focusedId) : undefined

  // Apps stay mounted once visited (hidden, not unmounted) so a terminal session or a form
  // survives going home and coming back. Closing a window releases it.
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    if (!current) return
    setVisited((prev) => (prev.includes(current.id) ? prev : [...prev, current.id]))
  }, [current])
  const kept = open.filter((w) => visited.includes(w.id) || w.id === current?.id)

  const launch = (kind: WindowKind) => {
    const id = openWindow(kind)
    focusWindow(id)
    setView('app')
    setSwitcher(false)
  }

  const goHome = () => {
    setView('home')
    setSwitcher(false)
  }

  const quick = QUICK_APPS.filter((kind) => canAccessWindow(kind, role))
  // short labels: the bottom bar has room for one word
  const quickLabel = (kind: WindowKind) =>
    kind === 'host-terminal' ? t('mobile.terminal') : kind === 'file-manager' ? t('mobile.files') : t(windowTitleKey(kind))
  const showingApp = Boolean(current && WINDOW_CONTENT[current.kind])
  const alertForCurrent = current ? alertState.isOpen && alertState.data?.windowId === current.kind : false

  const navButton = (key: string, active: boolean, label: string, onClick: () => void, icon: ReactNode, badge?: number) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.6875rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] ${
        active ? 'text-[var(--panel-primary-text)]' : 'text-[var(--text-secondary)]'
      }`}
    >
      <span className="relative grid h-6 w-6 place-items-center">
        {icon}
        {badge ? (
          <span className="panel-mono absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-[var(--panel-primary-solid)] px-1 text-center text-[0.625rem] leading-4 text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="w-full truncate text-center">{label}</span>
    </button>
  )

  return (
    <div className="layout-mobile flex h-dvh w-full flex-col bg-[var(--win-content-bg)] text-[var(--win-text)]">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--win-border)] bg-[var(--win-bar)] px-2">
        {showingApp && current ? (
          <>
            <IconButton label={t('mobile.back')} onClick={goHome}>
              <ChevronLeft className="h-5 w-5" />
            </IconButton>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <AppIcon kind={current.kind} size={18} />
              <span className="truncate text-[0.9375rem] font-semibold">{t(windowTitleKey(current.kind))}</span>
            </span>
            <IconButton
              label={t('common.close')}
              onClick={() => {
                closeWindow(current.id)
                goHome()
              }}
            >
              <X className="h-5 w-5" />
            </IconButton>
          </>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-2 pl-2">
              <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-lg" />
              <span className="text-[0.9375rem] font-bold tracking-tight">Reneo</span>
            </span>
            <IconButton label={t('mobile.search')} onClick={openPalette}>
              <Search className="h-5 w-5" />
            </IconButton>
            {authenticated ? <MobileNotifications /> : null}
            <IconButton
              label={`${t('language.label')}: ${language === 'id' ? t('language.english') : t('language.indonesian')}`}
              onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
            >
              <span className="text-[0.75rem] font-bold uppercase">{language}</span>
            </IconButton>
            <IconButton
              label={themeMode === 'dark' ? t('public.theme.toLight') : t('public.theme.toDark')}
              onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
            >
              {themeMode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </IconButton>
            <button
              type="button"
              onClick={() => setAccount(true)}
              aria-label={t('mobile.account')}
              className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <IconBadge size="md" tone="primary">
                {(user?.displayName || user?.username || '?').charAt(0).toUpperCase()}
              </IconBadge>
            </button>
          </>
        )}
      </header>

      {/* Content */}
      <main className="relative min-h-0 flex-1 overflow-hidden [contain:layout]">
        {kept.map((win) => {
          const renderContent = WINDOW_CONTENT[win.kind]
          if (!renderContent) return null
          const isCurrent = showingApp && current?.id === win.id
          const owns = SCROLL_OWNERS.includes(win.kind)
          return (
            <div key={win.id} hidden={!isCurrent} className="relative flex h-full flex-col">
              <div className={`min-h-0 flex-1 ${owns ? 'overflow-hidden' : 'overflow-auto'}`}>
                <div className={owns ? 'flex h-full flex-col' : 'min-h-full'}>
                  <WindowErrorBoundary>
                    <Suspense fallback={<WindowFallback />}>{renderContent(win, authenticated)}</Suspense>
                  </WindowErrorBoundary>
                </div>
              </div>
            </div>
          )
        })}
        {showingApp ? (
          <AnimatePresence>
            {alertForCurrent ? (
              <div className="absolute inset-0 z-[100] flex items-center justify-center overflow-hidden">
                <InnerAlert data={alertState.data} closeDialog={alertState.closeDialog} />
              </div>
            ) : null}
          </AnimatePresence>
        ) : (
          <div className="h-full overflow-y-auto">
            <MobileHome role={role} onLaunch={launch} />
          </div>
        )}
      </main>

      {/* Bottom navigation */}
      <nav
        aria-label={t('public.navLabel')}
        className="flex shrink-0 items-stretch border-t border-[var(--win-border)] bg-[var(--win-bar)] pb-[env(safe-area-inset-bottom)]"
      >
        {navButton('home', !showingApp, t('mobile.home'), goHome, <Home size={20} />)}
        {quick.map((kind) =>
          navButton(kind, current?.kind === kind, quickLabel(kind), () => launch(kind), <AppIcon kind={kind} size={20} />),
        )}
        {navButton('windows', switcher, t('mobile.windows'), () => setSwitcher(true), <Layers size={20} />, open.length || undefined)}
      </nav>

      {/* Open windows */}
      <Modal open={switcher} onClose={() => setSwitcher(false)} title={t('mobile.openWindows')} size="sm">
        {open.length === 0 ? (
          <p className="text-[0.8125rem] text-[var(--text-secondary)]">{t('mobile.noWindows')}</p>
        ) : (
          <ul className="divide-y divide-[var(--win-border)] rounded-xl border border-[var(--win-border)]">
            {open.map((win) => (
              <li key={win.id} className="flex items-center gap-1 pr-1">
                <button
                  type="button"
                  onClick={() => {
                    focusWindow(win.id)
                    setView('app')
                    setSwitcher(false)
                  }}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 text-left"
                >
                  <AppIcon kind={win.kind} size={22} />
                  <span className="truncate text-[0.875rem] font-medium">{t(windowTitleKey(win.kind))}</span>
                </button>
                <IconButton label={t('common.close')} tone="danger" onClick={() => closeWindow(win.id)}>
                  <X className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Account */}
      <Modal open={account} onClose={() => setAccount(false)} title={user?.displayName || user?.username || t('mobile.account')} subtitle={user?.role} size="sm">
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-[0.75rem] font-medium text-[var(--text-secondary)]">{t('mobile.theme')}</p>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((mode) => (
                <Button key={mode} variant={themeMode === mode ? 'primary-soft' : 'default'} onClick={() => setThemeMode(mode)} className="flex-1">
                  {mode === 'light' ? t('mobile.themeLight') : t('mobile.themeDark')}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[0.75rem] font-medium text-[var(--text-secondary)]">{t('mobile.language')}</p>
            <div className="flex gap-2">
              {(['id', 'en'] as const).map((lang) => (
                <Button key={lang} variant={language === lang ? 'primary-soft' : 'default'} onClick={() => setLanguage(lang)} className="flex-1">
                  {lang === 'id' ? 'Indonesia' : 'English'}
                </Button>
              ))}
            </div>
          </div>
          <Button onClick={() => { setAccount(false); setIsLocked(true) }} className="w-full">
            <Lock size={14} />
            <span>{t('mobile.lock')}</span>
          </Button>
          <Button onClick={() => { setAccount(false); launch('profile') }} className="w-full">
            <User size={14} />
            <span>{t('window.profile')}</span>
          </Button>
          <Button onClick={() => setUiMode('desktop')} className="w-full">
            <Monitor size={14} />
            <span>{t('mobile.desktopView')}</span>
          </Button>
          <Button variant="danger-soft" onClick={onLogout} className="w-full">
            <LogOut size={14} />
            <span>{t('mobile.logout')}</span>
          </Button>
        </div>
      </Modal>
    </div>
  )
}
