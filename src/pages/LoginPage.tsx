import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  LoaderCircle, ArrowRight, ArrowLeft, Eye, EyeOff, Sun, Moon
} from 'lucide-react'
import { getDemoInfo, getSetupStatus, initializeSetup, loginAgent } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { useThemeStore } from '@/store/themeStore'

export interface LoginPageProps {
  onLoginSuccess: (user?: { username: string; role?: string }) => void
  onBack?: () => void
}

type ScreenMode = 'login' | 'setup'

const pillStyle = {
  background: 'var(--login-panel-bg)',
  backdropFilter: 'blur(30px)',
} as const

// A touch device should not open the keyboard (and hide the form) the moment the page loads
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

export function LoginPage({ onLoginSuccess, onBack }: LoginPageProps) {
  const [mode, setMode] = useState<ScreenMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { t } = useI18n()
  const {
    mode: themeMode,
    toggleMode,
    getBackgroundStyle,
    wallpaper,
    wallpaperFit,
    customImageUrl,
    syncCustomImage,
  } = useThemeStore()

  useEffect(() => {
    void syncCustomImage()
  }, [syncCustomImage])

  const backgroundStyle = useMemo(
    () => getBackgroundStyle(),
    [getBackgroundStyle, themeMode, wallpaper, wallpaperFit, customImageUrl],
  )

  const [setupUsername, setSetupUsername] = useState('')
  const [setupEmail, setSetupEmail] = useState('')
  const [setupPassword, setSetupPassword] = useState('')
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('')
  const [setupDisplayName, setSetupDisplayName] = useState('')
  const [showSetupPassword, setShowSetupPassword] = useState(false)
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false)

  const setupStatusQuery = useQuery({
    queryKey: ['panel', 'setup-status'],
    queryFn: getSetupStatus,
    retry: 1,
  })

  // Arriving from the landing page's demo button: the demo account fills the form
  const wantsDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1'
  const demoQuery = useQuery({ queryKey: ['public-demo'], queryFn: getDemoInfo, enabled: wantsDemo, staleTime: 5 * 60_000, retry: false })
  const demoFilled = wantsDemo && !!demoQuery.data?.enabled && !!demoQuery.data.username
  useEffect(() => {
    const info = demoQuery.data
    if (!wantsDemo || !info?.enabled || !info.username || !info.password) return
    setUsername(info.username)
    setPassword(info.password)
  }, [wantsDemo, demoQuery.data])

  useEffect(() => {
    if (setupStatusQuery.data) {
      setMode(setupStatusQuery.data.needsSetup ? 'setup' : 'login')
    }
  }, [setupStatusQuery.data])

  const loginMutation = useMutation({
    mutationFn: () => {
      runtimeLogger.info('auth', 'login requested', { username: username.trim() })
      return loginAgent(username.trim(), password)
    },
    onSuccess: (result) => {
      runtimeLogger.info('auth', 'login succeeded', result)
      setPassword('')
      onLoginSuccess(result)
    },
    onError: (error: any) => {
      runtimeLogger.error('auth', 'login failed', error)
      setPassword('')
      toast.error(t('login.failedTitle'), {
        description: error?.response?.data?.error ?? t('login.failedDescription'),
      })
    },
  })

  const setupMutation = useMutation({
    mutationFn: () => {
      runtimeLogger.info('auth', 'first-run setup requested', { username: setupUsername.trim() })
      return initializeSetup({
        username: setupUsername.trim(),
        email: setupEmail.trim(),
        password: setupPassword,
        confirmPassword: setupConfirmPassword,
        displayName: setupDisplayName.trim(),
      })
    },
    onSuccess: (result) => {
      runtimeLogger.info('auth', 'first-run setup succeeded', result)
      setSetupPassword('')
      setSetupConfirmPassword('')
      onLoginSuccess(result)
    },
    onError: (error) => {
      runtimeLogger.error('auth', 'first-run setup failed', error)
      setSetupPassword('')
      setSetupConfirmPassword('')
    },
  })

  const activePending = mode === 'setup' ? setupMutation.isPending : loginMutation.isPending

  const statusMessage = useMemo(() => {
    if (setupStatusQuery.isLoading) return t('login.checkingPanelStatus')
    if (mode === 'setup') return t('login.setupRequiredStatus')
    return t('login.loginStatus')
  }, [mode, setupStatusQuery.isLoading, t])

  return (
    <main className="login-page relative w-full h-full min-h-dvh overflow-hidden" id="panel-login-screen">
      {/* Dynamic wallpaper background layer */}
      <div className="absolute inset-0 z-0" style={backgroundStyle} />
      {/* Ambient background contrast overlay */}
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px] z-[1] pointer-events-none" />
      {onBack ? (
        <button
          id="login-back-button"
          type="button"
          onClick={onBack}
          title={t('login.back')}
          style={pillStyle}
          className="absolute top-[max(1.5rem,env(safe-area-inset-top))] left-6 z-30 flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-full border login-pill login-pill-shadow text-[var(--win-text)] opacity-80 hover:opacity-100 cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
      ) : null}

      {/* Floating Theme Toggle (Top Right) */}
      <div className="absolute top-[max(1.5rem,env(safe-area-inset-top))] right-6 z-30 flex items-center gap-2">
        <button
          id="login-theme-toggle"
          type="button"
          onClick={toggleMode}
          title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={pillStyle}
          className="flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-full border login-pill login-pill-shadow text-[var(--win-text)] opacity-80 hover:opacity-100 cursor-pointer transition-all duration-150"
        >
          {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center justify-center gap-1 px-6 pb-20 z-10 max-sm:pb-12">
        <img src="/favicon.svg" alt="Reneo" className="mb-4 h-20 w-20 rounded-[1.375rem] shadow-2xl ring-1 ring-white/25" />

        <div className="mb-3 text-center px-4">
          <p className="text-base font-bold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]">
            {mode === 'setup' ? t('login.firstRunSetup') : t('login.welcomeBack')}
          </p>
          <p className="mt-1 text-[12.5px] font-medium text-slate-200 drop-shadow-[0_1px_6px_rgba(0,0,0,0.75)]">
            {statusMessage}
          </p>
        </div>

        {setupStatusQuery.isLoading ? (
          <div className="mt-2 flex items-center gap-2 rounded-full border px-4 py-2 text-sm login-pill" style={pillStyle}>
            <LoaderCircle size={14} className="animate-spin" />
            <span>{t('login.checkingInitialConfig')}</span>
          </div>
        ) : mode === 'setup' ? (
          <form
            className="w-[min(22rem,calc(100vw-3rem))] flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              setupMutation.mutate()
            }}
          >
            <div className="relative overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-username"
                type="text"
                value={setupUsername}
                onChange={(e) => setSetupUsername(e.target.value)}
                className="w-full bg-transparent px-4 py-3 text-base font-medium tracking-wide outline-none login-input sm:py-2 sm:text-sm"
                placeholder={t('login.usernamePlaceholder')}
                autoComplete="username"
              />
            </div>

            <div className="relative overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-display-name"
                type="text"
                value={setupDisplayName}
                onChange={(e) => setSetupDisplayName(e.target.value)}
                className="w-full bg-transparent px-4 py-3 text-base font-medium tracking-wide outline-none login-input sm:py-2 sm:text-sm"
                placeholder={t('login.displayNamePlaceholder')}
                autoComplete="name"
              />
            </div>

            <div className="relative overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-email"
                type="email"
                value={setupEmail}
                onChange={(e) => setSetupEmail(e.target.value)}
                className="w-full bg-transparent px-4 py-3 text-base font-medium tracking-wide outline-none login-input sm:py-2 sm:text-sm"
                placeholder={t('login.adminEmailPlaceholder')}
                autoComplete="email"
              />
            </div>

            <div className="relative flex items-center overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-password"
                type={showSetupPassword ? 'text' : 'password'}
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                className="w-full bg-transparent pl-4 pr-12 py-3 text-base font-medium tracking-wider outline-none login-input sm:pr-10 sm:py-2 sm:text-sm"
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 flex h-8 w-8 items-center justify-center transition-colors login-icon-button sm:h-auto sm:w-auto"
                onClick={() => setShowSetupPassword(!showSetupPassword)}
                title={showSetupPassword ? t('login.hidePassword') : t('login.showPassword')}
              >
                {showSetupPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <div className="relative flex items-center overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-setup-confirm-password"
                type={showSetupConfirmPassword ? 'text' : 'password'}
                value={setupConfirmPassword}
                onChange={(e) => setSetupConfirmPassword(e.target.value)}
                className="w-full bg-transparent pl-4 pr-12 py-3 text-base font-medium tracking-wider outline-none login-input sm:pr-10 sm:py-2 sm:text-sm"
                placeholder={t('login.confirmPasswordPlaceholder')}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 flex h-8 w-8 items-center justify-center transition-colors login-icon-button sm:h-auto sm:w-auto"
                onClick={() => setShowSetupConfirmPassword(!showSetupConfirmPassword)}
                title={showSetupConfirmPassword ? t('login.hidePassword') : t('login.showPassword')}
              >
                {showSetupConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <button
              id="panel-setup-submit"
              type="submit"
              className="mt-1 rounded-full border px-4 py-3 text-base font-medium transition-all sm:py-2 sm:text-sm disabled:cursor-not-allowed disabled:opacity-70 login-submit-wide login-pill-shadow"
              disabled={activePending}
            >
              {activePending ? t('login.processing') : t('login.createAdminAndLogin')}
            </button>
          </form>
        ) : (
          <form
            className="w-[min(20rem,calc(100vw-3rem))] flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              loginMutation.mutate()
            }}
          >
            {demoFilled ? (
              <p className="px-2 text-center text-[0.75rem] leading-relaxed text-[var(--text-secondary)]">{t('login.demoFilled')}</p>
            ) : null}
            <div className="relative overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-transparent px-4 py-3 text-base font-medium tracking-wide outline-none login-input sm:py-2 sm:text-sm"
                placeholder={t('login.usernamePlaceholder')}
                autoComplete="username"
              />
            </div>

            <div className="relative flex items-center overflow-hidden rounded-full border login-pill login-pill-shadow" style={pillStyle}>
              <input
                id="panel-login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent pl-4 pr-24 py-3 text-base font-medium tracking-wider outline-none login-input sm:pr-16 sm:py-2 sm:text-sm"
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                autoFocus={FINE_POINTER}
              />

              <button
                type="button"
                className="absolute right-12 flex h-8 w-8 items-center justify-center transition-colors login-icon-button sm:right-8 sm:h-auto sm:w-auto"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>

              <button
                id="panel-login-submit"
                type="submit"
                className="absolute right-1.5 flex h-[2.25rem] w-[2.25rem] items-center justify-center rounded-full border shadow-sm transition-all login-submit-round sm:right-1 sm:h-6 sm:w-6"
                disabled={activePending}
              >
                {activePending ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowRight size={14} strokeWidth={2.5} />}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}

// Backward compatibility export alias
export { LoginPage as LoginScreen }
