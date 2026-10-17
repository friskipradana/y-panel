import { memo } from 'react'
import { EllipsisVertical, File as FileIcon, Folder } from 'lucide-react'
import { fileKind, type FileNode } from './fileManagerConfig'
import { ListRowIcon } from '@/components/ui/ListTable'
import { Checkbox } from '@/components/ui/Checkbox'
import { useIsMobileLayout } from '@/hooks/useIsMobileLayout'
import { useI18n } from '@/lib/i18n'

interface FileRowProps {
  item: FileNode
  isSelected: boolean
  onToggleSelect: (path: string, checked: boolean) => void
  dragOverPath: string | null
  onDragStart: (e: React.DragEvent, item: FileNode) => void
  onDragOver: (e: React.DragEvent, item: FileNode) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, item: FileNode) => void
  onContextMenu: (e: React.MouseEvent, item: FileNode) => void
  onDoubleClick: (item: FileNode) => void
  formatSize: (size: number) => string
  formatDate: (date: string) => string
  folderLabel: string
  fileLabel: string
}

// One file or folder, in the same row as a container
export const FileRow = memo(({ item, isSelected, onToggleSelect, dragOverPath, onDragStart, onDragOver, onDragLeave, onDrop, onContextMenu, onDoubleClick, formatSize, formatDate, folderLabel, fileLabel }: FileRowProps) => {
  const { t } = useI18n()
  // a phone has no double click and no right click: a tap opens, a button opens the menu
  const touch = useIsMobileLayout()
  const kind = fileKind(item, folderLabel, fileLabel)
  const summary = [item.isDir ? '' : formatSize(item.size), formatDate(item.modified)].filter(Boolean).join(' · ')
  const state = dragOverPath === item.path ? ' docker-row--drop' : isSelected ? ' docker-row--selected' : ''

  return (
    <div
      draggable
      className={`docker-row docker-row--files${state}`}
      onDragStart={(e) => onDragStart(e, item)}
      onDragOver={(e) => onDragOver(e, item)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, item)}
      onContextMenu={(e) => onContextMenu(e, item)}
      onDoubleClick={() => onDoubleClick(item)}
      onClick={touch ? () => onDoubleClick(item) : undefined}
    >
      <div className="docker-row__select">
        <Checkbox aria-label={item.name} checked={isSelected} onChange={(checked) => onToggleSelect(item.path, checked)} onClick={(e) => e.stopPropagation()} />
      </div>
      <div className="docker-row__app">
        <ListRowIcon>{item.isDir ? <Folder className="h-3.5 w-3.5" /> : <FileIcon className="h-3.5 w-3.5" />}</ListRowIcon>
        <div className="docker-row__text">
          <span className="docker-app-name" title={item.name}>{item.name}</span>
          <span className="docker-row__meta">{summary}</span>
        </div>
      </div>
      <div className="docker-cell docker-cell--mono">{kind}</div>
      <div className="docker-cell docker-cell--mono">{item.isDir ? '--' : formatSize(item.size)}</div>
      <div className="docker-cell docker-cell--mono">{item.mode}</div>
      <div className="docker-cell">{formatDate(item.modified)}</div>
      {touch ? (
        <button
          type="button"
          className="docker-act-btn"
          title={t('common.moreActions')}
          aria-label={t('common.moreActions')}
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu(e, item)
          }}
        >
          <EllipsisVertical className="h-4 w-4" strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  )
})
