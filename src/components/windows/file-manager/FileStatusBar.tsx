import type { FileManagerState } from './useFileManager'

export function FileStatusBar({ fm }: { fm: FileManagerState }) {
  const {
    t,
    activeTab,
  } = fm

  return (
    <div className="px-4 py-2 bg-[var(--tb-hover)] border-t border-[var(--win-border)] text-[12px] text-[var(--tb-clock)] flex justify-between tracking-wide font-medium">
      <span>{activeTab.data ? t('fileManager.itemCount', { count: (activeTab.data.contents || []).length }) : t('fileManager.loadingObjects')}</span>
      {/* <span className="text-[var(--panel-success-text)]/70 font-bold uppercase flex items-center gap-1">
        Root Access
      </span> */}
    </div>
  )
}
