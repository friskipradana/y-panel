import { useEffect, useRef } from 'react'
import { getFrontendRevision } from '@/api/agent'
import { acquireLiveSocket } from '@/lib/liveSocket'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { useLiveStore } from '@/store/liveStore'

// Reloads the page when the agent serves a newer frontend. The agent pushes the revision over the
// live socket; the page only asks for it itself while that socket is down (or not signed in yet).
export function useRevisionSync(authenticated: boolean) {
  const frontendRevisionRef = useRef<string | null>(null)

  // the socket is also what the widgets use: opening it here shares the one connection
  useEffect(() => (authenticated ? acquireLiveSocket() : undefined), [authenticated])

  useEffect(() => {
    let disposed = false

    const apply = async (nextRevision: string) => {
      if (!frontendRevisionRef.current) {
        frontendRevisionRef.current = nextRevision
        return
      }
      if (frontendRevisionRef.current === nextRevision) return

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

    const syncFrontendRevision = async () => {
      if (document.visibilityState !== 'visible') return
      // the live socket delivers it
      const live = useLiveStore.getState()
      if (live.connected && live.statePush) return

      try {
        const response = await getFrontendRevision()
        if (disposed) return
        await apply(response.revision || 'unknown')
      } catch (error) {
        runtimeLogger.warn('frontend', 'failed to check frontend revision', { error })
      }
    }

    // a revision pushed by the agent
    const unsubscribe = useLiveStore.subscribe((state, prev) => {
      if (state.revision && state.revision !== prev.revision) void apply(state.revision.revision || 'unknown')
    })
    const pushed = useLiveStore.getState().revision
    if (pushed) void apply(pushed.revision || 'unknown')
    else void syncFrontendRevision()

    const intervalId = window.setInterval(() => {
      void syncFrontendRevision()
    }, 8000)

    window.addEventListener('visibilitychange', syncFrontendRevision)

    return () => {
      disposed = true
      unsubscribe()
      window.clearInterval(intervalId)
      window.removeEventListener('visibilitychange', syncFrontendRevision)
    }
  }, [authenticated])
}
