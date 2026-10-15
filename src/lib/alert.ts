import { useAlertStore } from '@/store/alertStore'
import { translateNow } from '@/lib/i18n'

export const alertLib = {
  /**
   * Tampilkan pop-up error atau warning
   */
  fire: (title: string, html: string, icon: 'success' | 'error' | 'warning' | 'info' | 'question' = 'info', windowId?: string) => {
    return useAlertStore.getState().openDialog({
      type: icon,
      title,
      description: html,
      confirmText: translateNow('common.close'),
      windowId,
    })
  },

  /**
   * Tampilkan dialog konfirmasi dengan 2 tombol
   */
  confirm: async (title: string, html: string, confirmText = translateNow('alert.continue'), cancelText = translateNow('common.cancel'), _icon: 'warning' | 'question' = 'warning', windowId?: string) => {
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
  showLoading: (title = translateNow('alert.processing'), html = translateNow('alert.pleaseWait'), windowId?: string) => {
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
