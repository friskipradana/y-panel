import { create } from 'zustand'
import { getMeV2, logoutAgent, probeMe } from '@/api/agent'
import type { AuthMeV2 } from '@/api/auth'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { useWindowStore } from '@/store/windowStore'

const CACHE_KEY = 'me-v2-cache'

let pendingSession: Promise<boolean> | null = null

export interface AuthState {
  authenticated: boolean
  checkingSession: boolean
  user: AuthMeV2 | null

  // Actions
  initSession: () => Promise<boolean>
  loginSuccess: (userFallback?: { username: string; role?: string }) => Promise<void>
  logout: () => Promise<void>
  handleSessionExpired: () => void
  setUser: (user: AuthMeV2 | null) => void
}

function getInitialUser(): AuthMeV2 | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as AuthMeV2) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  authenticated: false,
  checkingSession: true,
  user: getInitialUser(),

  initSession: () => {
    // one check at a time: a second call (React StrictMode mounts twice) shares the first one's answer
    if (pendingSession) return pendingSession
    runtimeLogger.info('auth', 'checking existing session')
    set({ checkingSession: true })
    pendingSession = (async () => {
      try {
        const me = await probeMe()
        if (me?.username) {
          runtimeLogger.info('auth', 'existing session restored', { username: me.username })
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(me))
          }
          set({ authenticated: true, user: me, checkingSession: false })
          return true
        }
      } catch (err: any) {
        if (err?.response?.status !== 401) {
          runtimeLogger.warn('auth', 'session check failed', { error: err })
        }
      }
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(CACHE_KEY)
      }
      set({ authenticated: false, user: null, checkingSession: false })
      return false
    })().finally(() => {
      pendingSession = null
    })
    return pendingSession
  },

  loginSuccess: async (userFallback) => {
    runtimeLogger.info('auth', 'login success propagated to authStore', { username: userFallback?.username })
    try {
      const fullMe = await getMeV2()
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(fullMe))
      }
      set({ authenticated: true, user: fullMe, checkingSession: false })
    } catch {
      const fallbackUser: AuthMeV2 = {
        id: 0,
        username: userFallback?.username || 'admin',
        email: '',
        role: (userFallback?.role as any) || 'admin',
        status: 'active',
        displayName: userFallback?.username || 'admin',
        avatarUrl: '',
        cloudflareStatus: 'unconfigured',
        createdAt: '',
        lastLoginAt: null,
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(fallbackUser))
      }
      set({ authenticated: true, user: fallbackUser, checkingSession: false })
    }
  },

  logout: async () => {
    runtimeLogger.info('auth', 'logout requested')
    try {
      await logoutAgent()
    } catch (e) {
      runtimeLogger.warn('auth', 'logout api call failed, continuing local cleanup', { error: e })
    } finally {
      useWindowStore.getState().resetWindows()
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(CACHE_KEY)
        if ('caches' in window) {
          void caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name))))
        }
      }
      set({ authenticated: false, user: null })
    }
  },

  handleSessionExpired: () => {
    runtimeLogger.warn('auth', 'session expired, resetting store state')
    useWindowStore.getState().resetWindows()
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CACHE_KEY)
    }
    set({ authenticated: false, user: null })
  },

  setUser: (user) => {
    if (user) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(user))
      }
      set({ authenticated: true, user })
    } else {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(CACHE_KEY)
      }
      set({ authenticated: false, user: null })
    }
  },
}))
