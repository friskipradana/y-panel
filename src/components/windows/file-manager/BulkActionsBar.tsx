import { CheckSquare, Copy, Scissors, Trash2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatSize } from './fileManagerConfig'
import type { FileManagerState } from './useFileManager'

// Bulk selection bar for ticked files/folders: select all, cut, copy, delete selected, cancel
export function BulkActionsBar({ fm }: { fm: FileManagerState }) {
  const { t, activeTab, selectedPaths, setSelectedPaths, setClipboardBulk, handleBulkDelete, modalLoading } = fm
  const contents = activeTab.data?.contents ?? []
  const selectedSize = contents
    .filter((it) => selectedPaths.has(it.path) && !it.isDir)
    .reduce((acc, it) => acc + it.size, 0)
  const allSelected = contents.length > 0 && selectedPaths.size >= contents.length

  return (
    <AnimatePresence>
      {selectedPaths.size > 0 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="file-bulk">
          <span className="file-bulk__count">
            {t('fileManager.selectedCount', { count: selectedPaths.size })}
            {selectedSize > 0 ? ` · ${formatSize(selectedSize)}` : ''}
          </span>
          <button
            type="button"
            className="docker-act-btn"
            title={allSelected ? t('fileManager.cleanup.deselectAll') : t('fileManager.selectAll')}
            aria-label={allSelected ? t('fileManager.cleanup.deselectAll') : t('fileManager.selectAll')}
            onClick={() => setSelectedPaths(allSelected ? new Set() : new Set(contents.map((it) => it.path)))}
          >
            <CheckSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button type="button" className="docker-act-btn" title={t('fileManager.move')} aria-label={t('fileManager.move')} onClick={() => setClipboardBulk('cut')}>
            <Scissors className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button type="button" className="docker-act-btn" title={t('common.copy')} aria-label={t('common.copy')} onClick={() => setClipboardBulk('copy')}>
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="panel-btn panel-btn--danger !h-7 !px-2.5 text-[11px]"
            disabled={modalLoading}
            onClick={() => void handleBulkDelete()}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{t('fileManager.deleteSelectedShort', { count: selectedPaths.size })}</span>
          </button>
          <button type="button" className="docker-act-btn" title={t('common.cancel')} aria-label={t('common.cancel')} onClick={() => setSelectedPaths(new Set())}>
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
