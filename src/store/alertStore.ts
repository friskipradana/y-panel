import { create } from 'zustand'

export type AlertType = 'success' | 'warning' | 'error' | 'info' | 'question' | 'loading' | 'confirm'

interface DialogData {
  type: AlertType
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  windowId?: string
  resolve?: (value: boolean) => void
}

interface AlertStore {
  isOpen: boolean
  data: DialogData | null
  openDialog: (data: Omit<DialogData, 'resolve'>) => Promise<boolean>
  closeDialog: (result: boolean) => void
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  isOpen: false,
  data: null,
  openDialog: (data) => {
    return new Promise((resolve) => {
      // If there is an existing dialog, resolve it as false/dismissed immediately
      const prevData = get().data
      if (prevData?.resolve) prevData.resolve(false)
      
      set({ isOpen: true, data: { ...data, resolve } })
    })
  },
  closeDialog: (result) => {
    const { data } = get()
    if (data?.resolve) {
      data.resolve(result)
    }
    set({ isOpen: false })
  }
}))
