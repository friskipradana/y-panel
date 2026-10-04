import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AppRouter, LOGIN_PATH } from '@/router'
import { DevOverlay } from '@/shell/DevOverlay'
import { useGlobalShortcuts } from '@/shell/useGlobalShortcuts'
import { useRevisionSync } from '@/shell/useRevisionSync'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/lib/i18n'

export function AppShell() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const authenticated = useAuthStore((s) => s.authenticated)
  const checkingSession = useAuthStore((s) => s.checkingSession)
  const initSession = useAuthStore((s) => s.initSession)
  const handleSessionExpired = useAuthStore((s) => s.handleSessionExpired)

  // Initialize session check on initial mount
  useEffect(() => {
    void initSession()
  }, [initSession])

  // Session expired event listener
  useEffect(() => {
    const onSessionExpired = () => {
      handleSessionExpired()
      if (location.pathname !== LOGIN_PATH && location.pathname !== '/') {
        navigate(LOGIN_PATH, { replace: true })
      }
    }

    window.addEventListener('panel:session-expired', onSessionExpired)
    return () => {
      window.removeEventListener('panel:session-expired', onSessionExpired)
    }
  }, [location.pathname, navigate, handleSessionExpired])

  // Background side-effects
  useGlobalShortcuts(authenticated)
  useRevisionSync(authenticated)

  if (checkingSession) {
    return (
      <div className="min-h-screen grid place-items-center text-[var(--app-overlay-text)] login-shell">
        <div className="glass-panel rounded-[28px] px-8 py-6 text-sm text-[var(--app-glass-muted-text)]">
          {t('app.checkingSession')}
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <AppRouter />
      <DevOverlay authenticated={authenticated} />
    </div>
  )
}
