import { type FileNode } from './fileManagerConfig'
import type { FileManagerState } from './useFileManager'

export function FileTableHeader({ fm }: { fm: FileManagerState }) {
  const {
    t,
    activeTab,
    selectedPaths,
    setSelectedPaths,
  } = fm

  return (
    <div className="grid grid-cols-[30px_1fr_80px_100px_130px] gap-4 px-6 py-2 border-b border-[var(--win-border)] bg-[var(--tb-hover)] text-[10.5px] uppercase tracking-[0.05em] font-bold text-[var(--tb-clock)] sticky top-0">
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          className="cursor-pointer accent-[var(--focus-ring)] w-3.5 h-3.5 transition-all"
          checked={!!(activeTab.data?.contents?.length && selectedPaths.size === activeTab.data.contents.length)}
          onChange={(e) => {
            if (e.target.checked && activeTab.data?.contents) {
              setSelectedPaths(new Set(activeTab.data.contents.map((it: FileNode) => it.path)))
            } else {
              setSelectedPaths(new Set())
            }
          }}
        />
      </div>
      <div>{t('fileManager.nameColumn')}</div>
      <div>{t('fileManager.sizeColumn')}</div>
      <div>{t('fileManager.accessColumn')}</div>
      <div>{t('fileManager.modifiedColumn')}</div>
    </div>
  )
}
