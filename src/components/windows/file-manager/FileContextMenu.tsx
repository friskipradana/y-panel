import { Archive, ClipboardPaste, Copy, Download, FilePlus, FolderPlus, Key, PackageOpen, Pencil, Scissors, SquarePen, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FileManagerState } from './useFileManager'

function MenuItem({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" className={`file-menu__item${danger ? ' file-menu__item--danger' : ''}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

const ARCHIVE = /\.(zip|tar\.gz|tgz|tar)$/i
const ICON = { size: 14, strokeWidth: 1.75 }

// The menu of a right click: on a file or folder, or on the empty space of the open folder
export function FileContextMenu({ fm }: { fm: FileManagerState }) {
  const { t, menu, clipboard, handleEdit, handleDownload, openModal, setClipboardItem, handlePasteClipboard, getSafeMenuStyles } = fm
  const item = menu?.item
  const position = getSafeMenuStyles()

  return (
    <AnimatePresence>
      {menu ? (
        <motion.div
          role="menu"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.1 }}
          className="file-menu"
          style={{ top: position.top, left: position.left }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="file-menu__title" title={item ? item.name : menu.targetPath}>{item ? item.name : menu.targetPath}</div>

          {!item ? (
            <div className="file-menu__group">
              <MenuItem icon={<FilePlus {...ICON} />} label={t('fileManager.newFile')} onClick={() => openModal({ type: 'touch' })} />
              <MenuItem icon={<FolderPlus {...ICON} />} label={t('fileManager.newFolder')} onClick={() => openModal({ type: 'mkdir' })} />
            </div>
          ) : (
            <div className="file-menu__group">
              {!item.isDir ? <MenuItem icon={<SquarePen {...ICON} />} label={t('fileManager.openEditor')} onClick={() => handleEdit(item)} /> : null}
              {!item.isDir ? <MenuItem icon={<Download {...ICON} />} label={t('common.download')} onClick={() => handleDownload(item)} /> : null}
              <MenuItem icon={<Scissors {...ICON} />} label={t('common.cut')} onClick={() => setClipboardItem(item, 'cut')} />
              <MenuItem icon={<Copy {...ICON} />} label={t('common.copy')} onClick={() => setClipboardItem(item, 'copy')} />
            </div>
          )}

          {clipboard && clipboard.items.length > 0 ? (
            <div className="file-menu__group">
              <MenuItem
                icon={<ClipboardPaste {...ICON} />}
                label={t('fileManager.pasteAction', { action: clipboard.mode === 'cut' ? t('fileManager.move') : t('common.copy'), count: clipboard.items.length })}
                onClick={() => handlePasteClipboard(menu.targetPath)}
              />
            </div>
          ) : null}

          {item ? (
            <>
              <div className="file-menu__group">
                <MenuItem icon={<Pencil {...ICON} />} label={t('fileManager.renameAction')} onClick={() => openModal({ type: 'rename', item })} />
                <MenuItem icon={<Key {...ICON} />} label={t('fileManager.permissionAction')} onClick={() => openModal({ type: 'chmod', item })} />
                <MenuItem icon={<Archive {...ICON} />} label={t('fileManager.compressAction')} onClick={() => openModal({ type: 'compress', item })} />
                {ARCHIVE.test(item.name) && !item.isDir ? <MenuItem icon={<PackageOpen {...ICON} />} label={t('fileManager.extractHereAction')} onClick={() => openModal({ type: 'extract', item })} /> : null}
              </div>
              <div className="file-menu__group">
                <MenuItem danger icon={<Trash2 {...ICON} />} label={t('fileManager.deleteAction')} onClick={() => openModal({ type: 'delete', item })} />
              </div>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
