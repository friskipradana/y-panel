import { useEffect, useRef } from 'react'
import { getFrontendRevision } from '@/api/agent'
import { runtimeLogger } from '@/lib/runtimeLogger'

export function useRevisionSync(authenticated: boolean) {
  const frontendRevisionRef = useRef<string | null>(null)

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
}
