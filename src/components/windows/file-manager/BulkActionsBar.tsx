import { Copy, Scissors, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FileManagerState } from './useFileManager'

// What can be done to the rows that are ticked
export function BulkActionsBar({ fm }: { fm: FileManagerState }) {
  const { t, selectedPaths, setSelectedPaths, setClipboardBulk, handleBulkDelete } = fm

  return (
    <AnimatePresence>
      {selectedPaths.size > 0 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="file-bulk">
          <span className="file-bulk__count">{t('fileManager.selectedCount', { count: selectedPaths.size })}</span>
          <button type="button" className="docker-act-btn" title={t('fileManager.move')} aria-label={t('fileManager.move')} onClick={() => setClipboardBulk('cut')}>
            <Scissors className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button type="button" className="docker-act-btn" title={t('common.copy')} aria-label={t('common.copy')} onClick={() => setClipboardBulk('copy')}>
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button type="button" className="docker-act-btn docker-act-btn--danger" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => handleBulkDelete()}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button type="button" className="docker-act-btn" title={t('common.cancel')} aria-label={t('common.cancel')} onClick={() => setSelectedPaths(new Set())}>
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
