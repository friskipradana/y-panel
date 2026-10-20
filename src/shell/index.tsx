import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AppRouter, LOGIN_PATH } from '@/router'
import { DevOverlay } from '@/components/debug/DevOverlay'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'
import { useRevisionSync } from '@/hooks/useRevisionSync'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/lib/i18n'
import { BootSplash } from '@/components/system/BootSplash'
import { PasswordGate } from '@/components/system/PasswordGate'
import { UpdateProgressModal } from '@/components/system/UpdateProgressModal'
import { getUpdateStatus } from '@/api/system'
import { useUpdateProgress } from '@/store/updateStore'
import { isPublicRoute } from '@/lib/publicPaths'

export function AppShell() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const authenticated = useAuthStore((s) => s.authenticated)
  const checkingSession = useAuthStore((s) => s.checkingSession)
  const initSession = useAuthStore((s) => s.initSession)
  const mustChangePassword = useAuthStore((s) => s.authenticated && !!s.user?.mustChangePassword)
  const handleSessionExpired = useAuthStore((s) => s.handleSessionExpired)

  // Initialize session check on initial mount
  useEffect(() => {
    void initSession()
  }, [initSession])

  // An update started earlier (or from another tab) keeps its progress dialog after a reload
  const userRole = useAuthStore((s) => s.user?.role)
  const showUpdate = useUpdateProgress((s) => s.show)
  useEffect(() => {
    if (!authenticated || (userRole !== 'admin' && userRole !== 'superadmin')) return
    let cancelled = false
    getUpdateStatus()
      .then((status) => {
        if (!cancelled && status.state === 'running') showUpdate()
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [authenticated, userRole, showUpdate])

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

  // a public page does not wait for the answer: it shows at once and the check goes on beside it
  if (checkingSession && !isPublicRoute(location.pathname)) {
    return <BootSplash message={t('app.checkingSession')} />
  }

  // an account with a password from an admin sees nothing else until it has chosen its own
  if (mustChangePassword) {
    return <PasswordGate />
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <AppRouter />
      <DevOverlay authenticated={authenticated} />
      <UpdateProgressModal />
    </div>
  )
}
