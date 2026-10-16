import { memo } from 'react'
import { Folder, File as FileIcon } from 'lucide-react'
import type { FileNode } from './fileManagerConfig'
import { Checkbox } from '@/components/ui/Checkbox'

export const FileRow = memo(({
  item,
  isSelected,
  onToggleSelect,
  dragOverPath,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  onDoubleClick,
  formatSize,
  formatDate
}: {
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
}) => {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      className={`grid grid-cols-[30px_1fr_80px_100px_130px] mobile:grid-cols-[30px_1fr] gap-4 px-4 py-2 rounded-lg cursor-pointer transition items-center group border ${dragOverPath === item.path ? 'bg-[var(--panel-primary-hover)] border-[var(--focus-ring)] shadow-[var(--win-shadow)]' : isSelected ? 'bg-[var(--panel-primary-bg)] border-[var(--win-border)]' : 'border-transparent hover:bg-[var(--tb-hover)] hover:border-[var(--win-bar-border)]'}`}
      onDragOver={(e) => onDragOver(e, item)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, item)}
      onContextMenu={(e) => onContextMenu(e, item)}
      onDoubleClick={() => onDoubleClick(item)}
    >
      <div className="flex items-center justify-center">
        <Checkbox aria-label={item.name} checked={isSelected} onChange={(checked) => onToggleSelect(item.path, checked)} onClick={(e) => e.stopPropagation()} />
      </div>
      <div className="flex items-center gap-3 overflow-hidden">
        {item.isDir ? <Folder size={17} className="text-[var(--panel-primary-text)] fill-sky-500/20 shrink-0" /> : <FileIcon size={17} className="text-[var(--text-secondary)] shrink-0" />}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-[var(--win-text)] transition-colors group-hover:text-[var(--panel-primary-text)]">{item.name}</span>
          <span className="hidden truncate text-[11px] text-[var(--text-secondary)] mobile:block">
            {item.isDir ? '' : `${formatSize(item.size)} · `}
            {formatDate(item.modified)}
          </span>
        </span>
      </div>
      <div className="text-[12px] text-[var(--text-secondary)] p-1 font-mono tracking-tight mobile:hidden">
        {item.isDir ? '--' : formatSize(item.size)}
      </div>
      <div className="flex items-center mobile:hidden">
        <div className="text-[12px] text-[var(--tb-clock)] bg-[var(--file-manager-mode-bg)] font-mono tracking-tighter rounded max-w-full px-2 py-0.5 border border-[var(--win-bar-border)]">
          {item.mode}
        </div>
      </div>
      <div className="text-[12px] text-[var(--text-secondary)] p-1 truncate font-medium mobile:hidden">
        {formatDate(item.modified)}
      </div>
    </div>
  )
})
