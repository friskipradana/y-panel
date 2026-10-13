import {
  FilePlus,
  FolderPlus,
  Edit2,
  Key,
  Download,
  Trash,
  Archive,
  PackageOpen,
  Copy,
  ClipboardPaste,
  Scissors,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FileManagerState } from './useFileManager'

export function FileContextMenu({ fm }: { fm: FileManagerState }) {
  const {
    t,
    menu,
    clipboard,
    handleEdit,
    handleDownload,
    openModal,
    setClipboardItem,
    handlePasteClipboard,
    getSafeMenuStyles,
  } = fm

  return (
    <AnimatePresence>
      {menu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className="absolute bg-[var(--menu-bg)] backdrop-blur-xl border border-[var(--menu-border)] shadow-[var(--menu-shadow)] rounded-xl py-2 z-[9998] min-w-[170px]"
          style={{ top: getSafeMenuStyles().top, left: getSafeMenuStyles().left }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="px-3 py-2 text-[12px] uppercase tracking-wider font-bold text-[var(--text-secondary)] border-b border-[var(--win-border)] mb-1 truncate max-w-[170px]">
            {menu.item ? menu.item.name : menu.targetPath}
          </div>

          {!menu.item && (
            <>
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'touch' })}>
                <FilePlus size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.newFile')}
              </button>
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'mkdir' })}>
                <FolderPlus size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.newFolder')}
              </button>
            </>
          )}

          {menu.item && !menu.item.isDir && (
            <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => handleEdit(menu.item!)}>
              <Edit2 size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.openEditor')}
            </button>
          )}

          {menu.item && (
            <>
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => setClipboardItem(menu.item!, 'cut')}>
                <Scissors size={13} className="text-[var(--text-secondary)]" /> {t('common.cut')}
              </button>
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => setClipboardItem(menu.item!, 'copy')}>
                <Copy size={13} className="text-[var(--text-secondary)]" /> {t('common.copy')}
              </button>
            </>
          )}

          {clipboard && clipboard.items.length > 0 && (
            <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-success-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => handlePasteClipboard(menu.targetPath)}>
              <ClipboardPaste size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.pasteAction', { action: clipboard.mode === 'cut' ? t('fileManager.move') : t('common.copy'), count: clipboard.items.length })}
            </button>
          )}

          {menu.item && (
            <>
              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'rename', item: menu.item! })}>
                <Edit2 size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.renameAction')}
              </button>

              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'chmod', item: menu.item! })}>
                <Key size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.permissionAction')}
              </button>

              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'compress', item: menu.item! })}>
                <Archive size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.compressAction')}
              </button>

              {/\.(zip|tar\.gz|tgz|tar)$/i.test(menu.item.name) && !menu.item.isDir && (
                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => openModal({ type: 'extract', item: menu.item! })}>
                  <PackageOpen size={13} className="text-[var(--text-secondary)]" /> {t('fileManager.extractHereAction')}
                </button>
              )}

              {!menu.item.isDir && (
                <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-primary-bg)] text-[var(--text-secondary)] font-medium transition" onClick={() => handleDownload(menu.item!)}>
                  <Download size={13} className="text-[var(--text-secondary)]" /> {t('common.download')}
                </button>
              )}

              <div className="border-t border-[var(--win-border)] my-1"></div>

              <button className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-[12.5px] hover:bg-[var(--panel-danger-bg)] text-[var(--panel-danger-text)] font-medium transition group" onClick={() => openModal({ type: 'delete', item: menu.item! })}>
                <Trash size={13} className="group-hover:scale-110 transition-transform" /> {t('fileManager.deleteAction')}
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
