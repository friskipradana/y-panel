import { Folder } from 'lucide-react'
import { ListState, ListTable } from '@/components/ui/ListTable'
import { Checkbox } from '@/components/ui/Checkbox'
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
    fileColumn,
    narrowed,
  } = fm

  const contents = activeTab.data?.contents || []

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col transition-colors ${dragOverPath === activeTab.currentPath ? 'bg-[var(--panel-primary-bg)]' : ''} ${activeTab.loading && activeTab.data ? 'opacity-60' : ''}`}
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
      <ListTable
        variant="files"
        empty={!activeTab.data || activeTab.failed || contents.length === 0}
        columns={[
          {
            label: t('fileManager.selectAll'),
            node: (
              <Checkbox
                aria-label={t('fileManager.selectAll')}
                checked={contents.length > 0 && selectedPaths.size === contents.length}
                onChange={(checked) => setSelectedPaths(checked ? new Set(contents.map((it) => it.path)) : new Set())}
              />
            ),
          },
          fileColumn('name', t('fileManager.nameColumn'), { filterable: false }),
          fileColumn('type', t('fileManager.typeColumn'), { labelOf: (v) => (v === 'folder' ? t('fileManager.type.folder') : v === 'file' ? t('fileManager.type.file') : v) }),
          fileColumn('size', t('fileManager.sizeColumn'), { labelOf: (v) => t(`fileManager.size.${v}`) }),
          fileColumn('mode', t('fileManager.accessColumn')),
          fileColumn('modified', t('fileManager.modifiedColumn'), { labelOf: (v) => t(`fileManager.age.${v}`) }),
        ]}
      >
        <ListState
          loading={!activeTab.data && !activeTab.failed}
          error={activeTab.failed}
          errorTitle={t('fileManager.readDirectoryFailed')}
          errorHint={t('fileManager.readDirectoryFailedHint')}
          loadingText={t('fileManager.loadingFiles')}
          empty={contents.length === 0}
          emptyIcon={<Folder />}
          emptyTitle={narrowed ? t('docker.noResults') : t('fileManager.emptyFolder')}
        >
          {(activeTab.data?.contents || []).map((item) => (
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
          folderLabel={t('fileManager.type.folder')}
          fileLabel={t('fileManager.type.file')}
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
        </ListState>
      </ListTable>
    </div>
  )
}
