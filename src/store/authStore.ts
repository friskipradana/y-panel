import { create } from 'zustand'
import { getMe, getMeV2, logoutAgent } from '@/api/agent'
import type { AuthMeV2 } from '@/api/auth'
import { runtimeLogger } from '@/lib/runtimeLogger'
import { useWindowStore } from '@/store/windowStore'

const CACHE_KEY = 'me-v2-cache'

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

  initSession: async () => {
    runtimeLogger.info('auth', 'checking existing session')
    set({ checkingSession: true })
    try {
      const basicMe = await getMe()
      if (basicMe?.username) {
        runtimeLogger.info('auth', 'existing session restored', { username: basicMe.username })
        try {
          const fullMe = await getMeV2()
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(fullMe))
          }
          set({ authenticated: true, user: fullMe, checkingSession: false })
          return true
        } catch {
          const minimalUser: AuthMeV2 = {
            id: 0,
            username: basicMe.username,
            email: '',
            role: (basicMe.role as any) || 'user',
            status: 'active',
            displayName: basicMe.username,
            avatarUrl: '',
            cloudflareStatus: 'unconfigured',
            createdAt: '',
            lastLoginAt: null,
          }
          set({
            authenticated: true,
            user: minimalUser,
            checkingSession: false,
          })
          return true
        }
      }
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(CACHE_KEY)
      }
      set({ authenticated: false, user: null, checkingSession: false })
      return false
    } catch (err: any) {
      if (err?.response?.status !== 401) {
        runtimeLogger.warn('auth', 'session check failed', { error: err })
      }
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(CACHE_KEY)
      }
      set({ authenticated: false, user: null, checkingSession: false })
      return false
    }
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
