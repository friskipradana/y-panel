import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LoaderCircle, ArrowLeft, Eye, EyeOff, Sun, Moon } from 'lucide-react'
import { getDemoInfo, getSetupStatus, initializeSetup, loginAgent } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { useThemeStore } from '@/store/themeStore'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'

export interface LoginPageProps {
  onLoginSuccess: (user?: { username: string; role?: string }) => void
  onBack?: () => void
}

type ScreenMode = 'login' | 'setup'

// A touch device should not open the keyboard (and hide the form) the moment the page loads
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

export function LoginPage({ onLoginSuccess, onBack }: LoginPageProps) {
  const [mode, setMode] = useState<ScreenMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { t } = useI18n()
  const themeMode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)

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

  const heading = mode === 'setup' ? t('login.firstRunSetup') : t('login.welcomeBack')

  const toggle = (shown: boolean, set: (v: boolean) => void) => (
    <IconButton
      label={shown ? t('login.hidePassword') : t('login.showPassword')}
      onClick={() => set(!shown)}
      className="absolute right-1 top-1/2 -translate-y-1/2"
    >
      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </IconButton>
  )

  return (
    <main
      className="login-page relative flex min-h-dvh w-full flex-col items-center justify-center overflow-y-auto bg-[var(--win-content-bg)] px-4 py-16 text-[var(--win-text)]"
      id="panel-login-screen"
    >
      <div className="absolute left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between">
        {onBack ? (
          <IconButton id="login-back-button" label={t('login.back')} onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
        ) : (
          <span />
        )}
        <IconButton id="login-theme-toggle" label={themeMode === 'dark' ? t('public.theme.toLight') : t('public.theme.toDark')} onClick={toggleMode}>
          {themeMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </IconButton>
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="Reneo" className="h-14 w-14 rounded-2xl" />
          <h1 className="mt-4 text-xl font-bold tracking-tight">{heading}</h1>
          <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">{statusMessage}</p>
        </div>

        <div className="rounded-2xl border border-[var(--win-border)] bg-[var(--win-bg)] p-5 shadow-[var(--panel-card-shadow)] sm:p-6">
          {setupStatusQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-[0.875rem] text-[var(--text-secondary)]">
              <LoaderCircle size={15} className="animate-spin" />
              <span>{t('login.checkingInitialConfig')}</span>
            </div>
          ) : mode === 'setup' ? (
            <form
              className="flex flex-col gap-3.5"
              onSubmit={(e) => {
                e.preventDefault()
                setupMutation.mutate()
              }}
            >
              <Field label={t('login.usernamePlaceholder')} htmlFor="panel-setup-username">
                <TextInput id="panel-setup-username" value={setupUsername} onChange={(e) => setSetupUsername(e.target.value)} autoComplete="username" />
              </Field>
              <Field label={t('login.displayNamePlaceholder')} htmlFor="panel-setup-display-name">
                <TextInput id="panel-setup-display-name" value={setupDisplayName} onChange={(e) => setSetupDisplayName(e.target.value)} autoComplete="name" />
              </Field>
              <Field label={t('login.adminEmailPlaceholder')} htmlFor="panel-setup-email">
                <TextInput id="panel-setup-email" type="email" value={setupEmail} onChange={(e) => setSetupEmail(e.target.value)} autoComplete="email" />
              </Field>
              <Field label={t('login.passwordPlaceholder')} htmlFor="panel-setup-password">
                <div className="relative">
                  <TextInput
                    id="panel-setup-password"
                    type={showSetupPassword ? 'text' : 'password'}
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    autoComplete="new-password"
                    className="pr-11"
                  />
                  {toggle(showSetupPassword, setShowSetupPassword)}
                </div>
              </Field>
              <Field label={t('login.confirmPasswordPlaceholder')} htmlFor="panel-setup-confirm-password">
                <div className="relative">
                  <TextInput
                    id="panel-setup-confirm-password"
                    type={showSetupConfirmPassword ? 'text' : 'password'}
                    value={setupConfirmPassword}
                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="pr-11"
                  />
                  {toggle(showSetupConfirmPassword, setShowSetupConfirmPassword)}
                </div>
              </Field>
              <Button id="panel-setup-submit" type="submit" variant="primary" loading={activePending} className="mt-1 !h-11 w-full">
                {t('login.createAdminAndLogin')}
              </Button>
            </form>
          ) : (
            <form
              className="flex flex-col gap-3.5"
              onSubmit={(e) => {
                e.preventDefault()
                loginMutation.mutate()
              }}
            >
              {demoFilled ? (
                <p className="rounded-lg border border-[var(--win-border)] bg-[var(--panel-surface)] px-3 py-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
                  {t('login.demoFilled')}
                </p>
              ) : null}
              <Field label={t('login.usernamePlaceholder')} htmlFor="panel-login-username">
                <TextInput id="panel-login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
              </Field>
              <Field label={t('login.passwordPlaceholder')} htmlFor="panel-login-password">
                <div className="relative">
                  <TextInput
                    id="panel-login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    autoFocus={FINE_POINTER}
                    className="pr-11"
                  />
                  {toggle(showPassword, setShowPassword)}
                </div>
              </Field>
              <Button id="panel-login-submit" type="submit" variant="primary" loading={activePending} className="mt-1 !h-11 w-full">
                {t('login.signIn')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}

// Backward compatibility export alias
export { LoginPage as LoginScreen }
