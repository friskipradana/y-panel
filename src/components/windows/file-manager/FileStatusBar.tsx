import { Eye, EyeOff } from 'lucide-react'
import { formatSize } from './fileManagerConfig'
import type { FileManagerState } from './useFileManager'

// Folder summary bar: item count, total visible file size, and quiet hidden-file toggle
export function FileStatusBar({ fm }: { fm: FileManagerState }) {
  const { t, activeTab, narrowed, showHidden, setShowHidden } = fm
  const data = activeTab.data
  const rawContents = data?.contents || []
  const visible = showHidden || activeTab.query.q ? rawContents : rawContents.filter((it) => !it.name.startsWith('.'))
  const shown = visible.length
  const totalBytes = visible.reduce((acc, it) => acc + (it.isDir ? 0 : it.size), 0)

  return (
    <div className="docker-statusbar items-center gap-2">
      <span className="flex items-center gap-2">
        <span>
          {!data
            ? t('fileManager.loadingObjects')
            : narrowed
              ? t('fileManager.itemCountOf', { shown, total: data.all ?? shown })
              : t('fileManager.itemCount', { count: shown })}
        </span>
        {data && totalBytes > 0 ? (
          <span className="panel-mono opacity-80">· {formatSize(totalBytes)}</span>
        ) : null}
      </span>

      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--win-text)] cursor-pointer"
        onClick={() => setShowHidden((v) => !v)}
      >
        {showHidden ? <Eye className="h-3.5 w-3.5" strokeWidth={1.75} /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} />}
        <span>{showHidden ? t('fileManager.hiddenShown') : t('fileManager.hiddenHidden')}</span>
      </button>
    </div>
  )
}
