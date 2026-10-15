import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AppRouter, LOGIN_PATH } from '@/router'
import { DevOverlay } from '@/components/debug/DevOverlay'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'
import { useRevisionSync } from '@/hooks/useRevisionSync'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/lib/i18n'
import { BootSplash } from '@/components/system/BootSplash'
import { isPublicRoute } from '@/lib/publicPaths'

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
      if (!isPublicRoute(location.pathname)) {
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
    return <BootSplash message={t('app.checkingSession')} />
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <AppRouter />
      <DevOverlay authenticated={authenticated} />
    </div>
  )
}
