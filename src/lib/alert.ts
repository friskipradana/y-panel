import { useAlertStore } from '@/store/alertStore'

export const alertLib = {
  /**
   * Tampilkan pop-up error atau warning
   */
  fire: (title: string, html: string, icon: 'success' | 'error' | 'warning' | 'info' | 'question' = 'info', windowId?: string) => {
    return useAlertStore.getState().openDialog({
      type: icon,
      title,
      description: html,
      confirmText: 'Tutup',
      windowId,
    })
  },

  /**
   * Tampilkan dialog konfirmasi dengan 2 tombol
   */
  confirm: async (title: string, html: string, confirmText = 'Lanjutkan', cancelText = 'Batal', _icon: 'warning' | 'question' = 'warning', windowId?: string) => {
    return useAlertStore.getState().openDialog({
      type: 'confirm',
      title,
      description: html,
      confirmText,
      cancelText,
      windowId,
    })
  },

  /**
   * Tampilkan loading state (hanya bisa ditutup via code)
   */
  showLoading: (title = 'Memproses...', html = 'Mohon tunggu sebentar', windowId?: string) => {
    return useAlertStore.getState().openDialog({
      type: 'loading',
      title,
      description: html,
      windowId,
    })
  },

  /**
   * Tutup alert/loading yang sedang aktif
   */
  close: () => {
    useAlertStore.getState().closeDialog(true)
  },
}
