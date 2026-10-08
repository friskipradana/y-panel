import { create } from 'zustand'

interface CommandState {
  isOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void
  toggleCommandPalette: () => void
}

export const useCommandStore = create<CommandState>((set) => ({
  isOpen: false,
  openCommandPalette: () => set({ isOpen: true }),
  closeCommandPalette: () => set({ isOpen: false }),
  toggleCommandPalette: () => set((state) => ({ isOpen: !state.isOpen })),
}))
