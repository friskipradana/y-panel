import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { uploadFiles } from '@/api/agent'
import { alertLib } from '@/lib/alert'
import { useI18n } from '@/lib/i18n'
import type { FileManagerState } from './useFileManager'

export interface FileUploadState {
  count: number
  percent: number
  folder: string
}

const errorText = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e as Error)?.message ?? fallback

// Uploads files into the folder that is open. A name that is taken is kept; the files that were skipped for it are asked about
// afterwards, and only those are sent again, with overwrite on.
export function useFileUpload(fm: FileManagerState) {
  const { t } = useI18n()
  const { activeTab, activeTabId, loadDirectory } = fm
  const [upload, setUpload] = useState<FileUploadState | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)

  const start = useCallback(
    async (picked: File[]) => {
      if (busyRef.current || picked.length === 0) return
      const dir = activeTab.currentPath
      const folder = dir.split('/').filter(Boolean).pop() || '/'
      const controller = new AbortController()
      abortRef.current = controller
      busyRef.current = true
      let uploaded = 0
      let badNames = 0
      try {
        setUpload({ count: picked.length, percent: 0, folder })
        const first = await uploadFiles(dir, picked, false, (percent) => setUpload({ count: picked.length, percent, folder }), controller.signal)
        uploaded += first.uploaded.length
        badNames += first.skipped.filter((s) => s.reason === 'name').length
        const taken = new Set(first.skipped.filter((s) => s.reason === 'exists').map((s) => s.name))
        if (taken.size > 0) {
          const names = [...taken]
          const ok = await alertLib.confirm(
            t('fileManager.uploadOverwriteTitle'),
            t('fileManager.uploadOverwriteConfirm', { count: names.length, names: names.slice(0, 5).join(', ') + (names.length > 5 ? '…' : '') }),
            t('fileManager.uploadOverwrite'),
            t('common.cancel'),
            'warning',
            'file-manager',
          )
          if (ok) {
            const again = picked.filter((f) => taken.has(f.name))
            setUpload({ count: again.length, percent: 0, folder })
            const second = await uploadFiles(dir, again, true, (percent) => setUpload({ count: again.length, percent, folder }), controller.signal)
            uploaded += second.uploaded.length
          }
        }
        if (uploaded > 0) toast.success(t('fileManager.uploadDone', { count: uploaded }))
        if (badNames > 0) toast.warning(t('fileManager.uploadBadName', { count: badNames }))
      } catch (e) {
        if (!controller.signal.aborted) alertLib.fire(t('fileManager.uploadFailed'), errorText(e, t('fileManager.uploadFailed')), 'error', 'file-manager')
      } finally {
        busyRef.current = false
        setUpload(null)
        void loadDirectory(dir, activeTabId)
      }
    },
    [activeTab.currentPath, activeTabId, loadDirectory, t],
  )

  const cancel = useCallback(() => abortRef.current?.abort(), [])

  return { upload, start, cancel }
}

export type FileUpload = ReturnType<typeof useFileUpload>
