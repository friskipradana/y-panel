import { create } from 'zustand'

// The update progress dialog is global: it must sit above windows, alerts and the phone shell.
interface UpdateProgressStore {
  open: boolean
  show: () => void
  hide: () => void
}

export const useUpdateProgress = create<UpdateProgressStore>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))
