import { create } from 'zustand'

interface PendingFile {
  path: string
  name: string
}

interface EditorStore {
  pendingFile: PendingFile | null
  setPendingFile: (file: PendingFile | null) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  pendingFile: null,
  setPendingFile: (file) => set({ pendingFile: file }),
}))
