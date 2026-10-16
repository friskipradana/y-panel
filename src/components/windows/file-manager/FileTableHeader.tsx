import { type FileNode } from './fileManagerConfig'
import type { FileManagerState } from './useFileManager'
import { Checkbox } from '@/components/ui/Checkbox'

export function FileTableHeader({ fm }: { fm: FileManagerState }) {
  const {
    t,
    activeTab,
    selectedPaths,
    setSelectedPaths,
  } = fm

  return (
    <div className="grid grid-cols-[30px_1fr_80px_100px_130px] mobile:grid-cols-[30px_1fr] gap-4 px-6 py-2 border-b border-[var(--win-border)] bg-[var(--tb-hover)] text-[10.5px] uppercase tracking-[0.05em] font-bold text-[var(--tb-clock)] sticky top-0">
      <div className="flex items-center justify-center">
        <Checkbox
          aria-label={t('fileManager.selectAll')}
          checked={!!(activeTab.data?.contents?.length && selectedPaths.size === activeTab.data.contents.length)}
          onChange={(checked) => {
            if (checked && activeTab.data?.contents) {
              setSelectedPaths(new Set(activeTab.data.contents.map((it: FileNode) => it.path)))
            } else {
              setSelectedPaths(new Set())
            }
          }}
        />
      </div>
      <div>{t('fileManager.nameColumn')}</div>
      <div className="mobile:hidden">{t('fileManager.sizeColumn')}</div>
      <div className="mobile:hidden">{t('fileManager.accessColumn')}</div>
      <div className="mobile:hidden">{t('fileManager.modifiedColumn')}</div>
    </div>
  )
}
