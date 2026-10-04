import { create } from 'zustand'
import type { AuthMeV2 } from '@/api/auth'

export interface AuthState {
  authenticated: boolean
  user: AuthMeV2 | null
  setSession: (user: AuthMeV2 | null) => void
  clearSession: () => void
}

const CACHE_KEY = 'me-v2-cache'

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
  user: getInitialUser(),
  setSession: (user) => {
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
  clearSession: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CACHE_KEY)
    }
    set({ authenticated: false, user: null })
  },
}))
