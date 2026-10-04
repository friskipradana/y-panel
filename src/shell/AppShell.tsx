import { Suspense, lazy, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppRouter, LOGIN_PATH, HOME_PATH } from '@/router'
import { canAccessWindow } from '@/components/desktop/Desktop'
import { useWindowStore } from '@/store/windowStore'
import { useAuthStore } from '@/store/authStore'
import { getFrontendRevision, getMe, getMeV2 } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'
import type { WindowKind } from '@/types'
import { useI18n } from '@/lib/i18n'

const SHOW_DEBUG_OVERLAY =
  import.meta.env.DEV && import.meta.env.VITE_SHOW_DEBUG_OVERLAY === 'true'

const DebugPanel = SHOW_DEBUG_OVERLAY
  ? lazy(() => import('@/components/debug/DebugPanel').then((module) => ({ default: module.DebugPanel })))
  : null
const DebugGrid = SHOW_DEBUG_OVERLAY
  ? lazy(() => import('@/components/debug/DebugGrid').then((module) => ({ default: module.DebugGrid })))
  : null

export function AppShell() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { authenticated, setSession, clearSession } = useAuthStore()
  const frontendRevisionRef = useRef<string | null>(null)

  const { data: me, isLoading: checkingSession, error: sessionError } = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      runtimeLogger.info('auth', 'checking existing session')
      return await getMe()
    },
    retry: false,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (checkingSession) return

    if (me) {
      runtimeLogger.info('auth', 'existing session restored', { username: me.username })
      void getMeV2()
        .then((fullMe) => {
          setSession(fullMe)
          queryClient.setQueryData(['me-v2'], fullMe)
        })
        .catch(() => {
          clearSession()
        })
    } else {
      if (sessionError && (sessionError as any)?.response?.status !== 401) {
        runtimeLogger.warn('auth', 'session check failed', { error: sessionError })
      }
      clearSession()
    }
  }, [me, checkingSession, sessionError, queryClient, setSession, clearSession])

  useEffect(() => {
    const handleSessionExpired = () => {
      runtimeLogger.warn('auth', 'session expired, resetting shell state')
      useWindowStore.getState().resetWindows()
      clearSession()
      queryClient.setQueryData(['auth', 'session'], null)
      queryClient.setQueryData(['me-v2'], null)
      queryClient.clear()
      if (location.pathname !== LOGIN_PATH && location.pathname !== '/') {
        navigate(LOGIN_PATH, { replace: true })
      }
    }

    window.addEventListener('panel:session-expired', handleSessionExpired)
    return () => {
      window.removeEventListener('panel:session-expired', handleSessionExpired)
    }
  }, [location.pathname, navigate, queryClient, clearSession])

  useEffect(() => {
    let disposed = false

    const syncFrontendRevision = async () => {
      if (document.visibilityState !== 'visible') return

      try {
        const response = await getFrontendRevision()
        if (disposed) return

        const nextRevision = response.revision || 'unknown'
        if (!frontendRevisionRef.current) {
          frontendRevisionRef.current = nextRevision
          return
        }

        if (frontendRevisionRef.current !== nextRevision) {
          runtimeLogger.info('frontend', 'new deployed frontend revision detected, reloading client', {
            previousRevision: frontendRevisionRef.current,
            nextRevision,
          })
          frontendRevisionRef.current = nextRevision

          if ('caches' in window) {
            try {
              const cacheNames = await caches.keys()
              await Promise.all(cacheNames.map((name) => caches.delete(name)))
            } catch (e) {
              runtimeLogger.warn('frontend', 'failed to clear caches', { error: e })
            }
          }

          window.location.reload()
        }
      } catch (error) {
        runtimeLogger.warn('frontend', 'failed to check frontend revision', { error })
      }
    }

    void syncFrontendRevision()
    const intervalId = window.setInterval(() => {
      void syncFrontendRevision()
    }, 8000)

    window.addEventListener('visibilitychange', syncFrontendRevision)

    return () => {
      disposed = true
      window.clearInterval(intervalId)
      window.removeEventListener('visibilitychange', syncFrontendRevision)
    }
  }, [authenticated])

  const handleLoginSuccess = async (userData?: { username: string; role?: string }) => {
    runtimeLogger.info('auth', 'login success propagated to app shell', { username: userData?.username })
    const sessionUser = userData || { username: 'admin', role: 'admin' }
    queryClient.setQueryData(['auth', 'session'], sessionUser)
    try {
      const fullMe = await getMeV2()
      setSession(fullMe)
      queryClient.setQueryData(['me-v2'], fullMe)
      queryClient.setQueryData(['auth', 'session'], { username: fullMe.username, role: fullMe.role })
    } catch {
      clearSession()
    }
    navigate(HOME_PATH, { replace: true })
  }

  const handleLogout = () => {
    runtimeLogger.info('auth', 'manual logout requested from desktop')
    useWindowStore.getState().resetWindows()
    clearSession()
    queryClient.setQueryData(['auth', 'session'], null)
    queryClient.setQueryData(['me-v2'], null)
    queryClient.clear()
    if ('caches' in window) {
      void caches.keys().then((cacheNames) => Promise.all(cacheNames.map((name) => caches.delete(name))))
    }
    navigate(LOGIN_PATH, { replace: true })
  }

  // Global Keyboard Shortcuts
  useEffect(() => {
    if (!authenticated) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isTyping = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable
      if (isTyping && e.key !== 'Escape') return

      const { openWindow, closeWindow, focusedId } = useWindowStore.getState()
      const userRole = useAuthStore.getState().user?.role ?? null
      const tryOpenWindow = (kind: WindowKind) => {
        if (!canAccessWindow(kind, userRole)) return
        openWindow(kind)
      }

      if (userRole && e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        tryOpenWindow('host-terminal')
      }
      if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        tryOpenWindow('file-manager')
      }
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        tryOpenWindow('settings')
      }
      if (e.altKey && e.key.toLowerCase() === 'u') {
        e.preventDefault()
        tryOpenWindow('users')
      }
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        tryOpenWindow('projects')
      }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        tryOpenWindow('changelog')
      }
      if (e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (focusedId) closeWindow(focusedId)
      }
      if (e.key === 'Escape' && focusedId) {
        closeWindow(focusedId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [authenticated])

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
      <AppRouter
        authenticated={authenticated}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
      />

      {SHOW_DEBUG_OVERLAY && DebugPanel && DebugGrid && authenticated && location.pathname === HOME_PATH ? (
        <Suspense fallback={null}>
          <DebugPanel />
          <DebugGrid />
        </Suspense>
      ) : null}
    </div>
  )
}
