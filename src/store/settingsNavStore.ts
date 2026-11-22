import { create } from 'zustand'
import type { SettingsTabKey } from '@/components/windows/settings/constants'

// A request to open Settings on a given tab (from the quick search); the window takes it and clears it
interface SettingsNavState {
  tab: SettingsTabKey | null
  request: (tab: SettingsTabKey) => void
  clear: () => void
}

export const useSettingsNavStore = create<SettingsNavState>((set) => ({
  tab: null,
  request: (tab) => set({ tab }),
  clear: () => set({ tab: null }),
}))
