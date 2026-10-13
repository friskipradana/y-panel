import { Trash, X, Copy, Scissors } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FileManagerState } from './useFileManager'

export function BulkActionsBar({ fm }: { fm: FileManagerState }) {
  const {
    t,
    selectedPaths,
    setSelectedPaths,
    setClipboardBulk,
    handleBulkDelete,
  } = fm

  return (
    <AnimatePresence>
      {selectedPaths.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[var(--menu-bg)] backdrop-blur-xl border border-[var(--win-border)] text-[var(--win-text)] px-5 py-3 rounded-full shadow-[var(--file-manager-floating-shadow)] flex items-center gap-3 z-[40]"
        >
          <span className="text-[13px] font-semibold pr-3 border-r border-[var(--win-border)]">
            {t('fileManager.selectedCount', { count: selectedPaths.size })}
          </span>
          <button title={t('fileManager.move')} onClick={() => setClipboardBulk('cut')} className="flex items-center justify-center p-1.5 hover:bg-[var(--panel-surface-hover)] rounded-lg text-[var(--panel-warning-text)] transition" ><Scissors size={16} /></button>
          <button title={t('common.copy')} onClick={() => setClipboardBulk('copy')} className="flex items-center justify-center p-1.5 hover:bg-[var(--panel-surface-hover)] rounded-lg text-[var(--panel-primary-text)] transition"><Copy size={16} /></button>
          <button title={t('common.delete')} onClick={() => handleBulkDelete()} className="flex items-center justify-center p-1.5 hover:bg-[var(--panel-surface-hover)] rounded-lg text-[var(--panel-danger-text)] transition"><Trash size={16} /></button>
          <div className="w-[1px] h-4 bg-[var(--file-manager-floating-divider)] mx-1" />
          <button title={t('common.cancel')} onClick={() => setSelectedPaths(new Set())} className="flex items-center justify-center p-1.5 hover:bg-[var(--panel-surface-hover)] rounded-lg text-[var(--text-secondary)] transition"><X size={16} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
