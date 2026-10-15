import { Folder, Loader2 } from 'lucide-react'
import { formatSize, formatDate } from './fileManagerConfig'
import { FileRow } from './FileRow'
import type { FileManagerState } from './useFileManager'

export function FileList({ fm }: { fm: FileManagerState }) {
  const {
    t,
    activeTab,
    setMenu,
    selectedPaths,
    setSelectedPaths,
    dragOverPath,
    setDragOverPath,
    setCurrentPath,
    handleEdit,
    moveItems,
  } = fm

  return (
    <div
      className={`flex-1 overflow-y-auto p-2 border-t border-[var(--win-border)] bg-[var(--win-content-bg)] transition-colors relative ${dragOverPath === activeTab.currentPath ? 'bg-[var(--panel-primary-bg)]' : ''}`}
      onDragOver={(e) => {
        const raw = e.dataTransfer.getData('application/x-reneo-file')
        if (!raw) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverPath(activeTab.currentPath)
      }}
      onDragLeave={() => {
        if (dragOverPath === activeTab.currentPath) setDragOverPath(null)
      }}
      onDrop={async (e) => {
        const raw = e.dataTransfer.getData('application/x-reneo-file') || e.dataTransfer.getData('text/plain')
        setDragOverPath(null)
        if (!raw) return
        e.preventDefault()
        try {
          const dragged = JSON.parse(raw) as { path: string; name: string; isDir: boolean; paths?: string[] }
          const itemsToMove = dragged.paths && dragged.paths.length > 0 ? dragged.paths : [dragged.path]
          await moveItems(itemsToMove, activeTab.currentPath)
        } catch (err) { }
      }}
    >
      {/* FIX: Show loader if loading OR if we don't have data yet (initial hit) */}
      {(activeTab.loading || (!activeTab.data && !activeTab.loading)) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--win-bg)]/60 backdrop-blur-[1px] transition-opacity">
          <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl bg-[var(--win-bg)] shadow-[var(--win-shadow)] border border-[var(--win-border)]">
            <Loader2 size={24} className="animate-spin text-[var(--panel-primary-text)]" />
            <span className="text-[12px] font-semibold text-[var(--tb-clock)] uppercase tracking-widest">{t('fileManager.loadingFiles')}</span>
          </div>
        </div>
      )}

      {activeTab.data && (activeTab.data.contents || []).length === 0 && !activeTab.loading && (
        <div className="flex flex-col items-center justify-center p-14 text-[var(--text-secondary)]">
          <Folder size={46} className="mb-3 opacity-30" />
          <p className="text-[13px] font-medium opacity-80">{t('fileManager.emptyFolder')}</p>
        </div>
      )}
      {activeTab.data && (activeTab.data.contents || []).map((item) => (
        <FileRow
          key={item.path}
          item={item}
          isSelected={selectedPaths.has(item.path)}
          onToggleSelect={(p, checked) => {
            const newSet = new Set(selectedPaths)
            if (checked) newSet.add(p)
            else newSet.delete(p)
            setSelectedPaths(newSet)
          }}
          dragOverPath={dragOverPath}
          formatSize={formatSize}
          formatDate={formatDate}
          onDragStart={(e, it) => {
            e.stopPropagation()
            const drags = selectedPaths.has(it.path) ? Array.from(selectedPaths) : [it.path]
            const payload = JSON.stringify({
              path: it.path,
              name: it.name,
              isDir: it.isDir,
              isBulk: drags.length > 1,
              paths: drags
            })
            e.dataTransfer.setData('application/x-reneo-file', payload)
            e.dataTransfer.setData('text/plain', payload)
            e.dataTransfer.effectAllowed = 'move'

            if (drags.length > 1) {
              const el = document.createElement('div')
              el.className = 'fixed left-[-9999px] top-[-9999px] bg-[var(--file-manager-drag-ghost-bg)] text-[var(--win-text)] text-[12px] font-bold px-3 py-2 rounded shadow-lg backdrop-blur z-[9999]'
              el.innerText = `${drags.length} item`
              document.body.appendChild(el)
              e.dataTransfer.setDragImage(el, -10, -10)
              requestAnimationFrame(() => { if (document.body.contains(el)) document.body.removeChild(el) })
            }
          }}
          onDragOver={(e, it) => {
            if (!it.isDir) return
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            setDragOverPath(it.path)
          }}
          onDragLeave={() => {
            if (dragOverPath !== activeTab.currentPath) setDragOverPath(null)
          }}
          onDrop={async (e, it) => {
            if (!it.isDir) return
            const raw = e.dataTransfer.getData('application/x-reneo-file') || e.dataTransfer.getData('text/plain')
            setDragOverPath(null)
            if (!raw) return
            e.preventDefault()
            e.stopPropagation()
            try {
              const dragged = JSON.parse(raw) as { path: string; name: string; isDir: boolean; paths?: string[] }
              const itemsToMove = dragged.paths && dragged.paths.length > 0 ? dragged.paths : [dragged.path]
              await moveItems(itemsToMove, it.path)
            } catch (err) { }
          }}
          onContextMenu={(e, it) => {
            e.preventDefault()
            e.stopPropagation()
            setMenu({ x: e.clientX, y: e.clientY, item: it, targetPath: it.isDir ? it.path : activeTab.currentPath })
          }}
          onDoubleClick={(it) => {
            if (it.isDir) {
              setCurrentPath(it.path)
            } else {
              handleEdit(it)
            }
          }}
        />
      ))}
    </div>
  )
}
