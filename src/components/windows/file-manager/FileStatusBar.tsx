import type { FileManagerState } from './useFileManager'

// How many things the folder holds, and how many of them the search and filters leave
export function FileStatusBar({ fm }: { fm: FileManagerState }) {
  const { t, activeTab, narrowed } = fm
  const data = activeTab.data
  const shown = (data?.contents || []).length

  return (
    <div className="docker-statusbar">
      <span>
        {!data
          ? t('fileManager.loadingObjects')
          : narrowed
            ? t('fileManager.itemCountOf', { shown, total: data.all ?? shown })
            : t('fileManager.itemCount', { count: shown })}
      </span>
    </div>
  )
}
